//! Wormhole message status via the Wormhole Scan API.
//!
//! Queries `GET /api/v1/operations?txHash={hash}` on Wormhole Scan to determine
//! whether a VAA has been signed by guardians and delivered on the destination
//! chain.  Retries up to three times with a 1-second delay when the transaction
//! has not yet been indexed (empty `operations` array).

use base64::Engine as _;

use crate::{chains::Network, WormholeError};

/// Full status of a Wormhole cross-chain operation as reported by the Wormhole Scan API.
#[derive(Debug, serde::Serialize)]
pub struct VaaStatus {
    /// Wormhole chain ID of the emitter (source chain).
    pub emitter_chain: u16,
    /// Emitter address in 32-byte Wormhole hex format (no `0x` prefix).
    pub emitter_address: String,
    /// VAA sequence number.
    pub sequence: u64,
    /// `true` if the VAA has been signed by guardians.
    pub signed: bool,
    /// Number of guardian signatures present (decoded from raw VAA).
    pub signatures: u8,
    /// `true` if the VAA has been delivered; `None` if delivery is not yet reported.
    pub delivered: Option<bool>,

    // ── source chain ──────────────────────────────────────────────────────────
    /// Source-chain transaction hash that initiated the Wormhole message.
    pub source_tx_hash: Option<String>,
    /// Sender address on the source chain (native format).
    pub source_from: Option<String>,
    /// ISO-8601 timestamp when the source-chain transaction was confirmed.
    pub source_timestamp: Option<String>,

    // ── destination chain ─────────────────────────────────────────────────────
    /// Wormhole chain ID of the destination chain.
    pub destination_chain_id: Option<u16>,
    /// Recipient address on the destination chain (native format, from API).
    pub destination_address: Option<String>,
    /// Destination-chain transaction hash of the delivery.
    pub destination_tx: Option<String>,
    /// ISO-8601 timestamp when delivery was confirmed on the destination chain.
    pub destination_timestamp: Option<String>,

    // ── token metadata (Portal bridge only) ───────────────────────────────────
    /// Token symbol (e.g. `"WETH"`), if the API returned it.
    pub token_symbol: Option<String>,
    /// Human-readable token amount (e.g. `"10"`).
    pub token_amount: Option<String>,
    /// USD value of the transfer at time of indexing.
    pub token_amount_usd: Option<String>,
}

/// Build the Wormhole Scan API URL for a source transaction hash.
pub fn api_url(tx_hash: &str, network: Network) -> String {
    let base = match network {
        Network::Mainnet => "https://api.wormholescan.io",
        Network::Testnet | Network::Devnet => "https://api.testnet.wormholescan.io",
    };
    format!("{base}/api/v1/operations?txHash={tx_hash}")
}

/// Fetch the VAA status for a source transaction hash from the Wormhole Scan API.
///
/// Retries up to 3 times with a 1-second delay when the API returns an empty
/// `operations` array (the transaction has not yet been indexed).
///
/// # Errors
///
/// Returns [`WormholeError::Network`] on HTTP failure, JSON parse error, or if
/// the transaction is not found after all retries.
pub async fn fetch_vaa_status(tx_hash: &str, network: Network) -> Result<VaaStatus, WormholeError> {
    let url = api_url(tx_hash, network);
    let client = reqwest::Client::new();

    for attempt in 0..3u8 {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }

        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| WormholeError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(WormholeError::Network(format!(
                "Wormhole Scan API error {}: {}",
                resp.status(),
                url
            )));
        }

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| WormholeError::Network(format!("failed to parse API response: {e}")))?;

        let is_empty = body["operations"]
            .as_array()
            .map(|a| a.is_empty())
            .unwrap_or(true);
        if is_empty {
            continue;
        }

        return parse_vaa_status(&body);
    }

    Err(WormholeError::Network(format!(
        "transaction not found after 3 attempts: {tx_hash}"
    )))
}

/// Build the Wormhole Scan API URL for fetching VAA bytes by identifier.
pub fn vaa_api_url(
    emitter_chain: u16,
    emitter_address: &str,
    sequence: u64,
    network: Network,
) -> String {
    let base = match network {
        Network::Mainnet => "https://api.wormholescan.io",
        Network::Testnet | Network::Devnet => "https://api.testnet.wormholescan.io",
    };
    format!("{base}/api/v1/vaas/{emitter_chain}/{emitter_address}/{sequence}")
}

/// Fetch the raw VAA bytes for a source transaction hash.
///
/// # Errors
///
/// Returns [`WormholeError::Network`] on any HTTP or parse failure.
pub async fn fetch_vaa_bytes(tx_hash: &str, network: Network) -> Result<Vec<u8>, WormholeError> {
    let status = fetch_vaa_status(tx_hash, network).await?;
    let url = vaa_api_url(
        status.emitter_chain,
        &status.emitter_address,
        status.sequence,
        network,
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| WormholeError::Network(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(WormholeError::Network(format!(
            "VAA API returned status {}: {url}",
            resp.status()
        )));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| WormholeError::Network(format!("failed to parse VAA API response: {e}")))?;

    let data = body.get("data").unwrap_or(&body);
    let vaa_b64 = data["vaa"].as_str().ok_or_else(|| {
        WormholeError::Network("missing 'vaa' field in VAA API response".to_string())
    })?;

    base64::engine::general_purpose::STANDARD
        .decode(vaa_b64)
        .map_err(|e| WormholeError::Network(format!("failed to decode VAA base64: {e}")))
}

/// Extract a [`VaaStatus`] from a Wormhole Scan `operations` API JSON response.
fn parse_vaa_status(body: &serde_json::Value) -> Result<VaaStatus, WormholeError> {
    let ops = body["operations"].as_array().ok_or_else(|| {
        WormholeError::Network("missing 'operations' array in API response".to_string())
    })?;
    let op = ops.first().ok_or_else(|| {
        WormholeError::Network("empty 'operations' array in API response".to_string())
    })?;

    // ── core VAA fields ───────────────────────────────────────────────────────

    let emitter_chain = op["emitterChain"]
        .as_u64()
        .ok_or_else(|| WormholeError::Network("missing emitterChain".to_string()))?
        as u16;

    let emitter_address = op["emitterAddress"]["hex"]
        .as_str()
        .ok_or_else(|| WormholeError::Network("missing emitterAddress.hex".to_string()))?
        .to_string();

    let sequence = op["sequence"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .or_else(|| op["sequence"].as_u64())
        .ok_or_else(|| WormholeError::Network("missing sequence".to_string()))?;

    let vaa_obj = op.get("vaa").filter(|v| !v.is_null());
    let signed = vaa_obj.is_some();
    let signatures: u8 = vaa_obj
        .and_then(|v| v["raw"].as_str())
        .and_then(|raw| {
            base64::engine::general_purpose::STANDARD
                .decode(raw)
                .ok()
                .and_then(|b| b.get(5).copied())
        })
        .unwrap_or(0);

    // ── source chain ──────────────────────────────────────────────────────────

    let src = &op["sourceChain"];
    let source_tx_hash = src["transaction"]["txHash"].as_str().map(String::from);
    let source_from = src["from"].as_str().map(String::from);
    let source_timestamp = src["timestamp"].as_str().map(String::from);

    // ── destination chain ─────────────────────────────────────────────────────

    let props = &op["content"]["standarizedProperties"];
    let destination_chain_id = props["toChain"]
        .as_u64()
        .or_else(|| op["content"]["payload"]["toChain"].as_u64())
        .map(|n| n as u16);

    // standarizedProperties.toAddress is already in native chain format.
    let destination_address = props["toAddress"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);

    let target = op.get("targetChain");
    let delivered = target.map(|tc| {
        tc["status"]
            .as_str()
            .map(|s| s.to_ascii_lowercase().contains("complet"))
            .unwrap_or(false)
    });
    let destination_tx = target
        .and_then(|tc| tc["transaction"]["txHash"].as_str())
        .map(String::from);
    let destination_timestamp = target
        .and_then(|tc| tc["timestamp"].as_str())
        .map(String::from);

    // ── token metadata ────────────────────────────────────────────────────────

    let data = &op["data"];
    let token_symbol = data["symbol"].as_str().map(String::from);
    let token_amount = data["tokenAmount"].as_str().map(String::from);
    let token_amount_usd = data["usdAmount"].as_str().map(String::from);

    Ok(VaaStatus {
        emitter_chain,
        emitter_address,
        sequence,
        signed,
        signatures,
        delivered,
        source_tx_hash,
        source_from,
        source_timestamp,
        destination_chain_id,
        destination_address,
        destination_tx,
        destination_timestamp,
        token_symbol,
        token_amount,
        token_amount_usd,
    })
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_url_mainnet() {
        let url = api_url("0xdeadbeef", Network::Mainnet);
        assert!(url.starts_with("https://api.wormholescan.io/"));
        assert!(url.contains("txHash=0xdeadbeef"));
    }

    #[test]
    fn api_url_testnet() {
        let url = api_url("0xdeadbeef", Network::Testnet);
        assert!(url.starts_with("https://api.testnet.wormholescan.io/"));
        assert!(url.contains("txHash=0xdeadbeef"));
    }

    #[test]
    fn parse_full_response_with_delivery() {
        let body = serde_json::json!({
            "operations": [{
                "emitterChain": 2,
                "emitterAddress": {
                    "hex": "0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585"
                },
                "sequence": "283459",
                "vaa": {
                    "raw": base64::engine::general_purpose::STANDARD.encode(b"\x01\x00\x00\x00\x06\x0d"),
                    "guardianSetIndex": 6
                },
                "content": {
                    "standarizedProperties": {
                        "toChain": 1,
                        "toAddress": "7NoE35m1pPZEusgY9p2SERnZqH6eaK1eoswmn5dfzDiW"
                    }
                },
                "sourceChain": {
                    "timestamp": "2026-05-17T05:07:35Z",
                    "transaction": { "txHash": "0xabcd" },
                    "from": "0x1234",
                    "status": "confirmed"
                },
                "targetChain": {
                    "status": "completed",
                    "timestamp": "2026-05-17T05:30:00Z",
                    "transaction": { "txHash": "SolanaTxHash" }
                },
                "data": {
                    "symbol": "WETH",
                    "tokenAmount": "10",
                    "usdAmount": "21878.3"
                }
            }]
        });
        let s = parse_vaa_status(&body).unwrap();
        assert_eq!(s.emitter_chain, 2);
        assert_eq!(s.sequence, 283459);
        assert!(s.signed);
        assert_eq!(s.signatures, 13);
        assert_eq!(s.delivered, Some(true));
        assert_eq!(s.source_tx_hash.as_deref(), Some("0xabcd"));
        assert_eq!(s.source_from.as_deref(), Some("0x1234"));
        assert_eq!(s.source_timestamp.as_deref(), Some("2026-05-17T05:07:35Z"));
        assert_eq!(s.destination_chain_id, Some(1));
        assert_eq!(
            s.destination_address.as_deref(),
            Some("7NoE35m1pPZEusgY9p2SERnZqH6eaK1eoswmn5dfzDiW")
        );
        assert_eq!(s.destination_tx.as_deref(), Some("SolanaTxHash"));
        assert_eq!(
            s.destination_timestamp.as_deref(),
            Some("2026-05-17T05:30:00Z")
        );
        assert_eq!(s.token_symbol.as_deref(), Some("WETH"));
        assert_eq!(s.token_amount.as_deref(), Some("10"));
    }

    #[test]
    fn parse_unsigned_no_delivery() {
        let body = serde_json::json!({
            "operations": [{
                "emitterChain": 2,
                "emitterAddress": { "hex": "0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585" },
                "sequence": "643990",
                "content": { "standarizedProperties": { "toChain": 1, "toAddress": "" } },
                "sourceChain": { "status": "confirmed" }
            }]
        });
        let s = parse_vaa_status(&body).unwrap();
        assert!(!s.signed);
        assert_eq!(s.signatures, 0);
        assert_eq!(s.delivered, None);
        assert!(s.destination_tx.is_none());
        assert!(s.destination_address.is_none()); // empty string filtered out
    }

    #[test]
    fn parse_missing_emitter_chain_returns_error() {
        let body = serde_json::json!({
            "operations": [{
                "emitterAddress": { "hex": "0000...585" },
                "sequence": "1"
            }]
        });
        assert!(parse_vaa_status(&body).is_err());
    }

    #[test]
    fn vaa_api_url_contains_chain_address_sequence() {
        let url = vaa_api_url(
            2,
            "0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585",
            42,
            Network::Mainnet,
        );
        assert!(url.contains("/api/v1/vaas/2/"));
        assert!(url.contains("/42"));
        assert!(url.starts_with("https://api.wormholescan.io/"));
    }
}
