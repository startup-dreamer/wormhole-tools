use clap::{Args, Subcommand};
use wormhole_sdk::chains::evm::{self, DEVNET_CORE, DEVNET_RPC, DEVNET_TOKEN_BRIDGE};

use crate::output;

/// Interact with Wormhole contracts on EVM chains.
#[derive(Debug, Args)]
pub struct EvmArgs {
    #[command(subcommand)]
    pub subcommand: EvmCommand,
}

/// EVM subcommands.
#[derive(Debug, Subcommand)]
pub enum EvmCommand {
    /// Read guardian set index and chain ID from the core bridge contract.
    InitWormhole(EvmNodeArgs),
    /// Read chain ID from the token bridge contract.
    InitTokenBridge(EvmNodeArgs),
}

/// Common arguments for EVM node connection.
#[derive(Debug, Args)]
pub struct EvmNodeArgs {
    /// HTTP(S) RPC endpoint (defaults to devnet localhost).
    #[arg(long, default_value = DEVNET_RPC)]
    pub rpc: String,
    /// Contract address (defaults to devnet core bridge).
    #[arg(long)]
    pub contract: Option<String>,
}

/// Run the `worm evm` command.
///
/// # Errors
///
/// Returns an error if the RPC call fails or the result cannot be decoded.
pub async fn run(args: &EvmArgs) -> anyhow::Result<()> {
    match &args.subcommand {
        EvmCommand::InitWormhole(node) => {
            let contract = node.contract.as_deref().unwrap_or(DEVNET_CORE);
            let guardian_set = evm::read_guardian_set_index(&node.rpc, contract)
                .await
                .map_err(|e| anyhow::anyhow!("init-wormhole failed: {e}"))?;
            let chain_id = evm::read_chain_id(&node.rpc, contract)
                .await
                .map_err(|e| anyhow::anyhow!("init-wormhole chain-id failed: {e}"))?;
            output::print_json(&serde_json::json!({
                "guardianSetIndex": guardian_set,
                "chainId": chain_id,
            }))
        }
        EvmCommand::InitTokenBridge(node) => {
            let contract = node.contract.as_deref().unwrap_or(DEVNET_TOKEN_BRIDGE);
            let chain_id = evm::read_chain_id(&node.rpc, contract)
                .await
                .map_err(|e| anyhow::anyhow!("init-token-bridge failed: {e}"))?;
            output::print_json(&serde_json::json!({
                "chainId": chain_id,
            }))
        }
    }
}
