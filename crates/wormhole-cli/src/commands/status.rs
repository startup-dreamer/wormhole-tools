use clap::Args;
use wormhole_sdk::{chains::Network, info, status};

use crate::output;

/// Track a Wormhole message by its source transaction hash.
#[derive(Debug, Args)]
pub struct StatusArgs {
    /// Source transaction hash (0x-prefixed hex, 66 chars).
    pub tx_hash: String,
    /// Wormhole network environment (mainnet, testnet, devnet).
    #[arg(long, default_value = "mainnet")]
    pub network: String,
}

/// Run the `worm status` command.
///
/// Queries the Wormhole Scan API for the full status of a source transaction
/// and prints the result as structured JSON with source chain, destination
/// chain, VAA signing status, and a direct Wormhole Scan explorer link.
///
/// # Errors
///
/// Returns an error if the network string is invalid, the API call fails, or
/// the transaction is not found after 3 retries.
pub async fn run(args: &StatusArgs) -> anyhow::Result<()> {
    let network: Network = args
        .network
        .parse()
        .map_err(|e| anyhow::anyhow!("invalid network: {e}"))?;

    let s = status::fetch_vaa_status(&args.tx_hash, network)
        .await
        .map_err(|e| anyhow::anyhow!("status fetch failed: {e}"))?;

    let src_chain = info::chain_name(s.emitter_chain).unwrap_or("unknown");
    let dst_chain = s
        .destination_chain_id
        .and_then(info::chain_name)
        .unwrap_or("unknown");

    let emitter = info::native_address(s.emitter_chain, &s.emitter_address);

    let explorer_base = match network {
        Network::Mainnet => "https://wormholescan.io",
        Network::Testnet | Network::Devnet => "https://wormholescan.io", // testnet uses same UI
    };
    let src_hash = s.source_tx_hash.as_deref().unwrap_or(&args.tx_hash);
    let explorer_url = format!("{explorer_base}/tx/{src_hash}");

    let display = serde_json::json!({
        "source": {
            "chain": src_chain,
            "chain_id": s.emitter_chain,
            "tx_hash": s.source_tx_hash,
            "from": s.source_from,
            "emitter": emitter,
            "timestamp": s.source_timestamp,
        },
        "destination": {
            "chain": dst_chain,
            "chain_id": s.destination_chain_id,
            "address": s.destination_address,
            "tx_hash": s.destination_tx,
            "timestamp": s.destination_timestamp,
        },
        "token": {
            "symbol": s.token_symbol,
            "amount": s.token_amount,
            "amount_usd": s.token_amount_usd,
        },
        "vaa": {
            "sequence": s.sequence,
            "signed": s.signed,
            "signatures": s.signatures,
            "delivered": s.delivered,
        },
        "explorer": explorer_url,
    });

    output::print_json(&display)
}
