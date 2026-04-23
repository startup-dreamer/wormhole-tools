//! NEAR chain interaction via the NEAR JSON-RPC API.
//!
//! Communicates with a NEAR node over HTTP using the JSON-RPC 2.0 protocol.
//! Contract deployment and update operations require ed25519 signing and are
//! not yet implemented; those functions return [`WormholeError::Unsupported`].

use serde::Deserialize;

use crate::WormholeError;

/// Default NEAR devnet node RPC URL (Wormhole Tilt / local validator).
pub const DEVNET_RPC: &str = "http://localhost:3030";

/// Default NEAR testnet RPC URL.
pub const TESTNET_RPC: &str = "https://rpc.testnet.near.org";

/// NEAR node status: chain identity and sync state.
#[derive(Debug, Deserialize, serde::Serialize)]
pub struct NodeStatus {
    /// NEAR chain ID string (e.g. `"localnet"`, `"testnet"`, `"mainnet"`).
    pub chain_id: String,
    /// RPC address reported by the node.
    pub rpc_addr: String,
    /// Protocol version.
    pub protocol_version: u32,
}

/// Fetch node status from a NEAR node.
///
/// Calls `status` on the NEAR JSON-RPC endpoint to verify connectivity and
/// retrieve basic node metadata.
///
/// # Errors
///
/// Returns [`WormholeError::Network`] if the HTTP request fails or the
/// response cannot be parsed.
pub async fn node_status(rpc_url: &str) -> Result<NodeStatus, WormholeError> {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "dontcare",
        "method": "status",
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
        .map_err(|e| WormholeError::Network(format!("failed to parse NEAR status: {e}")))?;

    if let Some(err) = value.get("error") {
        return Err(WormholeError::Network(err.to_string()));
    }

    serde_json::from_value(value["result"].clone())
        .map_err(|e| WormholeError::Network(format!("failed to deserialize NEAR status: {e}")))
}

/// Update a NEAR contract using the Wormhole API (not yet implemented).
///
/// Requires ed25519 signing of a NEAR transaction, which is not yet supported.
///
/// # Errors
///
/// Always returns [`WormholeError::Unsupported`].
pub async fn contract_update(
    _rpc_url: &str,
    _account: &str,
    _wasm: &[u8],
) -> Result<(), WormholeError> {
    Err(WormholeError::Unsupported(
        "NEAR contract update requires ed25519 signing (not yet implemented); \
         use the TypeScript worm CLI for NEAR operations"
            .to_string(),
    ))
}

/// Deploy a NEAR contract (not yet implemented).
///
/// Requires ed25519 signing of a NEAR transaction, which is not yet supported.
///
/// # Errors
///
/// Always returns [`WormholeError::Unsupported`].
pub async fn deploy(_rpc_url: &str, _account: &str, _wasm: &[u8]) -> Result<(), WormholeError> {
    Err(WormholeError::Unsupported(
        "NEAR contract deployment requires ed25519 signing (not yet implemented); \
         use the TypeScript worm CLI for NEAR operations"
            .to_string(),
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
    fn testnet_rpc_uses_near_org() {
        assert!(TESTNET_RPC.contains("near.org"));
    }

    #[tokio::test]
    async fn contract_update_returns_unsupported() {
        let result = contract_update(DEVNET_RPC, "account.near", &[]).await;
        assert!(matches!(result, Err(WormholeError::Unsupported(_))));
    }

    #[tokio::test]
    async fn deploy_returns_unsupported() {
        let result = deploy(DEVNET_RPC, "account.near", &[]).await;
        assert!(matches!(result, Err(WormholeError::Unsupported(_))));
    }
}
