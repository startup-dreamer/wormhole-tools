use clap::Args;
use wormhole_sdk::{chains::Network, info, latency};

use crate::output;

/// Measure guardian signing latency for a source chain.
#[derive(Debug, Args)]
pub struct LatencyArgs {
    /// Source chain name (e.g. ethereum).
    pub chain: String,
    /// Wormhole network environment (mainnet, testnet, devnet).
    #[arg(long, default_value = "mainnet")]
    pub network: String,
    /// Number of recent VAAs to sample.
    #[arg(long, default_value = "20")]
    pub count: u32,
}

/// Run the `worm latency` command.
///
/// Fetches recent VAAs for the given chain, computes guardian signing latency
/// percentiles, and prints a JSON summary.
///
/// # Errors
///
/// Returns an error if `--count` is zero, the chain name is unknown, or the
/// API call fails.
pub async fn run(args: &LatencyArgs) -> anyhow::Result<()> {
    if args.count == 0 {
        anyhow::bail!("--count must be greater than zero");
    }

    let network: Network = args
        .network
        .parse()
        .map_err(|e| anyhow::anyhow!("invalid network: {e}"))?;

    let chain_id = info::chain_id(&args.chain).map_err(|e| anyhow::anyhow!("{e}"))?;

    let timings = latency::fetch_recent_vaas(chain_id, network, args.count)
        .await
        .map_err(|e| anyhow::anyhow!("latency fetch failed: {e}"))?;

    let sample_count = timings.len();

    let result = match latency::compute_percentiles(&timings) {
        Some(p) => serde_json::json!({
            "chain": args.chain,
            "sample_count": sample_count,
            "p50_secs": p.p50_secs,
            "p95_secs": p.p95_secs,
            "min_secs": p.min_secs,
            "max_secs": p.max_secs,
        }),
        None => serde_json::json!({
            "chain": args.chain,
            "sample_count": 0,
            "p50_secs": null,
            "p95_secs": null,
            "min_secs": null,
            "max_secs": null,
        }),
    };

    output::print_json(&result)
}
