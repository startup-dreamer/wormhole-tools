use clap::Args;
use wormhole_sdk::{
    chains::evm::{DEVNET_FROM, DEVNET_RPC, DEVNET_TOKEN_BRIDGE},
    transfer::{self, TransferParams},
};

use crate::{output, providers};

/// Initiate a Wormhole token bridge transfer.
#[derive(Debug, Args)]
pub struct TransferArgs {
    /// ERC-20 token address (0x-prefixed hex).
    #[arg(long)]
    pub token: String,
    /// Amount to transfer in the token's smallest unit.
    #[arg(long)]
    pub amount: u128,
    /// Wormhole chain ID of the destination chain (e.g. 1 for Solana).
    #[arg(long)]
    pub dst_chain: u16,
    /// 32-byte recipient address on the destination chain (64 hex chars).
    #[arg(long)]
    pub recipient: String,
    /// Token bridge contract address (overrides devnet default).
    #[arg(long)]
    pub token_bridge: Option<String>,
    /// HTTP(S) RPC endpoint (defaults to devnet localhost).
    #[arg(long)]
    pub rpc: Option<String>,
    /// `from` address for devnet (unlocked account).
    #[arg(long, env = "WORMHOLE_EVM_FROM")]
    pub from: Option<String>,
    /// Relayer fee in the token's smallest unit (default 0).
    #[arg(long, default_value = "0")]
    pub arbiter_fee: u128,
    /// Transfer nonce for deduplication (default 0).
    #[arg(long, default_value = "0")]
    pub nonce: u32,
    /// Secp256k1 private key hex. Falls back to EVM_PRIVATE_KEY env var, then devnet default.
    #[arg(long, env = "EVM_PRIVATE_KEY")]
    pub private_key: Option<String>,
}

/// Run the `worm transfer` command.
///
/// Initiates a token bridge transfer and prints the transaction hash as JSON.
///
/// # Errors
///
/// Returns an error if ABI encoding fails or the RPC call fails.
pub async fn run(args: &TransferArgs) -> anyhow::Result<()> {
    let rpc_url = args.rpc.as_deref().unwrap_or(DEVNET_RPC);
    let token_bridge = args.token_bridge.as_deref().unwrap_or(DEVNET_TOKEN_BRIDGE);

    let wallet_address;
    let from_address = if args.private_key.is_some() {
        let wallet = providers::load_wallet("ethereum", args.private_key.as_deref())?;
        wallet_address = wallet.address().to_string();
        wallet_address.as_str()
    } else {
        args.from.as_deref().unwrap_or(DEVNET_FROM)
    };

    let params = TransferParams {
        rpc_url,
        token_bridge,
        token_address: &args.token,
        amount: args.amount,
        recipient_chain: args.dst_chain,
        recipient: &args.recipient,
        arbiter_fee: args.arbiter_fee,
        nonce: args.nonce,
        from_address,
    };

    let tx_hash = transfer::initiate_transfer(&params)
        .await
        .map_err(|e| anyhow::anyhow!("transfer failed: {e}"))?;

    output::print_json(&tx_hash)
}
