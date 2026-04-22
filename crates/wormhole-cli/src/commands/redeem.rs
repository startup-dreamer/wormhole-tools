use clap::Args;
use wormhole_sdk::{
    chains::{
        evm::{self, SubmitParams, DEVNET_CORE, DEVNET_FROM, DEVNET_RPC},
        Network,
    },
    status,
    vaa::decode_vaa_bytes,
};

use crate::output;

/// Manually redeem a stuck Wormhole VAA on the destination chain.
#[derive(Debug, Args)]
pub struct RedeemArgs {
    /// Source tx hash (0x + 64 hex chars) or a raw VAA (hex or base64).
    pub input: String,
    /// Destination chain name (e.g. ethereum).
    #[arg(long)]
    pub dst_chain: Option<String>,
    /// Destination chain RPC endpoint.
    #[arg(long, default_value = DEVNET_RPC)]
    pub rpc: String,
    /// `from` address for devnet (unlocked account).
    #[arg(long, env = "WORMHOLE_EVM_FROM")]
    pub from: Option<String>,
    /// Target contract address (defaults to devnet core bridge).
    #[arg(long)]
    pub contract: Option<String>,
    /// Wormhole network for API lookup when input is a tx hash.
    #[arg(long, default_value = "mainnet")]
    pub network: String,
}

/// Run the `worm redeem` command.
///
/// Accepts either a source transaction hash (fetches the signed VAA from the
/// Wormhole Scan API) or raw VAA bytes (hex or base64).  Submits the VAA to
/// the destination chain and prints the resulting transaction hash.
///
/// # Errors
///
/// Returns an error if the input is invalid, the API lookup fails, or the
/// on-chain submission fails.
pub async fn run(args: &RedeemArgs) -> anyhow::Result<()> {
    let vaa_bytes = if is_tx_hash(&args.input) {
        let network: Network = args
            .network
            .parse()
            .map_err(|e| anyhow::anyhow!("invalid network: {e}"))?;
        status::fetch_vaa_bytes(&args.input, network)
            .await
            .map_err(|e| anyhow::anyhow!("failed to fetch VAA: {e}"))?
    } else {
        decode_vaa_bytes(&args.input).map_err(|e| anyhow::anyhow!("invalid VAA: {e}"))?
    };

    let vaa_hex = hex::encode(&vaa_bytes);
    let contract = args.contract.as_deref().unwrap_or(DEVNET_CORE).to_string();
    let from = args.from.as_deref().or(Some(DEVNET_FROM));

    let tx_hash = evm::submit_vaa(SubmitParams {
        vaa_hex: &vaa_hex,
        rpc_url: &args.rpc,
        contract_address: &contract,
        from_address: from,
        evm_key: None,
    })
    .await
    .map_err(|e| anyhow::anyhow!("redeem failed: {e}"))?;

    output::print_json(&tx_hash)
}

/// Return `true` if `input` looks like an EVM transaction hash.
///
/// A tx hash is `0x`-prefixed followed by exactly 64 lowercase hex characters
/// (total 66 chars).
fn is_tx_hash(input: &str) -> bool {
    input.starts_with("0x")
        && input.len() == 66
        && input[2..].chars().all(|c| c.is_ascii_hexdigit())
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_tx_hash() {
        let hash = format!("0x{}", "a".repeat(64));
        assert!(is_tx_hash(&hash));
    }

    #[test]
    fn rejects_non_tx_hash_input() {
        // base64 VAA won't match the tx hash pattern
        assert!(!is_tx_hash("AQAAAAQNAB..."));
        // hex without 0x prefix is a VAA, not a tx hash
        assert!(!is_tx_hash(&"a".repeat(64)));
        // too short
        assert!(!is_tx_hash("0xdeadbeef"));
    }

    #[test]
    fn vaa_api_url_mainnet_has_expected_format() {
        use wormhole_sdk::chains::Network;
        use wormhole_sdk::status::vaa_api_url;
        let url = vaa_api_url(
            2,
            "0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585",
            99,
            Network::Mainnet,
        );
        assert_eq!(
            url,
            "https://api.wormholescan.io/api/v1/vaas/2/0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585/99"
        );
    }
}
