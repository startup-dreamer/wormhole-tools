use clap::{Args, Subcommand};
use wormhole_sdk::chains::near::{self, DEVNET_RPC};

use crate::output;

/// Interact with Wormhole contracts on NEAR.
#[derive(Debug, Args)]
pub struct NearArgs {
    #[command(subcommand)]
    pub subcommand: NearCommand,
}

/// NEAR subcommands.
#[derive(Debug, Subcommand)]
pub enum NearCommand {
    /// Print node status (connectivity check).
    NodeStatus(NearNodeArgs),
    /// Update a NEAR contract (not yet implemented).
    ContractUpdate(NearNodeArgs),
    /// Deploy a NEAR contract (not yet implemented).
    Deploy(NearNodeArgs),
}

/// Common arguments for NEAR node connection.
#[derive(Debug, Args)]
pub struct NearNodeArgs {
    /// NEAR JSON-RPC URL (defaults to devnet localhost).
    #[arg(long, default_value = DEVNET_RPC)]
    pub rpc: String,
    /// NEAR account ID for the operation.
    #[arg(long)]
    pub account: Option<String>,
}

/// Run the `worm near` command.
///
/// # Errors
///
/// Returns an error if the RPC call fails or the operation is unsupported.
pub async fn run(args: &NearArgs) -> anyhow::Result<()> {
    match &args.subcommand {
        NearCommand::NodeStatus(node) => {
            let status = near::node_status(&node.rpc)
                .await
                .map_err(|e| anyhow::anyhow!("node-status failed: {e}"))?;
            output::print_json(&status)
        }
        NearCommand::ContractUpdate(node) => {
            let account = node.account.as_deref().unwrap_or("");
            near::contract_update(&node.rpc, account, &[])
                .await
                .map_err(|e| anyhow::anyhow!("contract-update: {e}"))
        }
        NearCommand::Deploy(node) => {
            let account = node.account.as_deref().unwrap_or("");
            near::deploy(&node.rpc, account, &[])
                .await
                .map_err(|e| anyhow::anyhow!("deploy: {e}"))
        }
    }
}
