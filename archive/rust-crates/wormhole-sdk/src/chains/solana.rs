//! Solana chain interaction via the Solana JSON-RPC API.
//!
//! Uses raw HTTP JSON-RPC (no `solana-client` SDK) to minimise dependencies,
//! following the same pattern as `near.rs`.
//!
//! ## PDA note
//!
//! `read_guardian_set` and `read_sequence` accept the **account address** directly
//! (not the program ID), as computing Solana PDAs from a program ID requires SHA256
//! and ed25519 curve math not available in the current dependency set.

use serde::Deserialize;

use crate::WormholeError;

/// Default Solana mainnet RPC endpoint.
pub const MAINNET_RPC: &str = "https://api.mainnet-beta.solana.com";

/// Default Solana devnet RPC endpoint.
pub const DEVNET_RPC: &str = "https://api.devnet.solana.com";

/// Wormhole core bridge state PDA on Solana mainnet.
///
/// Derived from seeds `[b"Bridge"]` and program ID `worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth`.
pub const MAINNET_BRIDGE_STATE: &str = "2yVjuQwpsvdsrywzsJJVs9Ueh4zayyo5DYJbBNc3DDpn";

// ── public types ──────────────────────────────────────────────────────────────

/// Basic Solana node connectivity information.
#[derive(Debug, Deserialize, serde::Serialize)]
pub struct SolanaNodeInfo {
    /// Current slot reported by the validator.
    pub slot: u64,
    /// Health status string (`"ok"` when healthy).
    pub health: String,
}

// ── public API ────────────────────────────────────────────────────────────────

/// Fetch basic Solana node information.
///
/// Issues `getHealth` and `getSlot` JSON-RPC calls and returns the results.
///
/// # Errors
///
/// Returns [`WormholeError::Network`] on HTTP failure or if either call returns
/// an error response.
pub async fn node_info(rpc_url: &str) -> Result<SolanaNodeInfo, WormholeError> {
    let health = get_health(rpc_url).await?;
    let slot = get_slot(rpc_url).await?;
    Ok(SolanaNodeInfo { slot, health })
}

/// Read the current guardian set index from the Wormhole bridge state account.
///
/// Calls `getAccountInfo` on `bridge_state_address` and decodes `guardian_set_index`
/// as a little-endian `u32` starting at byte offset 8 of the account data
/// (offset 0–7 is the Anchor account discriminator).
///
/// Pass the Wormhole **bridge state** account address (a program-derived address),
/// not the program ID itself.
///
/// # Errors
///
/// Returns [`WormholeError::Network`] on RPC failure and
/// [`WormholeError::InvalidEncoding`] if the account data is too short.
pub async fn read_guardian_set(
    rpc_url: &str,
    bridge_state_address: &str,
) -> Result<u32, WormholeError> {
    let data = get_account_data(rpc_url, bridge_state_address).await?;
    decode_guardian_set_index(&data)
}

/// Read the emitter sequence number from a Wormhole emitter sequence PDA.
///
/// Calls `getAccountInfo` on `emitter_sequence_address` and decodes a
/// little-endian `u64` from byte offset 0 of the account data.
///
/// # Errors
///
/// Returns [`WormholeError::Network`] on RPC failure and
/// [`WormholeError::InvalidEncoding`] if the account data is too short.
pub async fn read_sequence(
    rpc_url: &str,
    emitter_sequence_address: &str,
) -> Result<u64, WormholeError> {
    let data = get_account_data(rpc_url, emitter_sequence_address).await?;
    decode_sequence(&data)
}

// ── helpers ───────────────────────────────────────────────────────────────────

/// Issue `getHealth` and return the status string.
async fn get_health(rpc_url: &str) -> Result<String, WormholeError> {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getHealth"
    });
    let resp = json_rpc(rpc_url, body).await?;

    // getHealth returns "ok" on success or an error object on failure.
    if let Some(err) = resp.get("error") {
        return Ok(format!("unhealthy: {err}"));
    }
    Ok(resp["result"].as_str().unwrap_or("ok").to_string())
}

/// Issue `getSlot` and return the current slot number.
async fn get_slot(rpc_url: &str) -> Result<u64, WormholeError> {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getSlot"
    });
    let resp = json_rpc(rpc_url, body).await?;

    resp["result"]
        .as_u64()
        .ok_or_else(|| WormholeError::Network("missing slot in getSlot response".to_string()))
}

/// Issue `getAccountInfo` and return the base64-decoded account data.
async fn get_account_data(rpc_url: &str, address: &str) -> Result<Vec<u8>, WormholeError> {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getAccountInfo",
        "params": [address, {"encoding": "base64"}]
    });
    let resp = json_rpc(rpc_url, body).await?;

    if let Some(err) = resp.get("error") {
        return Err(WormholeError::Network(format!(
            "getAccountInfo error: {err}"
        )));
    }

    let encoded = resp["result"]["value"]["data"][0]
        .as_str()
        .ok_or_else(|| WormholeError::Network("missing account data in response".to_string()))?;

    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| WormholeError::Network(format!("failed to decode account data: {e}")))
}

/// Decode `guardian_set_index` as a little-endian `u32` at offset 0 in raw account data.
///
/// The Wormhole core bridge is not an Anchor program; the `guardian_set_index` field
/// sits at byte offset 0 of the bridge state account (no discriminator prefix).
fn decode_guardian_set_index(data: &[u8]) -> Result<u32, WormholeError> {
    if data.len() < 4 {
        return Err(WormholeError::InvalidEncoding(format!(
            "account data too short to read guardian_set_index: {} bytes",
            data.len()
        )));
    }
    Ok(u32::from_le_bytes([data[0], data[1], data[2], data[3]]))
}

/// Decode emitter sequence as a little-endian `u64` from offset 0 in raw account data.
fn decode_sequence(data: &[u8]) -> Result<u64, WormholeError> {
    if data.len() < 8 {
        return Err(WormholeError::InvalidEncoding(format!(
            "account data too short to read sequence: {} bytes",
            data.len()
        )));
    }
    Ok(u64::from_le_bytes([
        data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7],
    ]))
}

/// Issue a JSON-RPC POST request and parse the response.
async fn json_rpc(
    rpc_url: &str,
    body: serde_json::Value,
) -> Result<serde_json::Value, WormholeError> {
    let client = reqwest::Client::new();
    let resp = client
        .post(rpc_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| WormholeError::Network(e.to_string()))?;

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| WormholeError::Network(format!("failed to parse JSON-RPC response: {e}")))
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_info_deserialization() {
        // SolanaNodeInfo can be constructed from known-good data.
        let info = SolanaNodeInfo {
            slot: 123_456_789,
            health: "ok".to_string(),
        };
        assert_eq!(info.slot, 123_456_789);
        assert_eq!(info.health, "ok");
    }

    #[test]
    fn decode_guardian_set_index_at_offset_0() {
        // Wormhole bridge state (non-Anchor): guardian_set_index at byte 0
        let mut data = vec![0u8; 20];
        data[0] = 6; // guardian_set_index = 6
        assert_eq!(decode_guardian_set_index(&data).unwrap(), 6u32);
    }

    #[test]
    fn decode_guardian_set_index_too_short_returns_error() {
        let data = vec![0u8; 3]; // too short (need at least 4)
        assert!(decode_guardian_set_index(&data).is_err());
    }

    #[test]
    fn decode_sequence_little_endian() {
        // sequence = 0x0102030405060708 in little-endian
        let data = [0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01];
        let seq = decode_sequence(&data).unwrap();
        assert_eq!(seq, 0x0102030405060708u64);
    }
}
