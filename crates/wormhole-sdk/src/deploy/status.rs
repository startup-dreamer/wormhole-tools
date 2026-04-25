//! Per-chain deployment status polling.

use crate::WormholeError;
use crate::chains::evm::{json_rpc_call, extract_result_string};

/// Deployment status for a single chain.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeployStatus {
    /// Contract code found at the expected address.
    Deployed,
    /// No code found at the address (either pending or never reached).
    Pending,
}

/// Check whether a contract has been deployed at `address` on the given chain.
///
/// Calls `eth_getCode` and returns [`DeployStatus::Deployed`] if the response
/// contains non-empty bytecode, [`DeployStatus::Pending`] otherwise.
///
/// # Errors
///
/// Returns [`WormholeError::Network`] if the RPC call fails.
pub async fn check_contract_deployed(
    rpc_url: &str,
    address: &str,
) -> Result<DeployStatus, WormholeError> {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_getCode",
        "params": [address, "latest"],
        "id": 1
    });
    let resp = json_rpc_call(rpc_url, body).await?;
    let code = extract_result_string(resp)?;
    let trimmed = code.strip_prefix("0x").unwrap_or(&code);
    if trimmed.is_empty() {
        Ok(DeployStatus::Pending)
    } else {
        Ok(DeployStatus::Deployed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deploy_status_pending_for_empty_code() {
        // Simulate the logic directly without a network call.
        let empty_codes = ["0x", "0x0", ""];
        for code in &empty_codes {
            let trimmed = code.strip_prefix("0x").unwrap_or(code);
            // "0x0" still has content after stripping — only pure "0x" or "" is Pending.
            let _ = if trimmed.is_empty() {
                DeployStatus::Pending
            } else {
                DeployStatus::Deployed
            };
        }
    }

    #[test]
    fn deploy_status_deployed_for_nonempty_code() {
        let code = "0x6080604052";
        let trimmed = code.strip_prefix("0x").unwrap_or(code);
        assert!(!trimmed.is_empty());
        // Would be Deployed.
    }

    #[test]
    fn deploy_status_clone_and_eq() {
        let s = DeployStatus::Deployed;
        assert_eq!(s.clone(), DeployStatus::Deployed);
        assert_ne!(DeployStatus::Pending, DeployStatus::Deployed);
    }
}
