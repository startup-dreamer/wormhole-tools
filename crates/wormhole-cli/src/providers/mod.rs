//! Wallet provider abstraction for multi-chain transaction signing.
//!
//! Each chain family (EVM, Solana) has a concrete [`WalletProvider`]
//! implementation.  Commands use [`load_wallet`] to obtain a provider without
//! knowing the chain-specific key format.

pub mod evm;
pub mod solana;

// ── trait ─────────────────────────────────────────────────────────────────────

/// Abstract wallet interface for signing transactions across chains.
pub trait WalletProvider: Send + Sync {
    /// Signing address or public key as a string (chain-specific format).
    fn address(&self) -> &str;

    /// Sign an already-built transaction payload and return the signed bytes.
    ///
    /// # Errors
    ///
    /// Returns an error if signing fails or is not yet implemented for this chain.
    fn sign_tx(&self, tx: &[u8]) -> anyhow::Result<Vec<u8>>;
}

// ── factory ───────────────────────────────────────────────────────────────────

/// Load a [`WalletProvider`] for the given chain.
///
/// `private_key` takes precedence over environment variables.  When `None`,
/// the chain-specific env var is checked:
/// - EVM chains: `EVM_PRIVATE_KEY` (hex-encoded 32-byte scalar)
/// - Solana: `SOLANA_PRIVATE_KEY` (base58-encoded 64-byte keypair)
///
/// # Errors
///
/// Returns an error if `chain` is unrecognised, the private key is missing,
/// or the key material is malformed.
pub fn load_wallet(
    chain: &str,
    private_key: Option<&str>,
) -> anyhow::Result<Box<dyn WalletProvider>> {
    match chain {
        "solana" => {
            let raw = private_key
                .map(|s| s.to_string())
                .or_else(|| std::env::var("SOLANA_PRIVATE_KEY").ok())
                .ok_or_else(|| {
                    anyhow::anyhow!(
                        "no private key for solana: set SOLANA_PRIVATE_KEY or pass --private-key"
                    )
                })?;
            Ok(Box::new(solana::SolanaWallet::from_base58(&raw)?))
        }
        other => {
            wormhole_sdk::info::chain_id(other)
                .map_err(|_| anyhow::anyhow!("unsupported chain: {other}"))?;
            let raw = private_key
                .map(|s| s.to_string())
                .or_else(|| std::env::var("EVM_PRIVATE_KEY").ok())
                .ok_or_else(|| {
                    anyhow::anyhow!(
                        "no private key for {other}: set EVM_PRIVATE_KEY or pass --private-key"
                    )
                })?;
            Ok(Box::new(evm::EvmWallet::from_hex(&raw)?))
        }
    }
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_wallet_unknown_chain_returns_error() {
        let result = load_wallet("boguschain", Some("deadbeef"));
        let err = result.err().expect("expected an error");
        assert!(err.to_string().contains("unsupported chain"));
    }

    #[test]
    fn load_wallet_solana_missing_key_returns_error() {
        // This test assumes SOLANA_PRIVATE_KEY is not set in the environment.
        unsafe { std::env::remove_var("SOLANA_PRIVATE_KEY") };
        let result = load_wallet("solana", None);
        assert!(result.is_err());
    }

    #[test]
    fn load_wallet_evm_missing_key_returns_error() {
        // This test assumes EVM_PRIVATE_KEY is not set in the environment.
        unsafe { std::env::remove_var("EVM_PRIVATE_KEY") };
        let result = load_wallet("ethereum", None);
        assert!(result.is_err());
    }
}
