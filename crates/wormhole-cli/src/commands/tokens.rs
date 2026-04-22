use clap::{Args, Subcommand};
use wormhole_sdk::{info, tokens};

use crate::output;

/// Query Token Bridge registered tokens on an EVM chain.
#[derive(Debug, Args)]
pub struct TokensArgs {
    #[command(subcommand)]
    pub subcommand: TokensSubcommand,
}

/// Token Bridge subcommands.
#[derive(Debug, Subcommand)]
pub enum TokensSubcommand {
    /// Look up the wrapped address for a foreign token on this chain.
    Wrapped(WrappedArgs),
    /// Check whether an address is a Wormhole-wrapped token.
    IsWrapped(IsWrappedArgs),
}

/// Arguments for `worm tokens wrapped`.
#[derive(Debug, Args)]
pub struct WrappedArgs {
    /// Wormhole chain name of the token's origin chain (e.g. ethereum).
    #[arg(long)]
    pub origin_chain: String,
    /// Origin token address (0x-prefixed EVM address or 32-byte hex).
    #[arg(long)]
    pub token: String,
    /// Destination chain name (used to look up default Token Bridge address).
    #[arg(long)]
    pub chain: Option<String>,
    /// HTTP(S) RPC endpoint of the destination chain.
    #[arg(long)]
    pub rpc: String,
    /// Token Bridge contract address (overrides default).
    #[arg(long)]
    pub contract: Option<String>,
    /// Network for contract address lookup (mainnet, testnet, devnet).
    #[arg(long, default_value = "mainnet")]
    pub network: String,
}

/// Arguments for `worm tokens is-wrapped`.
#[derive(Debug, Args)]
pub struct IsWrappedArgs {
    /// Token address to check (0x-prefixed, 40 hex chars).
    #[arg(long)]
    pub token: String,
    /// Destination chain name (used to look up default Token Bridge address).
    #[arg(long)]
    pub chain: Option<String>,
    /// HTTP(S) RPC endpoint.
    #[arg(long)]
    pub rpc: String,
    /// Token Bridge contract address (overrides default).
    #[arg(long)]
    pub contract: Option<String>,
    /// Network for contract address lookup (mainnet, testnet, devnet).
    #[arg(long, default_value = "mainnet")]
    pub network: String,
}

/// Run the `worm tokens` command.
///
/// # Errors
///
/// Returns an error if the contract address cannot be resolved or the RPC call
/// fails.
pub async fn run(args: &TokensArgs) -> anyhow::Result<()> {
    match &args.subcommand {
        TokensSubcommand::Wrapped(a) => run_wrapped(a).await,
        TokensSubcommand::IsWrapped(a) => run_is_wrapped(a).await,
    }
}

async fn run_wrapped(args: &WrappedArgs) -> anyhow::Result<()> {
    let contract = resolve_contract(
        args.contract.as_deref(),
        args.chain.as_deref(),
        &args.network,
    )?;

    let origin_chain =
        wormhole_sdk::info::chain_id(&args.origin_chain).map_err(|e| anyhow::anyhow!("{e}"))?;

    let addr = tokens::wrapped_asset(&args.rpc, &contract, origin_chain, &args.token)
        .await
        .map_err(|e| anyhow::anyhow!("wrapped_asset failed: {e}"))?;

    output::print_json(&serde_json::json!({ "wrapped_address": addr }))
}

async fn run_is_wrapped(args: &IsWrappedArgs) -> anyhow::Result<()> {
    let contract = resolve_contract(
        args.contract.as_deref(),
        args.chain.as_deref(),
        &args.network,
    )?;

    let result = tokens::is_wrapped_asset(&args.rpc, &contract, &args.token)
        .await
        .map_err(|e| anyhow::anyhow!("is_wrapped_asset failed: {e}"))?;

    output::print_json(&serde_json::json!({ "is_wrapped": result }))
}

/// Resolve the Token Bridge contract address from args or the known contract table.
fn resolve_contract(
    contract_arg: Option<&str>,
    chain_arg: Option<&str>,
    network: &str,
) -> anyhow::Result<String> {
    if let Some(addr) = contract_arg {
        return Ok(addr.to_string());
    }
    if let Some(chain) = chain_arg {
        return info::contract_address(network, chain, "token_bridge")
            .map_err(|e| anyhow::anyhow!("{e}"));
    }
    Err(anyhow::anyhow!(
        "provide --contract or --chain to look up the Token Bridge address"
    ))
}
