use clap::{Args, Subcommand};
use wormhole_sdk::chains::solana::{self, MAINNET_BRIDGE_STATE, MAINNET_RPC};

use crate::output;

/// Interact with Wormhole contracts on Solana.
#[derive(Debug, Args)]
pub struct SolanaArgs {
    #[command(subcommand)]
    pub subcommand: SolanaSubcommand,
}

/// Solana subcommands.
#[derive(Debug, Subcommand)]
pub enum SolanaSubcommand {
    /// Print Solana node slot and health status.
    NodeInfo(NodeInfoArgs),
    /// Read the current guardian set index from the Wormhole bridge state account.
    GuardianSet(GuardianSetArgs),
    /// Read the sequence number from a Wormhole emitter sequence account.
    Sequence(SequenceArgs),
}

/// Arguments for `worm solana node-info`.
#[derive(Debug, Args)]
pub struct NodeInfoArgs {
    /// Solana JSON-RPC endpoint (defaults to mainnet-beta).
    #[arg(long, default_value = MAINNET_RPC)]
    pub rpc: String,
}

/// Arguments for `worm solana guardian-set`.
#[derive(Debug, Args)]
pub struct GuardianSetArgs {
    /// Solana JSON-RPC endpoint (defaults to mainnet-beta).
    #[arg(long, default_value = MAINNET_RPC)]
    pub rpc: String,
    /// Wormhole bridge state PDA (not the program ID; defaults to mainnet).
    #[arg(long, default_value = MAINNET_BRIDGE_STATE)]
    pub contract: String,
}

/// Arguments for `worm solana sequence`.
#[derive(Debug, Args)]
pub struct SequenceArgs {
    /// Emitter sequence account address (the Wormhole sequence PDA for this emitter).
    #[arg(long)]
    pub emitter: String,
    /// Solana JSON-RPC endpoint (defaults to mainnet-beta).
    #[arg(long, default_value = MAINNET_RPC)]
    pub rpc: String,
}

/// Run the `worm solana` command.
///
/// # Errors
///
/// Returns an error if the RPC call fails or the account data cannot be decoded.
pub async fn run(args: &SolanaArgs) -> anyhow::Result<()> {
    match &args.subcommand {
        SolanaSubcommand::NodeInfo(a) => {
            let info = solana::node_info(&a.rpc)
                .await
                .map_err(|e| anyhow::anyhow!("node-info failed: {e}"))?;
            output::print_json(&info)
        }
        SolanaSubcommand::GuardianSet(a) => {
            let idx = solana::read_guardian_set(&a.rpc, &a.contract)
                .await
                .map_err(|e| anyhow::anyhow!("guardian-set failed: {e}"))?;
            output::print_json(&serde_json::json!({ "guardian_set_index": idx }))
        }
        SolanaSubcommand::Sequence(a) => {
            let seq = solana::read_sequence(&a.rpc, &a.emitter)
                .await
                .map_err(|e| anyhow::anyhow!("sequence failed: {e}"))?;
            output::print_json(&serde_json::json!({ "sequence": seq }))
        }
    }
}
