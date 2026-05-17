//! CREATE2 address computation and salt normalization.
//!
//! Mirrors Solidity's `Create2.computeAddress(salt, keccak256(bytecode), deployer)`
//! so the CLI can predict contract addresses offline before submitting any transaction.

use sha3::Digest as _;

/// Compute the CREATE2 contract address.
///
/// `deployer` is the WormDeployer proxy address (the contract that calls `Create2.deploy`
/// on itself). `salt` is the 32-byte deployment salt. `bytecode` is the full creation
/// bytecode including any constructor arguments.
///
/// Implements EIP-1014: `keccak256(0xff ++ deployer ++ salt ++ keccak256(bytecode))[12..]`
pub fn compute_create2_address(deployer: [u8; 20], salt: [u8; 32], bytecode: &[u8]) -> [u8; 20] {
    let bytecode_hash: [u8; 32] = sha3::Keccak256::digest(bytecode).into();
    let mut preimage = Vec::with_capacity(85);
    preimage.push(0xff);
    preimage.extend_from_slice(&deployer);
    preimage.extend_from_slice(&salt);
    preimage.extend_from_slice(&bytecode_hash);
    sha3::Keccak256::digest(&preimage)[12..]
        .try_into()
        .expect("slice is exactly 20 bytes")
}

/// Normalise a user-supplied salt string to a `[u8; 32]`.
///
/// - If `s` starts with `0x` and is exactly 66 characters (2 + 64 hex digits),
///   it is decoded verbatim as a raw 32-byte value.
/// - Otherwise the UTF-8 bytes of `s` are keccak256-hashed, matching the
///   Solidity pattern `keccak256(bytes(s))`.
pub fn salt_from_str(s: &str) -> [u8; 32] {
    if s.starts_with("0x") && s.len() == 66 {
        if let Ok(b) = hex::decode(&s[2..]) {
            if let Ok(arr) = b.try_into() {
                return arr;
            }
        }
    }
    sha3::Keccak256::digest(s.as_bytes()).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    const DEPLOYER: [u8; 20] = [0x11u8; 20];
    const BYTECODE: &[u8] = b"some contract bytecode";

    #[test]
    fn same_inputs_same_output() {
        let salt = salt_from_str("v1.0.0");
        let a1 = compute_create2_address(DEPLOYER, salt, BYTECODE);
        let a2 = compute_create2_address(DEPLOYER, salt, BYTECODE);
        assert_eq!(a1, a2);
    }

    #[test]
    fn different_salt_different_address() {
        let s1 = salt_from_str("v1.0.0");
        let s2 = salt_from_str("v2.0.0");
        let a1 = compute_create2_address(DEPLOYER, s1, BYTECODE);
        let a2 = compute_create2_address(DEPLOYER, s2, BYTECODE);
        assert_ne!(a1, a2);
    }

    #[test]
    fn salt_from_str_keccak_of_utf8() {
        use sha3::Digest as _;
        let label = "my-contract";
        let salt = salt_from_str(label);
        let expected: [u8; 32] = sha3::Keccak256::digest(label.as_bytes()).into();
        assert_eq!(salt, expected);
    }

    #[test]
    fn salt_from_hex_passthrough_for_0x_prefix_64_chars() {
        let raw = "0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
        let salt = salt_from_str(raw);
        let mut expected = [0u8; 32];
        for (i, b) in expected.iter_mut().enumerate() {
            *b = i as u8;
        }
        assert_eq!(salt, expected);
    }
}
