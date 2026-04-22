use clap::Args;
use wormhole_sdk::chains::evm::{self, SubmitParams, DEVNET_FROM, DEVNET_RPC};

use crate::output;

/// Submit a VAA to an EVM chain.
#[derive(Debug, Args)]
pub struct SubmitArgs {
    /// Hex or base64-encoded VAA to submit.
    pub vaa: String,
    /// Target EVM chain name (e.g. ethereum).
    #[arg(short = 'c', long)]
    pub chain: Option<String>,
    /// Target contract address (overrides default).
    #[arg(short = 'a', long)]
    pub contract_address: Option<String>,
    /// RPC endpoint URL (overrides default).
    #[arg(long)]
    pub rpc: Option<String>,
    /// `from` address for devnet (unlocked account).  Defaults to Ganache account 0.
    #[arg(long, env = "WORMHOLE_EVM_FROM")]
    pub from: Option<String>,
    /// Secp256k1 private key hex for signed submission (testnet/mainnet).
    #[arg(long, env = "WORMHOLE_EVM_KEY")]
    pub evm_key: Option<String>,
}

/// Run the `worm submit` command.
///
/// Parses the VAA, detects its module, and submits it to the appropriate
/// Wormhole contract on the target chain.  Prints the transaction hash as JSON.
///
/// # Errors
///
/// Returns an error if the VAA cannot be parsed, the contract address cannot be
/// determined, or the RPC call fails.
pub async fn run(args: &SubmitArgs) -> anyhow::Result<()> {
    let rpc_url = args.rpc.as_deref().unwrap_or(DEVNET_RPC);
    let from = args.from.as_deref().or(Some(DEVNET_FROM));

    let contract_address = resolve_contract_address(args)?;

    let tx_hash = evm::submit_vaa(SubmitParams {
        vaa_hex: &args.vaa,
        rpc_url,
        contract_address: &contract_address,
        from_address: from,
        evm_key: args.evm_key.as_deref(),
    })
    .await
    .map_err(|e| anyhow::anyhow!("submit failed: {e}"))?;

    output::print_json(&tx_hash)
}

/// Resolve the target contract address from CLI args or env vars.
fn resolve_contract_address(args: &SubmitArgs) -> anyhow::Result<String> {
    if let Some(addr) = &args.contract_address {
        return Ok(addr.clone());
    }

    // Try env vars for known modules
    if let Ok(addr) = std::env::var("WORMHOLE_CORE_ADDRESS") {
        return Ok(addr);
    }

    // Default: devnet core bridge
    Ok(evm::DEVNET_CORE.to_string())
}
