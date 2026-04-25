//! `worm deploy` subcommand — deploy contracts across chains via Wormhole.
//!
//! Subcommands:
//! - `address` — compute a CREATE2 address offline (no key required)
//! - `multi`   — deploy bytecode to multiple chains in one source transaction
//! - `call`    — send a cross-chain function call through WormDeployer
//! - `upgrade` — upgrade a UUPS proxy across chains
//! - `status`  — check per-chain deployment status

use std::io::{self, BufRead};

use clap::{Args, Subcommand};
use wormhole_sdk::{
    deploy::{
        artifact::{parse_artifact_json, parse_bytecode_hex},
        create2::{compute_create2_address, salt_from_str},
        registry::ChainRegistry,
        status::check_contract_deployed,
        CallParams, DeployParams, UpgradeParams,
    },
};

use crate::output;

// ── top-level Args / Command ──────────────────────────────────────────────────

/// Deploy contracts to multiple chains via Wormhole.
#[derive(Debug, Args)]
pub struct DeployArgs {
    #[command(subcommand)]
    pub subcommand: DeployCommand,
}

/// `worm deploy` subcommands.
#[derive(Debug, Subcommand)]
pub enum DeployCommand {
    /// Compute the CREATE2 address for a contract offline (no transaction, no key required).
    Address(AddressArgs),
    /// Deploy bytecode to one or more chains in a single source transaction.
    Multi(MultiArgs),
    /// Send a cross-chain function call through the WormDeployer hub.
    Call(CallArgs),
    /// Upgrade a UUPS proxy to a new implementation across chains.
    Upgrade(UpgradeArgs),
    /// Check per-chain deployment status at a known contract address.
    Status(StatusArgs),
}

// ── per-subcommand Args structs ───────────────────────────────────────────────

/// Arguments for `worm deploy address`.
#[derive(Debug, Args)]
pub struct AddressArgs {
    /// Path to a Hardhat or Foundry artifact JSON file.
    #[arg(long, conflicts_with = "bytecode")]
    pub artifact: Option<String>,
    /// Raw hex bytecode (0x-prefixed). Use instead of --artifact.
    #[arg(long, conflicts_with = "artifact")]
    pub bytecode: Option<String>,
    /// CREATE2 salt string (keccak256'd) or 0x-prefixed 32-byte hex.
    #[arg(long)]
    pub salt: String,
    /// Source chain name (used to look up the WormDeployer deployer address).
    #[arg(long, default_value = "sepolia")]
    pub source: String,
}

/// Arguments for `worm deploy multi`.
#[derive(Debug, Args)]
pub struct MultiArgs {
    /// Path to a Hardhat or Foundry artifact JSON file.
    #[arg(long, conflicts_with = "bytecode")]
    pub artifact: Option<String>,
    /// Raw hex bytecode (0x-prefixed). Use instead of --artifact.
    #[arg(long, conflicts_with = "artifact")]
    pub bytecode: Option<String>,
    /// CREATE2 salt string or 0x-prefixed 32-byte hex.
    #[arg(long)]
    pub salt: String,
    /// Source chain name (where the transaction is sent).
    #[arg(long)]
    pub source: String,
    /// Comma-separated list of target chain names.
    #[arg(long)]
    pub targets: String,
    /// ABI-encoded init calldata (generate with `cast calldata "fn(type)" arg`).
    #[arg(long)]
    pub init_hex: Option<String>,
    /// Also deploy on the source chain in the same transaction.
    #[arg(long)]
    pub include_source: bool,
    /// Skip confirmation prompt.
    #[arg(long)]
    pub yes: bool,
    /// Override RPC URL for the source chain.
    #[arg(long)]
    pub rpc: Option<String>,
    /// EVM private key (hex). Reads from WORMHOLE_EVM_KEY env var if not provided.
    #[arg(long, env = "WORMHOLE_EVM_KEY", hide_env_values = true)]
    pub key: String,
}

/// Arguments for `worm deploy call`.
#[derive(Debug, Args)]
pub struct CallArgs {
    /// Source chain name.
    #[arg(long)]
    pub source: String,
    /// Comma-separated target chain names.
    #[arg(long)]
    pub targets: String,
    /// Target contract address (must be same on all target chains).
    #[arg(long)]
    pub contract: String,
    /// ABI-encoded calldata (generate with `cast calldata "fn(type)" arg`).
    #[arg(long)]
    pub calldata: String,
    /// Gas limit for execution on each target chain.
    #[arg(long, default_value = "300000")]
    pub gas_limit: u64,
    /// Skip confirmation prompt.
    #[arg(long)]
    pub yes: bool,
    /// Override RPC URL for the source chain.
    #[arg(long)]
    pub rpc: Option<String>,
    /// EVM private key (hex). Reads from WORMHOLE_EVM_KEY env var if not provided.
    #[arg(long, env = "WORMHOLE_EVM_KEY", hide_env_values = true)]
    pub key: String,
}

/// Arguments for `worm deploy upgrade`.
#[derive(Debug, Args)]
pub struct UpgradeArgs {
    /// Source chain name.
    #[arg(long)]
    pub source: String,
    /// Comma-separated target chain names.
    #[arg(long)]
    pub targets: String,
    /// Proxy contract address (must be same on all chains).
    #[arg(long)]
    pub proxy: String,
    /// New implementation contract address (must be same on all chains).
    #[arg(long)]
    pub new_impl: String,
    /// Also upgrade on the source chain in the same transaction.
    #[arg(long)]
    pub include_source: bool,
    /// Skip confirmation prompt.
    #[arg(long)]
    pub yes: bool,
    /// Override RPC URL for the source chain.
    #[arg(long)]
    pub rpc: Option<String>,
    /// EVM private key (hex). Reads from WORMHOLE_EVM_KEY env var if not provided.
    #[arg(long, env = "WORMHOLE_EVM_KEY", hide_env_values = true)]
    pub key: String,
}

/// Arguments for `worm deploy status`.
#[derive(Debug, Args)]
pub struct StatusArgs {
    /// Expected contract address to check.
    #[arg(long)]
    pub address: String,
    /// Comma-separated chain names to check.
    #[arg(long)]
    pub chains: String,
}

// ── public entry point ────────────────────────────────────────────────────────

/// Run the `worm deploy` command.
///
/// Dispatches to the relevant subcommand handler.
///
/// # Errors
///
/// Propagates any error from the underlying SDK calls or user input.
pub async fn run(args: &DeployArgs) -> anyhow::Result<()> {
    match &args.subcommand {
        DeployCommand::Address(a) => run_address(a),
        DeployCommand::Multi(a) => run_multi(a).await,
        DeployCommand::Call(a) => run_call(a).await,
        DeployCommand::Upgrade(a) => run_upgrade(a).await,
        DeployCommand::Status(a) => run_status(a).await,
    }
}

// ── subcommand handlers ───────────────────────────────────────────────────────

/// Handle `worm deploy address` — compute a CREATE2 address offline.
///
/// Loads bytecode from `--artifact` or `--bytecode`, then computes the
/// deterministic address using the WormDeployer address for `--source`.
///
/// # Errors
///
/// Returns an error if bytecode loading fails or the chain is unknown.
fn run_address(args: &AddressArgs) -> anyhow::Result<()> {
    let bytecode = load_bytecode(args.artifact.as_deref(), args.bytecode.as_deref())?;
    let entry = ChainRegistry::get(&args.source)
        .ok_or_else(|| anyhow::anyhow!("unknown chain: {}", args.source))?;

    let deployer_bytes: [u8; 20] = hex::decode(
        entry
            .worm_deployer
            .strip_prefix("0x")
            .unwrap_or(entry.worm_deployer),
    )
    .map_err(|e| anyhow::anyhow!("invalid deployer address in registry: {e}"))?
    .try_into()
    .map_err(|_| anyhow::anyhow!("deployer address in registry is not 20 bytes"))?;

    let salt = salt_from_str(&args.salt);
    let address_bytes = compute_create2_address(deployer_bytes, salt, &bytecode);
    let address = format!("0x{}", hex::encode(address_bytes));
    let salt_hex = format!("0x{}", hex::encode(salt));

    output::print_json(&serde_json::json!({
        "address": address,
        "salt": salt_hex,
        "source_chain": args.source,
    }))
}

/// Handle `worm deploy multi` — deploy bytecode to multiple chains.
///
/// Confirms with the user (unless `--yes`) before submitting the transaction.
///
/// # Errors
///
/// Returns an error if bytecode loading, chain resolution, user confirmation,
/// or the RPC transaction fails.
async fn run_multi(args: &MultiArgs) -> anyhow::Result<()> {
    let bytecode = load_bytecode(args.artifact.as_deref(), args.bytecode.as_deref())?;
    let target_names = parse_comma_list(&args.targets);

    let init_calldata = match &args.init_hex {
        Some(h) => parse_hex_arg(h, "--init-hex")?,
        None => vec![],
    };

    if !args.yes {
        eprintln!("Deploy to: {}", target_names.join(", "));
        eprintln!("Salt: {}", args.salt);
        eprintln!("Source chain: {}", args.source);
        if args.include_source {
            eprintln!("Also deploying on source chain.");
        }
        eprintln!("Proceed? [y/N]");
        if !read_yes_from_stdin()? {
            eprintln!("Aborted.");
            return Ok(());
        }
    }

    let target_refs: Vec<&str> = target_names.iter().map(String::as_str).collect();
    let result = wormhole_sdk::deploy::deploy_across_chains(DeployParams {
        source_chain: &args.source,
        target_chains: target_refs,
        bytecode,
        salt: &args.salt,
        init_calldata,
        deploy_on_source: args.include_source,
        evm_key: &args.key,
        source_rpc: args.rpc.as_deref(),
    })
    .await
    .map_err(|e| anyhow::anyhow!("deploy failed: {e}"))?;

    let salt_hex = format!("0x{}", hex::encode(result.salt_bytes32));
    output::print_json(&serde_json::json!({
        "tx_hash": result.tx_hash,
        "address": result.expected_address,
        "salt": salt_hex,
        "source_chain": result.source_chain,
        "target_chains": result.target_chains,
        "cost_wei": result.cost_wei.to_string(),
    }))
}

/// Handle `worm deploy call` — send a cross-chain function call.
///
/// Parses calldata hex, confirms with the user (unless `--yes`), and
/// submits the transaction via the SDK.
///
/// # Errors
///
/// Returns an error if calldata parsing, chain resolution, or the RPC call fails.
async fn run_call(args: &CallArgs) -> anyhow::Result<()> {
    let call_data = parse_hex_arg(&args.calldata, "--calldata")?;
    let target_names = parse_comma_list(&args.targets);

    if !args.yes {
        eprintln!("Cross-chain call to: {}", args.contract);
        eprintln!("Target chains: {}", target_names.join(", "));
        eprintln!("Source chain: {}", args.source);
        eprintln!("Gas limit: {}", args.gas_limit);
        eprintln!("Proceed? [y/N]");
        if !read_yes_from_stdin()? {
            eprintln!("Aborted.");
            return Ok(());
        }
    }

    let target_refs: Vec<&str> = target_names.iter().map(String::as_str).collect();
    let tx_hash = wormhole_sdk::deploy::call_across_chains(CallParams {
        source_chain: &args.source,
        target_chains: target_refs,
        target_contract: &args.contract,
        call_data,
        gas_limit: args.gas_limit,
        evm_key: &args.key,
        source_rpc: args.rpc.as_deref(),
    })
    .await
    .map_err(|e| anyhow::anyhow!("call failed: {e}"))?;

    output::print_json(&serde_json::json!({ "tx_hash": tx_hash }))
}

/// Handle `worm deploy upgrade` — upgrade a UUPS proxy across chains.
///
/// Confirms with the user (unless `--yes`) before submitting.
///
/// # Errors
///
/// Returns an error if address validation, chain resolution, or the RPC call fails.
async fn run_upgrade(args: &UpgradeArgs) -> anyhow::Result<()> {
    let target_names = parse_comma_list(&args.targets);

    if !args.yes {
        eprintln!("Upgrade proxy: {}", args.proxy);
        eprintln!("New implementation: {}", args.new_impl);
        eprintln!("Target chains: {}", target_names.join(", "));
        eprintln!("Source chain: {}", args.source);
        if args.include_source {
            eprintln!("Also upgrading on source chain.");
        }
        eprintln!("Proceed? [y/N]");
        if !read_yes_from_stdin()? {
            eprintln!("Aborted.");
            return Ok(());
        }
    }

    let target_refs: Vec<&str> = target_names.iter().map(String::as_str).collect();
    let tx_hash = wormhole_sdk::deploy::upgrade_across_chains(UpgradeParams {
        source_chain: &args.source,
        target_chains: target_refs,
        proxy: &args.proxy,
        new_impl: &args.new_impl,
        upgrade_on_source: args.include_source,
        evm_key: &args.key,
        source_rpc: args.rpc.as_deref(),
    })
    .await
    .map_err(|e| anyhow::anyhow!("upgrade failed: {e}"))?;

    output::print_json(&serde_json::json!({ "tx_hash": tx_hash }))
}

/// Handle `worm deploy status` — check per-chain deployment status.
///
/// For each chain in `--chains`, looks up the default RPC, calls `eth_getCode`
/// at `--address`, and prints a JSON array of `{chain, status}` objects.
///
/// # Errors
///
/// Returns an error if any chain is unknown. Individual RPC failures are
/// included in the output as `"Error(<message>)"` rather than aborting.
async fn run_status(args: &StatusArgs) -> anyhow::Result<()> {
    let chain_names = parse_comma_list(&args.chains);
    let mut results = Vec::with_capacity(chain_names.len());

    for chain_name in &chain_names {
        let entry = ChainRegistry::get(chain_name)
            .ok_or_else(|| anyhow::anyhow!("unknown chain: {chain_name}"))?;
        let status_str = match check_contract_deployed(entry.default_rpc, &args.address).await {
            Ok(s) => format!("{s:?}"),
            Err(e) => format!("Error({e})"),
        };
        results.push(serde_json::json!({
            "chain": chain_name,
            "status": status_str,
        }));
    }

    output::print_json(&results)
}

// ── private helpers ───────────────────────────────────────────────────────────

/// Load bytecode from either an artifact file path or a raw hex string.
///
/// Exactly one of `artifact` or `bytecode_hex` must be `Some`; if both are
/// `None` the function returns an error.
fn load_bytecode(
    artifact: Option<&str>,
    bytecode_hex: Option<&str>,
) -> anyhow::Result<Vec<u8>> {
    if let Some(path) = artifact {
        let json = std::fs::read_to_string(path)
            .map_err(|e| anyhow::anyhow!("failed to read artifact file '{path}': {e}"))?;
        parse_artifact_json(&json).map_err(|e| anyhow::anyhow!("artifact parse error: {e}"))
    } else if let Some(hex) = bytecode_hex {
        parse_bytecode_hex(hex).map_err(|e| anyhow::anyhow!("bytecode hex parse error: {e}"))
    } else {
        Err(anyhow::anyhow!(
            "one of --artifact or --bytecode is required"
        ))
    }
}

/// Split a comma-separated string into trimmed, non-empty tokens.
fn parse_comma_list(s: &str) -> Vec<String> {
    s.split(',')
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(String::from)
        .collect()
}

/// Decode a hex argument (with optional `0x` prefix) into bytes.
///
/// `flag_name` is used only for the error message.
fn parse_hex_arg(hex: &str, flag_name: &str) -> anyhow::Result<Vec<u8>> {
    let s = hex.strip_prefix("0x").unwrap_or(hex);
    hex::decode(s).map_err(|e| anyhow::anyhow!("invalid hex for {flag_name}: {e}"))
}

/// Read one line from stdin and return `true` if it is `"y"` or `"Y"`.
///
/// Returns an error only on I/O failures, not on non-affirmative input.
fn read_yes_from_stdin() -> anyhow::Result<bool> {
    let stdin = io::stdin();
    let mut line = String::new();
    stdin
        .lock()
        .read_line(&mut line)
        .map_err(|e| anyhow::anyhow!("failed to read stdin: {e}"))?;
    Ok(matches!(line.trim(), "y" | "Y"))
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    #[derive(Parser)]
    struct TestCli {
        #[command(subcommand)]
        command: DeployCommand,
    }

    #[test]
    fn parse_multi_subcommand_all_flags() {
        let cli = TestCli::try_parse_from([
            "worm",
            "multi",
            "--artifact",
            "out/Token.json",
            "--salt",
            "v1.0.0",
            "--source",
            "sepolia",
            "--targets",
            "base-sepolia,op-sepolia",
            "--init-hex",
            "0xabcd",
            "--yes",
            "--key",
            "0x01",
        ])
        .unwrap();
        match cli.command {
            DeployCommand::Multi(a) => {
                assert_eq!(a.salt, "v1.0.0");
                assert_eq!(a.source, "sepolia");
                assert!(a.yes);
                assert_eq!(a.artifact.as_deref(), Some("out/Token.json"));
                assert_eq!(a.targets, "base-sepolia,op-sepolia");
                assert_eq!(a.init_hex.as_deref(), Some("0xabcd"));
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn parse_address_subcommand_defaults() {
        let cli = TestCli::try_parse_from([
            "worm",
            "address",
            "--bytecode",
            "0xdeadbeef",
            "--salt",
            "my-salt",
        ])
        .unwrap();
        match cli.command {
            DeployCommand::Address(a) => {
                assert_eq!(a.source, "sepolia"); // default
                assert_eq!(a.salt, "my-salt");
                assert_eq!(a.bytecode.as_deref(), Some("0xdeadbeef"));
                assert!(a.artifact.is_none());
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn parse_call_subcommand() {
        let cli = TestCli::try_parse_from([
            "worm",
            "call",
            "--source",
            "sepolia",
            "--targets",
            "base-sepolia",
            "--contract",
            "0x0000000000000000000000000000000000000001",
            "--calldata",
            "0xaabbcc",
            "--yes",
            "--key",
            "0xdeadbeef",
        ])
        .unwrap();
        match cli.command {
            DeployCommand::Call(a) => {
                assert_eq!(a.source, "sepolia");
                assert_eq!(a.gas_limit, 300_000); // default
                assert!(a.yes);
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn parse_upgrade_subcommand() {
        let cli = TestCli::try_parse_from([
            "worm",
            "upgrade",
            "--source",
            "sepolia",
            "--targets",
            "op-sepolia",
            "--proxy",
            "0x0000000000000000000000000000000000000001",
            "--new-impl",
            "0x0000000000000000000000000000000000000002",
            "--yes",
            "--key",
            "0x01",
        ])
        .unwrap();
        match cli.command {
            DeployCommand::Upgrade(a) => {
                assert_eq!(a.proxy, "0x0000000000000000000000000000000000000001");
                assert_eq!(a.new_impl, "0x0000000000000000000000000000000000000002");
                assert!(!a.include_source);
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn parse_status_subcommand() {
        let cli = TestCli::try_parse_from([
            "worm",
            "status",
            "--address",
            "0x0000000000000000000000000000000000000001",
            "--chains",
            "sepolia,base-sepolia",
        ])
        .unwrap();
        match cli.command {
            DeployCommand::Status(a) => {
                assert_eq!(a.address, "0x0000000000000000000000000000000000000001");
                assert_eq!(a.chains, "sepolia,base-sepolia");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn parse_comma_list_trims_spaces() {
        let result = parse_comma_list("base-sepolia , op-sepolia,  arb-sepolia");
        assert_eq!(result, ["base-sepolia", "op-sepolia", "arb-sepolia"]);
    }

    #[test]
    fn parse_comma_list_skips_empty_tokens() {
        let result = parse_comma_list(",sepolia,,");
        assert_eq!(result, ["sepolia"]);
    }

    #[test]
    fn parse_hex_arg_with_prefix() {
        let bytes = parse_hex_arg("0xdeadbeef", "--calldata").unwrap();
        assert_eq!(bytes, [0xde, 0xad, 0xbe, 0xef]);
    }

    #[test]
    fn parse_hex_arg_without_prefix() {
        let bytes = parse_hex_arg("deadbeef", "--calldata").unwrap();
        assert_eq!(bytes, [0xde, 0xad, 0xbe, 0xef]);
    }

    #[test]
    fn parse_hex_arg_invalid_returns_error() {
        assert!(parse_hex_arg("0xnothex", "--calldata").is_err());
    }

    #[test]
    fn load_bytecode_requires_one_source() {
        assert!(load_bytecode(None, None).is_err());
    }

    #[test]
    fn load_bytecode_from_hex() {
        let bytes = load_bytecode(None, Some("0xdeadbeef")).unwrap();
        assert_eq!(bytes, [0xde, 0xad, 0xbe, 0xef]);
    }

    #[test]
    fn artifact_and_bytecode_conflict_is_rejected_by_clap() {
        // clap enforces conflicts_with; both flags together should fail.
        let result = TestCli::try_parse_from([
            "worm",
            "multi",
            "--artifact",
            "foo.json",
            "--bytecode",
            "0x01",
            "--salt",
            "v1",
            "--source",
            "sepolia",
            "--targets",
            "base-sepolia",
            "--key",
            "0x01",
        ]);
        assert!(result.is_err());
    }
}
