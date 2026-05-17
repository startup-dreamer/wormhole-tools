//! Parse Hardhat and Foundry artifact JSON to extract raw bytecode.
//!
//! Supports two artifact layouts:
//! - **Hardhat**: `{ "bytecode": "0x..." }`
//! - **Foundry**: `{ "bytecode": { "object": "0x..." } }`
//!
//! Also accepts a plain hex string (with or without `0x` prefix) for use with
//! `--bytecode` flags that bypass the artifact entirely.

use crate::WormholeError;

/// Parse a Hardhat or Foundry artifact JSON string and return the raw bytecode bytes.
///
/// # Errors
///
/// Returns [`WormholeError::InvalidEncoding`] if the JSON is malformed, the
/// `bytecode` field is missing, or the hex value is invalid.
pub fn parse_artifact_json(json: &str) -> Result<Vec<u8>, WormholeError> {
    let v: serde_json::Value =
        serde_json::from_str(json).map_err(|e| WormholeError::InvalidEncoding(e.to_string()))?;

    let hex_str = if let Some(s) = v["bytecode"].as_str() {
        // Hardhat format: "bytecode": "0x..."
        s.to_owned()
    } else if let Some(s) = v["bytecode"]["object"].as_str() {
        // Foundry format: "bytecode": { "object": "0x..." }
        s.to_owned()
    } else {
        return Err(WormholeError::InvalidEncoding(
            "missing 'bytecode' or 'bytecode.object' field in artifact".into(),
        ));
    };

    parse_bytecode_hex(&hex_str)
}

/// Decode a hex-encoded bytecode string (with or without `0x` prefix).
///
/// # Errors
///
/// Returns [`WormholeError::InvalidEncoding`] if the string is empty or contains
/// invalid hex characters.
pub fn parse_bytecode_hex(hex: &str) -> Result<Vec<u8>, WormholeError> {
    let s = hex.strip_prefix("0x").unwrap_or(hex);
    if s.is_empty() {
        return Err(WormholeError::InvalidEncoding("bytecode is empty".into()));
    }
    hex::decode(s).map_err(|e| WormholeError::InvalidEncoding(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_hardhat_artifact() {
        let json = r#"{"bytecode": "0xdeadbeef", "abi": []}"#;
        let bytes = parse_artifact_json(json).unwrap();
        assert_eq!(bytes, vec![0xde, 0xad, 0xbe, 0xef]);
    }

    #[test]
    fn parse_foundry_artifact() {
        let json = r#"{"bytecode": {"object": "0xcafe1234"}, "abi": []}"#;
        let bytes = parse_artifact_json(json).unwrap();
        assert_eq!(bytes, vec![0xca, 0xfe, 0x12, 0x34]);
    }

    #[test]
    fn parse_raw_bytecode_hex() {
        let bytes = parse_bytecode_hex("0xaabbcc").unwrap();
        assert_eq!(bytes, vec![0xaa, 0xbb, 0xcc]);
    }

    #[test]
    fn rejects_empty_bytecode() {
        assert!(parse_bytecode_hex("0x").is_err());
        assert!(parse_bytecode_hex("").is_err());
    }

    #[test]
    fn rejects_artifact_without_bytecode_field() {
        let json = r#"{"abi": []}"#;
        assert!(parse_artifact_json(json).is_err());
    }
}
