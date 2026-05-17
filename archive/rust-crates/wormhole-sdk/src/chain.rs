//! Abstract chain interface for generic Wormhole commands.
//!
//! The [`WormholeChain`] trait lets commands like `status`, `redeem`, and
//! `latency` dispatch to chain-specific implementations without per-chain
//! match arms.

use async_trait::async_trait;

use crate::{
    chains::evm::{self, SubmitParams},
    WormholeError,
};

// ── trait ─────────────────────────────────────────────────────────────────────

/// Abstract interface for interacting with a Wormhole-enabled chain.
#[async_trait]
pub trait WormholeChain: Send + Sync {
    /// Wormhole protocol chain ID.
    fn chain_id(&self) -> u16;

    /// Fetch basic node connectivity information as a JSON value.
    ///
    /// # Errors
    ///
    /// Returns an error if the RPC call fails.
    async fn node_info(&self) -> anyhow::Result<serde_json::Value>;

    /// Read the current guardian set index from the on-chain contract.
    ///
    /// # Errors
    ///
    /// Returns an error if the RPC call fails.
    async fn guardian_set_index(&self) -> anyhow::Result<u32>;

    /// Submit a raw VAA to the chain and return the resulting transaction hash.
    ///
    /// `from` is an optional unlocked sender address for devnet use.
    ///
    /// # Errors
    ///
    /// Returns an error if encoding or the RPC call fails.
    async fn submit_vaa(&self, vaa: &[u8], from: Option<&str>) -> anyhow::Result<String>;
}

// ── EVM implementation ────────────────────────────────────────────────────────

/// A [`WormholeChain`] implementation backed by an EVM-compatible chain.
pub struct EvmChain {
    /// Wormhole chain ID for this chain.
    id: u16,
    /// HTTP(S) JSON-RPC URL of the EVM node.
    rpc: String,
    /// Wormhole core bridge contract address (`0x`-prefixed hex).
    contract: String,
}

impl EvmChain {
    /// Construct a new `EvmChain`.
    pub fn new(id: u16, rpc: impl Into<String>, contract: impl Into<String>) -> Self {
        Self {
            id,
            rpc: rpc.into(),
            contract: contract.into(),
        }
    }
}

#[async_trait]
impl WormholeChain for EvmChain {
    fn chain_id(&self) -> u16 {
        self.id
    }

    async fn node_info(&self) -> anyhow::Result<serde_json::Value> {
        let chain_id = evm::read_chain_id(&self.rpc, &self.contract)
            .await
            .map_err(|e| anyhow::anyhow!("{e}"))?;
        Ok(serde_json::json!({ "chain_id": chain_id }))
    }

    async fn guardian_set_index(&self) -> anyhow::Result<u32> {
        evm::read_guardian_set_index(&self.rpc, &self.contract)
            .await
            .map_err(|e| anyhow::anyhow!("{e}"))
    }

    async fn submit_vaa(&self, vaa: &[u8], from: Option<&str>) -> anyhow::Result<String> {
        let vaa_hex = hex::encode(vaa);
        evm::submit_vaa(SubmitParams {
            vaa_hex: &vaa_hex,
            rpc_url: &self.rpc,
            contract_address: &self.contract,
            from_address: from,
            evm_key: None,
        })
        .await
        .map_err(|e| anyhow::anyhow!("{e}"))
    }
}

// ── factory ───────────────────────────────────────────────────────────────────

/// Construct a [`WormholeChain`] trait object from a chain name, RPC URL, and
/// contract address.
///
/// Currently only EVM chains are supported.  The `chain` parameter is matched
/// against the Wormhole chain name (e.g. `"ethereum"`, `"bsc"`, `"polygon"`).
///
/// # Errors
///
/// Returns [`WormholeError::Unsupported`] if `chain` is not a recognised EVM
/// chain name.
pub fn chain_from_rpc(
    chain: &str,
    rpc: &str,
    contract: &str,
) -> Result<Box<dyn WormholeChain>, WormholeError> {
    let chain_id = crate::info::chain_id(chain)?;

    // All named chains in the info table are EVM-compatible for this factory.
    // Non-EVM chains (Solana = 1, Aptos = 22, Sui = 21, NEAR = 15) could be
    // added here once their modules implement the trait.
    Ok(Box::new(EvmChain::new(chain_id, rpc, contract)))
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chain_from_rpc_ethereum_returns_evm_chain() {
        let chain = chain_from_rpc(
            "ethereum",
            "http://localhost:8545",
            "0xC89Ce4735882C9F0f0FE26686c53074E09B0D550",
        )
        .unwrap();
        assert_eq!(chain.chain_id(), 2); // Wormhole chain ID 2 = Ethereum
    }

    #[test]
    fn chain_from_rpc_unknown_chain_returns_error() {
        let result = chain_from_rpc("boguschain", "http://localhost:8545", "0x0");
        assert!(matches!(result, Err(WormholeError::Unsupported(_))));
    }

    #[test]
    fn evm_chain_chain_id() {
        let chain = EvmChain::new(2, "http://localhost:8545", "0x0");
        assert_eq!(chain.chain_id(), 2);
    }
}
