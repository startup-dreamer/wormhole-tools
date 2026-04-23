//! Sui chain interaction via the Sui JSON-RPC API.
//!
//! Communicates with a Sui node over HTTP using the JSON-RPC 2.0 protocol.
//! Package deployment and object mutation require ed25519/secp256k1 signing
//! and are not yet implemented; those functions return
//! [`WormholeError::Unsupported`].

use crate::WormholeError;

/// Default Sui devnet node RPC URL (Wormhole Tilt / local fullnode).
pub const DEVNET_RPC: &str = "http://localhost:9000";

/// Default Sui testnet RPC URL.
pub const TESTNET_RPC: &str = "https://fullnode.testnet.sui.io:443";

/// Summary of current Sui node state.
#[derive(Debug, serde::Serialize)]
pub struct NodeInfo {
    /// Latest checkpoint sequence number (proxy for block height).
    pub latest_checkpoint: u64,
}

/// Fetch the latest checkpoint sequence number from a Sui node.
///
/// Calls `sui_getLatestCheckpointSequenceNumber` via JSON-RPC to verify
/// connectivity and retrieve the current chain tip.
///
/// # Errors
///
/// Returns [`WormholeError::Network`] if the HTTP request fails or the
/// response cannot be parsed.
pub async fn node_info(rpc_url: &str) -> Result<NodeInfo, WormholeError> {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sui_getLatestCheckpointSequenceNumber",
        "params": []
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
        .map_err(|e| WormholeError::Network(format!("failed to parse Sui response: {e}")))?;

    if let Some(err) = value.get("error") {
        return Err(WormholeError::Network(err.to_string()));
    }

    // Result is a string-encoded u64 (Sui encodes large integers as strings)
    let checkpoint = value["result"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .or_else(|| value["result"].as_u64())
        .ok_or_else(|| {
            WormholeError::Network(format!(
                "unexpected Sui checkpoint result: {}",
                value["result"]
            ))
        })?;

    Ok(NodeInfo {
        latest_checkpoint: checkpoint,
    })
}

/// Deploy a Sui package (not yet implemented).
///
/// Requires secp256k1/ed25519 signing of a Sui transaction, which is not yet
/// supported.
///
/// # Errors
///
/// Always returns [`WormholeError::Unsupported`].
pub async fn deploy_package(_rpc_url: &str, _package_path: &str) -> Result<(), WormholeError> {
    Err(WormholeError::Unsupported(
        "Sui package deployment requires transaction signing (not yet implemented); \
         use the TypeScript worm CLI for Sui deploy operations"
            .to_string(),
    ))
}

/// Query a Sui object by ID (not yet implemented).
///
/// Returns [`WormholeError::Unsupported`] until query support is added.
///
/// # Errors
///
/// Always returns [`WormholeError::Unsupported`].
pub async fn get_object(_rpc_url: &str, _object_id: &str) -> Result<(), WormholeError> {
    Err(WormholeError::Unsupported(
        "Sui object query not yet implemented".to_string(),
    ))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn devnet_rpc_uses_localhost() {
        assert!(DEVNET_RPC.contains("localhost"));
    }

    #[test]
    fn testnet_rpc_uses_sui_io() {
        assert!(TESTNET_RPC.contains("sui.io"));
    }

    #[tokio::test]
    async fn deploy_package_returns_unsupported() {
        let result = deploy_package(DEVNET_RPC, "/tmp/package").await;
        assert!(matches!(result, Err(WormholeError::Unsupported(_))));
    }

    #[tokio::test]
    async fn get_object_returns_unsupported() {
        let result = get_object(DEVNET_RPC, "0x1").await;
        assert!(matches!(result, Err(WormholeError::Unsupported(_))));
    }
}
