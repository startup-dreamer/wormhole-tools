use clap::{Args, Subcommand};
use wormhole_sdk::chains::aptos::{self, DEVNET_RPC};

use crate::output;

/// Interact with Wormhole contracts on Aptos.
#[derive(Debug, Args)]
pub struct AptosArgs {
    #[command(subcommand)]
    pub subcommand: AptosCommand,
}

/// Aptos subcommands.
#[derive(Debug, Subcommand)]
pub enum AptosCommand {
    /// Print ledger info from the Aptos node (connectivity check).
    LedgerInfo(AptosNodeArgs),
    /// Initialize the Wormhole core contract (not yet implemented).
    InitWormhole(AptosNodeArgs),
    /// Initialize the Wormhole token bridge contract (not yet implemented).
    InitTokenBridge(AptosNodeArgs),
}

/// Common arguments for Aptos node connection.
#[derive(Debug, Args)]
pub struct AptosNodeArgs {
    /// Aptos REST API URL (defaults to devnet localhost).
    #[arg(long, default_value = DEVNET_RPC)]
    pub rpc: String,
    /// Contract address (hex, without 0x prefix).
    #[arg(long)]
    pub contract: Option<String>,
}

/// Run the `worm aptos` command.
///
/// # Errors
///
/// Returns an error if the RPC call fails or the operation is unsupported.
pub async fn run(args: &AptosArgs) -> anyhow::Result<()> {
    match &args.subcommand {
        AptosCommand::LedgerInfo(node) => {
            let info = aptos::ledger_info(&node.rpc)
                .await
                .map_err(|e| anyhow::anyhow!("ledger-info failed: {e}"))?;
            output::print_json(&info)
        }
        AptosCommand::InitWormhole(node) => {
            let contract = node.contract.as_deref().unwrap_or(aptos::DEVNET_CORE);
            aptos::init_wormhole(&node.rpc, contract, 22, 1, "")
                .await
                .map_err(|e| anyhow::anyhow!("init-wormhole: {e}"))
        }
        AptosCommand::InitTokenBridge(node) => {
            let contract = node.contract.as_deref().unwrap_or(aptos::DEVNET_CORE);
            aptos::init_token_bridge(&node.rpc, contract)
                .await
                .map_err(|e| anyhow::anyhow!("init-token-bridge: {e}"))
        }
    }
}
