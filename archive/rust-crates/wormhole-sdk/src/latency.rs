//! Guardian signing latency statistics via the Wormhole Scan API.
//!
//! Fetches recent VAAs for a source chain and computes p50/p95/min/max latency
//! (time from block timestamp to first full guardian quorum).

use crate::{chains::Network, WormholeError};

/// Timing data for a single VAA.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct VaaTiming {
    /// VAA sequence number.
    pub sequence: u64,
    /// Block timestamp of the emitting transaction (Unix seconds).
    pub block_time: u64,
    /// Timestamp when the VAA was first fully signed by quorum (Unix seconds).
    pub signed_time: u64,
    /// Guardian signing latency in seconds (`signed_time - block_time`).
    pub latency_secs: u64,
}

/// Percentile summary of guardian signing latencies.
#[derive(Debug, serde::Serialize)]
pub struct Percentiles {
    /// Median latency in seconds.
    pub p50_secs: u64,
    /// 95th-percentile latency in seconds.
    pub p95_secs: u64,
    /// Minimum latency in seconds.
    pub min_secs: u64,
    /// Maximum latency in seconds.
    pub max_secs: u64,
}

/// Build the Wormhole Scan API URL for recent VAAs on a chain.
pub fn vaas_url(chain_id: u16, count: u32, network: Network) -> String {
    let base = match network {
        Network::Mainnet => "https://api.wormholescan.io",
        Network::Testnet | Network::Devnet => "https://api.testnet.wormholescan.io",
    };
    format!("{base}/api/v1/vaas/{chain_id}?pageSize={count}")
}

/// Fetch the `count` most recent VAAs for `chain_id` and return their timing data.
///
/// Fields `timestamp` (block time) and `indexedAt` (indexing time, used as a
/// proxy for quorum time when `guardianSetIndex` sign time is unavailable) are
/// read from the API response.
///
/// # Errors
///
/// Returns [`WormholeError::Network`] on HTTP failure or if `count` is zero.
pub async fn fetch_recent_vaas(
    chain_id: u16,
    network: Network,
    count: u32,
) -> Result<Vec<VaaTiming>, WormholeError> {
    if count == 0 {
        return Err(WormholeError::Network(
            "count must be greater than zero".to_string(),
        ));
    }

    let url = vaas_url(chain_id, count, network);
    let client = reqwest::Client::new();

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| WormholeError::Network(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(WormholeError::Network(format!(
            "Wormhole Scan API returned status {}: {url}",
            resp.status()
        )));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| WormholeError::Network(format!("failed to parse API response: {e}")))?;

    parse_vaa_timings(&body)
}

/// Parse an ISO-8601 UTC timestamp string (e.g. `"2026-05-17T06:36:14Z"`) to Unix seconds.
fn iso8601_to_unix(s: &str) -> Option<u64> {
    let s = s.trim_end_matches('Z');
    let s = s.split('.').next().unwrap_or(s); // drop sub-second fraction
    if s.len() < 19 {
        return None;
    }
    let year: i64 = s[0..4].parse().ok()?;
    let month: i64 = s[5..7].parse().ok()?;
    let day: i64 = s[8..10].parse().ok()?;
    let hour: i64 = s[11..13].parse().ok()?;
    let min: i64 = s[14..16].parse().ok()?;
    let sec: i64 = s[17..19].parse().ok()?;

    // Howard Hinnant's days-from-civil algorithm (days since 1970-01-01).
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;

    u64::try_from(days * 86400 + hour * 3600 + min * 60 + sec).ok()
}

/// Extract [`VaaTiming`] records from a Wormhole Scan VAA-list API response.
fn parse_vaa_timings(body: &serde_json::Value) -> Result<Vec<VaaTiming>, WormholeError> {
    let entries = body.get("data").and_then(|d| d.as_array()).ok_or_else(|| {
        WormholeError::Network("missing 'data' array in API response".to_string())
    })?;

    let mut timings = Vec::with_capacity(entries.len());
    for entry in entries {
        let sequence = entry["sequence"]
            .as_str()
            .and_then(|s| s.parse::<u64>().ok())
            .or_else(|| entry["sequence"].as_u64())
            .unwrap_or(0);

        // `timestamp` is the block time (ISO-8601 string or Unix integer).
        let block_time = entry["timestamp"]
            .as_str()
            .and_then(iso8601_to_unix)
            .or_else(|| entry["timestamp"].as_u64())
            .unwrap_or(0);

        // `indexedAt` is the closest proxy for guardian quorum time.
        let signed_time = entry["indexedAt"]
            .as_str()
            .and_then(iso8601_to_unix)
            .or_else(|| entry["indexedAt"].as_u64())
            .unwrap_or(block_time);

        let latency_secs = signed_time.saturating_sub(block_time);

        timings.push(VaaTiming {
            sequence,
            block_time,
            signed_time,
            latency_secs,
        });
    }
    Ok(timings)
}

/// Compute p50, p95, min, and max latency over a slice of [`VaaTiming`].
///
/// Returns `None` if `timings` is empty.
pub fn compute_percentiles(timings: &[VaaTiming]) -> Option<Percentiles> {
    if timings.is_empty() {
        return None;
    }

    let mut lats: Vec<u64> = timings.iter().map(|t| t.latency_secs).collect();
    lats.sort_unstable();

    let n = lats.len();
    let min_secs = lats[0];
    let max_secs = lats[n - 1];

    let p50_secs = lats[(n * 50).div_ceil(100).saturating_sub(1).min(n - 1)];
    let p95_secs = lats[(n * 95).div_ceil(100).saturating_sub(1).min(n - 1)];

    Some(Percentiles {
        p50_secs,
        p95_secs,
        min_secs,
        max_secs,
    })
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vaas_url_mainnet() {
        let url = vaas_url(2, 20, Network::Mainnet);
        assert!(url.starts_with("https://api.wormholescan.io/"));
        assert!(url.contains("pageSize=20"));
        assert!(url.contains("/vaas/2"));
    }

    #[test]
    fn vaas_url_testnet() {
        let url = vaas_url(2, 5, Network::Testnet);
        assert!(url.starts_with("https://api.testnet.wormholescan.io/"));
    }

    #[test]
    fn percentile_known_data() {
        // 10 values: 1..=10 → p50 = 5, p95 = 10, min = 1, max = 10
        let timings: Vec<VaaTiming> = (1u64..=10)
            .map(|i| VaaTiming {
                sequence: i,
                block_time: 0,
                signed_time: i,
                latency_secs: i,
            })
            .collect();
        let p = compute_percentiles(&timings).unwrap();
        assert_eq!(p.min_secs, 1);
        assert_eq!(p.max_secs, 10);
        assert_eq!(p.p50_secs, 5);
        assert_eq!(p.p95_secs, 10);
    }

    #[test]
    fn parse_vaa_timings_from_api_response() {
        let body = serde_json::json!({
            "data": [
                { "sequence": 1, "timestamp": 1000, "indexedAt": 1013 },
                { "sequence": 2, "timestamp": 2000, "indexedAt": 2020 }
            ]
        });
        let timings = parse_vaa_timings(&body).unwrap();
        assert_eq!(timings.len(), 2);
        assert_eq!(timings[0].latency_secs, 13);
        assert_eq!(timings[1].latency_secs, 20);
    }

    #[test]
    fn parse_vaa_timings_iso8601_strings() {
        // "2026-05-17T06:36:14Z" → verify latency is non-zero
        let body = serde_json::json!({
            "data": [
                {
                    "sequence": "643990",
                    "timestamp": "2026-05-17T06:36:14Z",
                    "indexedAt": "2026-05-17T06:36:27Z"
                }
            ]
        });
        let timings = parse_vaa_timings(&body).unwrap();
        assert_eq!(timings.len(), 1);
        assert_eq!(timings[0].sequence, 643990);
        assert_eq!(timings[0].latency_secs, 13); // 27 - 14 = 13 seconds
        assert!(timings[0].block_time > 0);
    }

    #[test]
    fn iso8601_to_unix_epoch() {
        assert_eq!(iso8601_to_unix("1970-01-01T00:00:00Z"), Some(0));
    }

    #[test]
    fn iso8601_to_unix_known_timestamp() {
        // 2026-05-17T00:00:00Z = 1778976000
        assert_eq!(iso8601_to_unix("2026-05-17T00:00:00Z"), Some(1778976000));
    }
}
