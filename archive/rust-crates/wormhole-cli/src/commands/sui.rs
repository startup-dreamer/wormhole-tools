use clap::{Args, Subcommand};
use wormhole_sdk::chains::sui::{self, DEVNET_RPC};

use crate::output;

/// Interact with Wormhole contracts on Sui.
#[derive(Debug, Args)]
pub struct SuiArgs {
    #[command(subcommand)]
    pub subcommand: SuiCommand,
}

/// Sui subcommands.
#[derive(Debug, Subcommand)]
pub enum SuiCommand {
    /// Print node info (connectivity check via latest checkpoint).
    NodeInfo(SuiNodeArgs),
    /// Deploy a Sui package (not yet implemented).
    DeployPackage(SuiNodeArgs),
}

/// Common arguments for Sui node connection.
#[derive(Debug, Args)]
pub struct SuiNodeArgs {
    /// Sui JSON-RPC URL (defaults to devnet localhost).
    #[arg(long, default_value = DEVNET_RPC)]
    pub rpc: String,
    /// Path to package directory (for deploy-package).
    #[arg(long)]
    pub package: Option<String>,
}

/// Run the `worm sui` command.
///
/// # Errors
///
/// Returns an error if the RPC call fails or the operation is unsupported.
pub async fn run(args: &SuiArgs) -> anyhow::Result<()> {
    match &args.subcommand {
        SuiCommand::NodeInfo(node) => {
            let info = sui::node_info(&node.rpc)
                .await
                .map_err(|e| anyhow::anyhow!("node-info failed: {e}"))?;
            output::print_json(&info)
        }
        SuiCommand::DeployPackage(node) => {
            let package = node.package.as_deref().unwrap_or("");
            sui::deploy_package(&node.rpc, package)
                .await
                .map_err(|e| anyhow::anyhow!("deploy-package: {e}"))
        }
    }
}
