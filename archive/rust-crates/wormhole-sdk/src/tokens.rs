//! Token Bridge contract queries via EVM eth_call.
//!
//! Provides read-only queries against the Wormhole Token Bridge contract:
//! - [`wrapped_asset`] — look up the wrapped ERC-20 address for a foreign token
//! - [`is_wrapped_asset`] — check whether an address is a Wormhole-wrapped token

use sha3::Digest as _;

use crate::WormholeError;

// ── public API ────────────────────────────────────────────────────────────────

/// Look up the wrapped ERC-20 address for a foreign token on this chain.
///
/// Calls `wrappedAsset(uint16 chainId, bytes32 tokenAddress)` on the Token Bridge
/// contract and returns the resulting address as a `0x`-prefixed 40-hex string.
/// Returns `0x0000...0000` if the asset is not yet attested.
///
/// # Errors
///
/// Returns [`WormholeError::InvalidEncoding`] if `origin_address` cannot be
/// decoded, or [`WormholeError::Network`] on RPC failure.
pub async fn wrapped_asset(
    rpc_url: &str,
    token_bridge: &str,
    origin_chain: u16,
    origin_address: &str,
) -> Result<String, WormholeError> {
    let calldata = encode_wrapped_asset_call(origin_chain, origin_address)?;
    let result = eth_call(rpc_url, token_bridge, &calldata).await?;
    decode_address_result(&result)
}

/// Check whether an address is a Wormhole-wrapped token on this chain.
///
/// Calls `isWrappedAsset(address)` on the Token Bridge contract.
///
/// # Errors
///
/// Returns [`WormholeError::InvalidEncoding`] if `address` cannot be decoded,
/// or [`WormholeError::Network`] on RPC failure.
pub async fn is_wrapped_asset(
    rpc_url: &str,
    token_bridge: &str,
    address: &str,
) -> Result<bool, WormholeError> {
    let calldata = encode_is_wrapped_call(address)?;
    let result = eth_call(rpc_url, token_bridge, &calldata).await?;
    decode_bool_result(&result)
}

// ── encoding helpers ──────────────────────────────────────────────────────────

/// ABI-encode `wrappedAsset(uint16 chainId, bytes32 tokenAddress)`.
///
/// Layout: selector(4) | chainId(32, right-aligned) | tokenAddress(32)
fn encode_wrapped_asset_call(
    origin_chain: u16,
    origin_address: &str,
) -> Result<Vec<u8>, WormholeError> {
    let selector = fn_selector("wrappedAsset(uint16,bytes32)");

    // bytes32 token address: accept 20-byte (EVM) or 32-byte (universal)
    let addr_hex = origin_address.trim_start_matches("0x");
    let addr_bytes = hex::decode(addr_hex)
        .map_err(|e| WormholeError::InvalidEncoding(format!("invalid token address: {e}")))?;

    if addr_bytes.len() != 20 && addr_bytes.len() != 32 {
        return Err(WormholeError::InvalidEncoding(format!(
            "token address must be 20 or 32 bytes, got {}",
            addr_bytes.len()
        )));
    }

    // Pad to 32 bytes (left-pad for EVM 20-byte addresses)
    let mut token_word = [0u8; 32];
    let offset = 32 - addr_bytes.len();
    token_word[offset..].copy_from_slice(&addr_bytes);

    let mut out = Vec::with_capacity(4 + 32 + 32);
    out.extend_from_slice(&selector);
    // uint16 chainId: right-aligned in 32 bytes
    out.extend_from_slice(&[0u8; 30]);
    out.extend_from_slice(&origin_chain.to_be_bytes());
    // bytes32 tokenAddress
    out.extend_from_slice(&token_word);
    Ok(out)
}

/// ABI-encode `isWrappedAsset(address)`.
///
/// Layout: selector(4) | address(32, 12 zero bytes + 20-byte address)
fn encode_is_wrapped_call(address: &str) -> Result<Vec<u8>, WormholeError> {
    let selector = fn_selector("isWrappedAsset(address)");

    let addr_hex = address.trim_start_matches("0x");
    if addr_hex.len() != 40 {
        return Err(WormholeError::InvalidEncoding(format!(
            "address must be 40 hex chars, got {}",
            addr_hex.len()
        )));
    }
    let addr_bytes = hex::decode(addr_hex)
        .map_err(|e| WormholeError::InvalidEncoding(format!("invalid address: {e}")))?;

    let mut out = Vec::with_capacity(4 + 32);
    out.extend_from_slice(&selector);
    out.extend_from_slice(&[0u8; 12]);
    out.extend_from_slice(&addr_bytes);
    Ok(out)
}

/// Compute the 4-byte ABI function selector for a signature string.
fn fn_selector(sig: &str) -> [u8; 4] {
    let hash = sha3::Keccak256::digest(sig.as_bytes());
    [hash[0], hash[1], hash[2], hash[3]]
}

// ── decoding helpers ──────────────────────────────────────────────────────────

/// Decode a 32-byte ABI result word as an EVM address (`0x`-prefixed, 40 hex chars).
fn decode_address_result(hex_result: &str) -> Result<String, WormholeError> {
    let s = hex_result.strip_prefix("0x").unwrap_or(hex_result);
    if s.len() < 40 {
        return Err(WormholeError::Network(format!(
            "eth_call result too short to decode address: {hex_result}"
        )));
    }
    // Address is right-aligned in the 32-byte word (last 40 hex chars).
    Ok(format!("0x{}", &s[s.len() - 40..]))
}

/// Decode a 32-byte ABI result word as a `bool`.
fn decode_bool_result(hex_result: &str) -> Result<bool, WormholeError> {
    let s = hex_result.strip_prefix("0x").unwrap_or(hex_result);
    if s.len() < 2 {
        return Err(WormholeError::Network(format!(
            "eth_call result too short to decode bool: {hex_result}"
        )));
    }
    // Last byte of the 32-byte word encodes the bool.
    let last_byte = &s[s.len() - 2..];
    Ok(last_byte != "00")
}

// ── JSON-RPC helper (mirrors evm.rs pattern) ─────────────────────────────────

async fn eth_call(rpc_url: &str, to: &str, data: &[u8]) -> Result<String, WormholeError> {
    let data_hex = format!("0x{}", hex::encode(data));
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_call",
        "params": [{"to": to, "data": data_hex}, "latest"],
        "id": 1
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(rpc_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| WormholeError::Network(e.to_string()))?;

    let value: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| WormholeError::Network(format!("failed to parse RPC response: {e}")))?;

    if let Some(err) = value.get("error") {
        return Err(WormholeError::Network(err.to_string()));
    }

    value["result"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| WormholeError::Network("missing result in JSON-RPC response".to_string()))
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrapped_asset_selector_is_correct() {
        let selector = fn_selector("wrappedAsset(uint16,bytes32)");
        let expected = {
            let h = sha3::Keccak256::digest(b"wrappedAsset(uint16,bytes32)");
            [h[0], h[1], h[2], h[3]]
        };
        assert_eq!(selector, expected);
    }

    #[test]
    fn is_wrapped_asset_selector_is_correct() {
        let selector = fn_selector("isWrappedAsset(address)");
        let expected = {
            let h = sha3::Keccak256::digest(b"isWrappedAsset(address)");
            [h[0], h[1], h[2], h[3]]
        };
        assert_eq!(selector, expected);
    }

    #[test]
    fn encode_wrapped_asset_has_correct_length_and_chain_id() {
        // 20-byte EVM address
        let data =
            encode_wrapped_asset_call(2, "0xDDb64fE46a91D46ee29420539FC25FD07c5FEa3E").unwrap();
        assert_eq!(data.len(), 4 + 32 + 32);
        // chain ID 2 encoded at bytes 36..38
        assert_eq!(data[34], 0);
        assert_eq!(data[35], 2);
    }

    #[test]
    fn decode_bool_true() {
        // 32-byte word with last byte = 0x01
        let result = format!("0x{:0>64}", "01");
        assert!(decode_bool_result(&result).unwrap());
    }

    #[test]
    fn decode_bool_false() {
        let result = format!("0x{:0>64}", "00");
        assert!(!decode_bool_result(&result).unwrap());
    }
}
