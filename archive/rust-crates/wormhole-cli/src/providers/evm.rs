//! EVM wallet provider backed by a secp256k1 private key.

use k256::ecdsa::SigningKey;
use sha3::{Digest, Keccak256};

use super::WalletProvider;

/// EVM wallet loaded from a secp256k1 private key.
pub struct EvmWallet {
    key: SigningKey,
    address: String,
}

impl EvmWallet {
    /// Load an `EvmWallet` from a hex-encoded 32-byte private key.
    ///
    /// The `0x` prefix is accepted but not required.
    ///
    /// # Errors
    ///
    /// Returns an error if the hex is invalid or the key is out of range.
    pub fn from_hex(hex_key: &str) -> anyhow::Result<Self> {
        let stripped = hex_key.strip_prefix("0x").unwrap_or(hex_key);
        let bytes =
            hex::decode(stripped).map_err(|e| anyhow::anyhow!("invalid private key hex: {e}"))?;
        let key = SigningKey::from_slice(&bytes)
            .map_err(|e| anyhow::anyhow!("invalid secp256k1 key: {e}"))?;
        let address = derive_address(&key);
        Ok(Self { key, address })
    }
}

impl WalletProvider for EvmWallet {
    fn address(&self) -> &str {
        &self.address
    }

    fn sign_tx(&self, tx: &[u8]) -> anyhow::Result<Vec<u8>> {
        let digest: [u8; 32] = Keccak256::digest(tx).into();
        let (sig, recid) = self
            .key
            .sign_prehash_recoverable(&digest)
            .map_err(|e| anyhow::anyhow!("signing failed: {e}"))?;
        let mut out = sig.to_bytes().to_vec();
        out.push(recid.to_byte());
        Ok(out)
    }
}

/// Derive the Ethereum address from a signing key.
///
/// Computes keccak256 of the uncompressed public key bytes (sans the 0x04 prefix)
/// and takes the last 20 bytes as the address.
fn derive_address(key: &SigningKey) -> String {
    let point = key.verifying_key().to_encoded_point(false);
    let pubkey = &point.as_bytes()[1..]; // strip 0x04 prefix → 64 bytes
    let hash = Keccak256::digest(pubkey);
    format!("0x{}", hex::encode(&hash[12..]))
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// secp256k1 private key scalar = 1 → well-known Ethereum address.
    const KEY_1: &str = "0000000000000000000000000000000000000000000000000000000000000001";
    const ADDR_1: &str = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";

    #[test]
    fn derives_correct_address_from_known_key() {
        let wallet = EvmWallet::from_hex(KEY_1).unwrap();
        assert_eq!(wallet.address(), ADDR_1);
    }

    #[test]
    fn rejects_invalid_hex() {
        let result = EvmWallet::from_hex("not-hex");
        assert!(result.is_err());
    }
}
