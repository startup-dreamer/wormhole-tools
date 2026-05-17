//! Solana wallet provider (stub — full signing requires WH-016 keypair support).

use super::WalletProvider;

/// Solana wallet loaded from a base58-encoded 64-byte keypair.
///
/// The keypair format matches `solana-keygen` output: 32-byte secret scalar
/// followed by 32-byte Ed25519 public key.  The public key (last 32 bytes)
/// is base58-encoded and used as the wallet address.
///
/// `sign_tx` is not yet implemented; it always returns an error until full
/// Ed25519 transaction signing is added.
pub struct SolanaWallet {
    address: String,
}

impl SolanaWallet {
    /// Load a `SolanaWallet` from a base58-encoded 64-byte keypair.
    ///
    /// # Errors
    ///
    /// Returns an error if the base58 is invalid or the keypair is not 64 bytes.
    pub fn from_base58(key: &str) -> anyhow::Result<Self> {
        let bytes = bs58::decode(key)
            .into_vec()
            .map_err(|e| anyhow::anyhow!("invalid base58 key: {e}"))?;
        if bytes.len() != 64 {
            return Err(anyhow::anyhow!(
                "expected 64-byte keypair, got {} bytes",
                bytes.len()
            ));
        }
        let address = bs58::encode(&bytes[32..]).into_string();
        Ok(Self { address })
    }
}

impl WalletProvider for SolanaWallet {
    fn address(&self) -> &str {
        &self.address
    }

    fn sign_tx(&self, _tx: &[u8]) -> anyhow::Result<Vec<u8>> {
        Err(anyhow::anyhow!(
            "Solana transaction signing not yet implemented"
        ))
    }
}
