//! Aptos chain interaction via the Aptos REST API.
//!
//! Communicates with an Aptos node over HTTP using the v1 REST API.
//! Move transaction submission (init_wormhole, init_token_bridge) requires
//! ed25519 signing and is not yet implemented; those functions return
//! [`WormholeError::Unsupported`].

use serde::Deserialize;

use crate::WormholeError;

/// Default Aptos devnet node RPC URL (Wormhole Tilt / local validator).
pub const DEVNET_RPC: &str = "http://0.0.0.0:8080/v1";

/// Wormhole core bridge deployer address on Aptos devnet.
pub const DEVNET_CORE: &str = "277fa055b6a73c42c0662d5236c65c864ccbf2d4abd21f174a30c8b786eab84b";

/// Ledger (chain) information returned by the Aptos node.
#[derive(Debug, Deserialize, serde::Serialize)]
pub struct LedgerInfo {
    /// Aptos chain ID (different from Wormhole chain ID).
    pub chain_id: u8,
    /// Current epoch number.
    pub epoch: String,
    /// Current ledger version.
    pub ledger_version: String,
}

/// Ensure the Aptos REST API URL ends with `/v1`.
fn normalize_url(url: &str) -> String {
    let url = url.trim_end_matches('/');
    if url.ends_with("/v1") {
        url.to_string()
    } else {
        format!("{url}/v1")
    }
}

/// Fetch ledger info from an Aptos node.
///
/// Issues `GET {rpc_url}` (the Aptos v1 index endpoint) and returns the
/// ledger metadata, verifying basic connectivity to the node.
///
/// # Errors
///
/// Returns [`WormholeError::Network`] if the HTTP request fails or the
/// response cannot be parsed.
pub async fn ledger_info(rpc_url: &str) -> Result<LedgerInfo, WormholeError> {
    let url = normalize_url(rpc_url);
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| WormholeError::Network(e.to_string()))?;

    resp.json::<LedgerInfo>()
        .await
        .map_err(|e| WormholeError::Network(format!("failed to parse Aptos ledger info: {e}")))
}

/// Initialize the Wormhole core contract on Aptos (not yet implemented).
///
/// Calls the `init` entry function on the core bridge Move module.
/// Requires ed25519 signing of an Aptos transaction, which is not yet
/// supported.
///
/// # Errors
///
/// Always returns [`WormholeError::Unsupported`].
pub async fn init_wormhole(
    _rpc_url: &str,
    _contract_address: &str,
    _chain_id: u16,
    _governance_chain_id: u16,
    _governance_address: &str,
) -> Result<(), WormholeError> {
    Err(WormholeError::Unsupported(
        "Aptos Move transaction submission requires ed25519 signing (not yet implemented); \
         use the TypeScript worm CLI for Aptos init operations"
            .to_string(),
    ))
}

/// Initialize the Wormhole token bridge contract on Aptos (not yet implemented).
///
/// Calls `token_bridge::init` on the Move module.
/// Requires ed25519 signing of an Aptos transaction, which is not yet
/// supported.
///
/// # Errors
///
/// Always returns [`WormholeError::Unsupported`].
pub async fn init_token_bridge(
    _rpc_url: &str,
    _contract_address: &str,
) -> Result<(), WormholeError> {
    Err(WormholeError::Unsupported(
        "Aptos Move transaction submission requires ed25519 signing (not yet implemented); \
         use the TypeScript worm CLI for Aptos init operations"
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
    fn devnet_rpc_has_expected_format() {
        assert!(DEVNET_RPC.starts_with("http://"));
        assert!(DEVNET_RPC.ends_with("/v1"));
    }

    #[test]
    fn normalize_url_appends_v1() {
        assert_eq!(
            normalize_url("https://fullnode.mainnet.aptoslabs.com"),
            "https://fullnode.mainnet.aptoslabs.com/v1"
        );
        assert_eq!(
            normalize_url("https://fullnode.mainnet.aptoslabs.com/v1"),
            "https://fullnode.mainnet.aptoslabs.com/v1"
        );
        assert_eq!(
            normalize_url("https://fullnode.mainnet.aptoslabs.com/v1/"),
            "https://fullnode.mainnet.aptoslabs.com/v1"
        );
    }

    #[test]
    fn devnet_core_is_64_hex_chars() {
        assert_eq!(DEVNET_CORE.len(), 64);
        assert!(DEVNET_CORE.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[tokio::test]
    async fn init_wormhole_returns_unsupported() {
        let result = init_wormhole("http://localhost:8080/v1", DEVNET_CORE, 22, 1, "").await;
        assert!(matches!(result, Err(WormholeError::Unsupported(_))));
    }

    #[tokio::test]
    async fn init_token_bridge_returns_unsupported() {
        let result = init_token_bridge("http://localhost:8080/v1", DEVNET_CORE).await;
        assert!(matches!(result, Err(WormholeError::Unsupported(_))));
    }
}
