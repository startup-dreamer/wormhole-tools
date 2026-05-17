//! Wormhole VAA (Verified Action Approval) parser.
//!
//! Parses hex- or base64-encoded VAAs into a structured [`VaaData`] type.
//! The binary format is documented in the Wormhole spec:
//! <https://docs.wormhole.com/wormhole/explore-wormhole/vaa>

use base64::engine::general_purpose::{STANDARD, URL_SAFE};
use base64::Engine as _;
use serde::Serialize;
use sha3::Digest as _;

use crate::WormholeError;

// ── public types ──────────────────────────────────────────────────────────────

/// One guardian signature within the VAA envelope.
#[derive(Debug, Serialize)]
pub struct Signature {
    /// Zero-based guardian set index for this signature.
    pub guardian_index: u8,
    /// 65-byte ECDSA signature encoded as 130 lower-hex chars (no `0x` prefix).
    pub signature: String,
}

/// Decoded Wormhole VAA.
#[derive(Debug, Serialize)]
pub struct VaaData {
    pub version: u8,
    pub guardian_set_index: u32,
    pub signatures: Vec<Signature>,
    /// Unix timestamp of the observation (seconds).
    pub timestamp: u32,
    pub nonce: u32,
    pub emitter_chain: u16,
    /// 32-byte emitter address as `"0x"` + 64 lower-hex chars.
    pub emitter_address: String,
    pub sequence: u64,
    pub consistency_level: u8,
    /// Raw payload as `"0x"` + lower-hex string.
    pub payload: String,
    /// Double-keccak256 of the VAA body bytes, as `"0x"` + 64 lower-hex chars.
    pub digest: String,
}

// ── public API ────────────────────────────────────────────────────────────────

/// Parse a hex- or base64-encoded VAA string into [`VaaData`].
///
/// Accepts:
/// - `0x`-prefixed hex
/// - bare hex
/// - standard base64
/// - URL-safe base64
///
/// # Errors
///
/// Returns [`WormholeError::InvalidEncoding`] when the input cannot be decoded,
/// [`WormholeError::UnsupportedVersion`] for version ≠ 1, and
/// [`WormholeError::BufferTooShort`] / [`WormholeError::Overread`] when the
/// buffer is malformed.
pub fn parse(input: &str) -> Result<VaaData, WormholeError> {
    let bytes = decode_input(input)?;
    parse_bytes(&bytes)
}

// ── private helpers ───────────────────────────────────────────────────────────

/// Decode a hex- or base64-encoded VAA string into raw bytes.
///
/// Accepts `0x`-prefixed hex, bare hex, standard base64, and URL-safe base64.
///
/// # Errors
///
/// Returns [`WormholeError::InvalidEncoding`] if the input cannot be decoded.
pub fn decode_vaa_bytes(input: &str) -> Result<Vec<u8>, WormholeError> {
    decode_input(input)
}

/// Decode a hex or base64 string to raw bytes.
fn decode_input(input: &str) -> Result<Vec<u8>, WormholeError> {
    let s = input.trim();

    // hex (with or without 0x prefix)
    let hex_candidate = s.strip_prefix("0x").unwrap_or(s);
    if hex_candidate.chars().all(|c| c.is_ascii_hexdigit()) && !hex_candidate.is_empty() {
        return hex::decode(hex_candidate)
            .map_err(|e| WormholeError::InvalidEncoding(e.to_string()));
    }

    // standard base64
    if let Ok(bytes) = STANDARD.decode(s) {
        return Ok(bytes);
    }

    // URL-safe base64
    URL_SAFE
        .decode(s)
        .map_err(|e| WormholeError::InvalidEncoding(e.to_string()))
}

/// Minimal cursor for reading big-endian fields from a byte slice.
struct Cursor<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Cursor<'a> {
    fn new(buf: &'a [u8]) -> Self {
        Self { buf, pos: 0 }
    }

    fn remaining(&self) -> usize {
        self.buf.len().saturating_sub(self.pos)
    }

    fn read_bytes(&mut self, n: usize) -> Result<&'a [u8], WormholeError> {
        if self.remaining() < n {
            return Err(WormholeError::Overread {
                offset: self.pos,
                needed: n,
                remaining: self.remaining(),
            });
        }
        let slice = &self.buf[self.pos..self.pos + n];
        self.pos += n;
        Ok(slice)
    }

    fn read_u8(&mut self) -> Result<u8, WormholeError> {
        Ok(self.read_bytes(1)?[0])
    }

    fn read_u16_be(&mut self) -> Result<u16, WormholeError> {
        let b = self.read_bytes(2)?;
        Ok(u16::from_be_bytes([b[0], b[1]]))
    }

    fn read_u32_be(&mut self) -> Result<u32, WormholeError> {
        let b = self.read_bytes(4)?;
        Ok(u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn read_u64_be(&mut self) -> Result<u64, WormholeError> {
        let b = self.read_bytes(8)?;
        Ok(u64::from_be_bytes([
            b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
        ]))
    }
}

/// Parse raw VAA bytes into [`VaaData`].
fn parse_bytes(buf: &[u8]) -> Result<VaaData, WormholeError> {
    let mut c = Cursor::new(buf);

    // ── envelope ─────────────────────────────────────────────────────────────
    let version = c.read_u8()?;
    if version != 1 {
        return Err(WormholeError::UnsupportedVersion(version));
    }
    let guardian_set_index = c.read_u32_be()?;
    let sig_count = c.read_u8()? as usize;

    let mut signatures = Vec::with_capacity(sig_count);
    for _ in 0..sig_count {
        let guardian_index = c.read_u8()?;
        let sig_bytes = c.read_bytes(65)?;
        signatures.push(Signature {
            guardian_index,
            signature: hex::encode(sig_bytes),
        });
    }

    // body_start is the current cursor position — digest is over buf[body_start..]
    let body_start = c.pos;

    // ── body ─────────────────────────────────────────────────────────────────
    let timestamp = c.read_u32_be()?;
    let nonce = c.read_u32_be()?;
    let emitter_chain = c.read_u16_be()?;
    let emitter_addr_bytes = c.read_bytes(32)?;
    let sequence = c.read_u64_be()?;
    let consistency_level = c.read_u8()?;
    let payload_bytes = c.read_bytes(c.remaining())?;

    // ── digest (double-keccak256 of body) ────────────────────────────────────
    let body = &buf[body_start..];
    let inner = sha3::Keccak256::digest(body);
    let outer = sha3::Keccak256::digest(inner.as_slice());

    Ok(VaaData {
        version,
        guardian_set_index,
        signatures,
        timestamp,
        nonce,
        emitter_chain,
        emitter_address: format!("0x{}", hex::encode(emitter_addr_bytes)),
        sequence,
        consistency_level,
        payload: format!("0x{}", hex::encode(payload_bytes)),
        digest: format!("0x{}", hex::encode(outer.as_slice())),
    })
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // Minimal valid VAA: version=1, guardian_set_index=0, 0 signatures,
    // timestamp=0, nonce=0, emitter_chain=1, emitter_address=0x00..00,
    // sequence=0, consistency_level=1, payload=0xDEAD
    fn minimal_vaa_bytes() -> Vec<u8> {
        let mut v = vec![
            1u8, // version
            0, 0, 0, 0, // guardian_set_index
            0, // sig_count
            // body
            0, 0, 0, 0, // timestamp
            0, 0, 0, 0, // nonce
            0, 1, // emitter_chain
        ];
        v.extend_from_slice(&[0u8; 32]); // emitter_address
        v.extend_from_slice(&[0, 0, 0, 0, 0, 0, 0, 0]); // sequence
        v.push(1); // consistency_level
        v.extend_from_slice(&[0xDE, 0xAD]); // payload
        v
    }

    #[test]
    fn parse_hex_roundtrip() {
        let bytes = minimal_vaa_bytes();
        let hex = hex::encode(&bytes);
        let vaa = parse(&hex).expect("parse failed");
        assert_eq!(vaa.version, 1);
        assert_eq!(vaa.emitter_chain, 1);
        assert_eq!(vaa.payload, "0xdead");
        assert!(vaa.digest.starts_with("0x"));
        assert_eq!(vaa.digest.len(), 66); // "0x" + 64 hex chars
    }

    #[test]
    fn parse_hex_with_0x_prefix() {
        let bytes = minimal_vaa_bytes();
        let hex = format!("0x{}", hex::encode(&bytes));
        let vaa = parse(&hex).expect("parse with 0x prefix failed");
        assert_eq!(vaa.version, 1);
    }

    #[test]
    fn parse_base64_standard() {
        let bytes = minimal_vaa_bytes();
        let b64 = STANDARD.encode(&bytes);
        let vaa = parse(&b64).expect("base64 parse failed");
        assert_eq!(vaa.version, 1);
        assert_eq!(vaa.consistency_level, 1);
    }

    #[test]
    fn parse_base64_url_safe() {
        let bytes = minimal_vaa_bytes();
        let b64 = URL_SAFE.encode(&bytes);
        let vaa = parse(&b64).expect("url-safe base64 parse failed");
        assert_eq!(vaa.version, 1);
    }

    #[test]
    fn unsupported_version_returns_error() {
        let mut bytes = minimal_vaa_bytes();
        bytes[0] = 2; // version 2
        let hex = hex::encode(&bytes);
        match parse(&hex) {
            Err(WormholeError::UnsupportedVersion(2)) => {}
            other => panic!("expected UnsupportedVersion(2), got {other:?}"),
        }
    }

    #[test]
    fn truncated_buffer_returns_error() {
        let hex = hex::encode([1u8, 0, 0]); // too short — no guardian_set_index
        assert!(parse(&hex).is_err());
    }

    #[test]
    fn invalid_encoding_returns_error() {
        assert!(parse("not_hex_or_base64!!").is_err());
    }

    #[test]
    fn emitter_address_has_0x_prefix_and_64_chars() {
        let bytes = minimal_vaa_bytes();
        let vaa = parse(&hex::encode(&bytes)).unwrap();
        assert!(vaa.emitter_address.starts_with("0x"));
        assert_eq!(vaa.emitter_address.len(), 66);
    }

    #[test]
    fn digest_is_deterministic() {
        let bytes = minimal_vaa_bytes();
        let hex = hex::encode(&bytes);
        let a = parse(&hex).unwrap().digest;
        let b = parse(&hex).unwrap().digest;
        assert_eq!(a, b);
    }
}
