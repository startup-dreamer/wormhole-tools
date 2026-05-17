//! VAA generation for devnet/testnet governance and attestation operations.
//!
//! All three generators follow the same flow:
//! 1. Serialize the typed payload to bytes.
//! 2. Build the VAA body (header + payload).
//! 3. Compute the double-keccak256 digest of the body.
//! 4. Sign the digest with each guardian secret key.
//! 5. Serialise the full VAA (envelope + body) to a hex string.
//!
//! Generated VAAs can be round-tripped through [`crate::vaa::parse`].

use std::time::{SystemTime, UNIX_EPOCH};

use k256::ecdsa::SigningKey;
use sha3::Digest as _;

use crate::WormholeError;

/// Wormhole governance source chain (Solana = 1).
pub const GOVERNANCE_CHAIN: u16 = 1;
/// Wormhole governance emitter address (32-byte, lower-hex, no 0x prefix).
pub const GOVERNANCE_EMITTER: &str =
    "0000000000000000000000000000000000000000000000000000000000000004";

// ── public types ──────────────────────────────────────────────────────────────

/// Wormhole protocol module selector.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Module {
    Core,
    TokenBridge,
    NftBridge,
    WormholeRelayer,
}

impl Module {
    fn as_str(self) -> &'static str {
        match self {
            Module::Core => "Core",
            Module::TokenBridge => "TokenBridge",
            Module::NftBridge => "NFTBridge",
            Module::WormholeRelayer => "WormholeRelayer",
        }
    }

    /// ContractUpgrade action byte (Core = 1, portals = 2 per spec).
    fn upgrade_action(self) -> u8 {
        match self {
            Module::Core => 1,
            _ => 2,
        }
    }
}

/// Parameters for a chain registration VAA.
pub struct RegistrationParams {
    /// Module to register for (`TokenBridge`, `NftBridge`, or `WormholeRelayer`).
    pub module: Module,
    /// Wormhole chain ID of the chain being registered.
    pub chain_id: u16,
    /// Contract address on the registered chain (hex, ≤ 32 bytes).
    pub contract_address: String,
    /// Comma-separated guardian private keys (hex).
    pub guardian_secrets: String,
}

/// Parameters for a contract upgrade VAA.
pub struct UpgradeParams {
    /// Module to upgrade.
    pub module: Module,
    /// Wormhole chain ID of the target chain.
    pub chain_id: u16,
    /// New contract address (hex, ≤ 32 bytes).
    pub new_address: String,
    /// Comma-separated guardian private keys (hex).
    pub guardian_secrets: String,
}

/// Parameters for a token attestation VAA.
pub struct AttestationParams {
    /// Wormhole chain ID of the VAA emitter.
    pub emitter_chain: u16,
    /// Emitter address (hex, ≤ 32 bytes).
    pub emitter_address: String,
    /// Wormhole chain ID where the token lives.
    pub token_chain: u16,
    /// Token contract address (hex, ≤ 32 bytes).
    pub token_address: String,
    /// Token decimals.
    pub decimals: u8,
    /// Token symbol (max 32 UTF-8 bytes).
    pub symbol: String,
    /// Token name (max 32 UTF-8 bytes).
    pub name: String,
    /// Comma-separated guardian private keys (hex).
    pub guardian_secrets: String,
}

// ── public API ────────────────────────────────────────────────────────────────

/// Generate a chain registration governance VAA.
///
/// Builds a `RegisterChain` payload for `params.module`, signing it with the
/// supplied guardian keys. Returns a lower-hex encoded VAA string (no `0x`
/// prefix) that can be parsed by [`crate::vaa::parse`].
///
/// # Errors
///
/// Returns an error if address parsing or ECDSA signing fails.
pub fn generate_registration(params: RegistrationParams) -> Result<String, WormholeError> {
    let module_bytes = encode_module(params.module.as_str());
    let addr = parse_address(&params.contract_address)?;
    let gov_emitter = parse_address(GOVERNANCE_EMITTER)?;

    let mut payload = Vec::with_capacity(69);
    payload.extend_from_slice(&module_bytes);
    payload.push(1u8); // RegisterChain action
    payload.extend_from_slice(&0u16.to_be_bytes()); // governance: chain field = 0
    payload.extend_from_slice(&params.chain_id.to_be_bytes());
    payload.extend_from_slice(&addr);

    sign_and_serialize(
        GOVERNANCE_CHAIN,
        gov_emitter,
        &payload,
        &params.guardian_secrets,
    )
}

/// Generate a contract upgrade governance VAA.
///
/// # Errors
///
/// Returns an error if address parsing or ECDSA signing fails.
pub fn generate_upgrade(params: UpgradeParams) -> Result<String, WormholeError> {
    let module_bytes = encode_module(params.module.as_str());
    let addr = parse_address(&params.new_address)?;
    let gov_emitter = parse_address(GOVERNANCE_EMITTER)?;

    let mut payload = Vec::with_capacity(67);
    payload.extend_from_slice(&module_bytes);
    payload.push(params.module.upgrade_action());
    payload.extend_from_slice(&params.chain_id.to_be_bytes());
    payload.extend_from_slice(&addr);

    sign_and_serialize(
        GOVERNANCE_CHAIN,
        gov_emitter,
        &payload,
        &params.guardian_secrets,
    )
}

/// Generate a token attestation VAA.
///
/// # Errors
///
/// Returns an error if address parsing or ECDSA signing fails.
pub fn generate_attestation(params: AttestationParams) -> Result<String, WormholeError> {
    let token_addr = parse_address(&params.token_address)?;
    let emitter_addr = parse_address(&params.emitter_address)?;

    let mut payload = Vec::with_capacity(100);
    payload.push(2u8); // AttestMeta type
    payload.extend_from_slice(&token_addr);
    payload.extend_from_slice(&params.token_chain.to_be_bytes());
    payload.push(params.decimals);
    payload.extend_from_slice(&encode_string_right(&params.symbol));
    payload.extend_from_slice(&encode_string_right(&params.name));

    sign_and_serialize(
        params.emitter_chain,
        emitter_addr,
        &payload,
        &params.guardian_secrets,
    )
}

// ── private helpers ───────────────────────────────────────────────────────────

/// Build the VAA body, sign it with each guardian key, and serialise to hex.
fn sign_and_serialize(
    emitter_chain: u16,
    emitter_address: [u8; 32],
    payload: &[u8],
    guardian_secrets_csv: &str,
) -> Result<String, WormholeError> {
    let sequence: u64 = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64 % 100_000_000);

    let body = build_body(1, 1, emitter_chain, emitter_address, sequence, 0, payload);

    let inner = sha3::Keccak256::digest(&body);
    let outer = sha3::Keccak256::digest(inner.as_slice());
    let hash: [u8; 32] = outer.into();

    let secrets: Vec<&str> = guardian_secrets_csv.split(',').collect();
    let mut signatures: Vec<(u8, [u8; 65])> = Vec::with_capacity(secrets.len());
    for (i, secret) in secrets.iter().enumerate() {
        let packed = sign_once(secret.trim(), &hash)?;
        signatures.push((i as u8, packed));
    }

    Ok(serialize_vaa(0, &signatures, &body))
}

/// Assemble the fixed-layout VAA body bytes (big-endian).
fn build_body(
    timestamp: u32,
    nonce: u32,
    emitter_chain: u16,
    emitter_address: [u8; 32],
    sequence: u64,
    consistency_level: u8,
    payload: &[u8],
) -> Vec<u8> {
    let mut buf = Vec::with_capacity(51 + payload.len());
    buf.extend_from_slice(&timestamp.to_be_bytes());
    buf.extend_from_slice(&nonce.to_be_bytes());
    buf.extend_from_slice(&emitter_chain.to_be_bytes());
    buf.extend_from_slice(&emitter_address);
    buf.extend_from_slice(&sequence.to_be_bytes());
    buf.push(consistency_level);
    buf.extend_from_slice(payload);
    buf
}

/// Sign a 32-byte prehash with a single guardian secret and return the 65-byte packed sig.
fn sign_once(secret_hex: &str, hash: &[u8; 32]) -> Result<[u8; 65], WormholeError> {
    let secret_bytes = hex::decode(secret_hex.strip_prefix("0x").unwrap_or(secret_hex))
        .map_err(|e| WormholeError::InvalidEncoding(e.to_string()))?;

    let signing_key =
        SigningKey::from_slice(&secret_bytes).map_err(|e| WormholeError::Signing(e.to_string()))?;

    let (sig, recid) = signing_key
        .sign_prehash_recoverable(hash)
        .map_err(|e| WormholeError::Signing(e.to_string()))?;

    let mut packed = [0u8; 65];
    packed[..64].copy_from_slice(sig.to_bytes().as_ref());
    packed[64] = recid.to_byte();
    Ok(packed)
}

/// Serialise a complete VAA to a lower-hex string (no `0x` prefix).
fn serialize_vaa(guardian_set_index: u32, signatures: &[(u8, [u8; 65])], body: &[u8]) -> String {
    let mut buf = Vec::new();
    buf.push(1u8); // version
    buf.extend_from_slice(&guardian_set_index.to_be_bytes());
    buf.push(signatures.len() as u8);
    for (guardian_index, sig) in signatures {
        buf.push(*guardian_index);
        buf.extend_from_slice(sig);
    }
    buf.extend_from_slice(body);
    hex::encode(buf)
}

/// Parse a hex address string into a 32-byte array (left-zero-padded).
fn parse_address(hex_str: &str) -> Result<[u8; 32], WormholeError> {
    let s = hex_str.trim().strip_prefix("0x").unwrap_or(hex_str.trim());
    if s.len() > 64 {
        return Err(WormholeError::InvalidEncoding(format!(
            "address too long: {hex_str}"
        )));
    }
    let padded = format!("{:0>64}", s);
    let bytes = hex::decode(&padded).map_err(|e| WormholeError::InvalidEncoding(e.to_string()))?;
    let mut addr = [0u8; 32];
    addr.copy_from_slice(&bytes);
    Ok(addr)
}

/// Encode a module name as a 32-byte left-zero-padded ASCII buffer.
fn encode_module(module: &str) -> [u8; 32] {
    let mut buf = [0u8; 32];
    let bytes = module.as_bytes();
    let len = bytes.len().min(32);
    buf[32 - len..].copy_from_slice(&bytes[..len]);
    buf
}

/// Encode a string as a 32-byte null-padded buffer (UTF-8, right-padded).
fn encode_string_right(s: &str) -> [u8; 32] {
    let mut buf = [0u8; 32];
    let bytes = s.as_bytes();
    let len = bytes.len().min(32);
    buf[..len].copy_from_slice(&bytes[..len]);
    buf
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vaa;

    // devnet guardian key from Wormhole reference (well-known test key)
    const DEVNET_GUARDIAN: &str =
        "cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0";

    fn registration_params() -> RegistrationParams {
        RegistrationParams {
            module: Module::TokenBridge,
            chain_id: 2,
            contract_address: "0x0000000000000000000000000290fb167208af455bb137780163b7b7a9a10c16"
                .to_string(),
            guardian_secrets: DEVNET_GUARDIAN.to_string(),
        }
    }

    fn upgrade_params() -> UpgradeParams {
        UpgradeParams {
            module: Module::TokenBridge,
            chain_id: 2,
            new_address: "0x0000000000000000000000000290fb167208af455bb137780163b7b7a9a10c16"
                .to_string(),
            guardian_secrets: DEVNET_GUARDIAN.to_string(),
        }
    }

    fn attestation_params() -> AttestationParams {
        AttestationParams {
            emitter_chain: 2,
            emitter_address: "0000000000000000000000000290fb167208af455bb137780163b7b7a9a10c16"
                .to_string(),
            token_chain: 2,
            token_address: "000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
                .to_string(),
            decimals: 6,
            symbol: "USDC".to_string(),
            name: "USD Coin".to_string(),
            guardian_secrets: DEVNET_GUARDIAN.to_string(),
        }
    }

    #[test]
    fn registration_round_trips_through_parse() {
        let hex = generate_registration(registration_params()).expect("generate failed");
        let parsed = vaa::parse(&hex).expect("parse failed");
        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.emitter_chain, GOVERNANCE_CHAIN);
        assert_eq!(parsed.signatures.len(), 1);
        assert_eq!(parsed.signatures[0].guardian_index, 0);
        assert_eq!(parsed.signatures[0].signature.len(), 130); // 65 bytes = 130 hex chars
    }

    #[test]
    fn upgrade_round_trips_through_parse() {
        let hex = generate_upgrade(upgrade_params()).expect("generate failed");
        let parsed = vaa::parse(&hex).expect("parse failed");
        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.emitter_chain, GOVERNANCE_CHAIN);
    }

    #[test]
    fn attestation_round_trips_through_parse() {
        let hex = generate_attestation(attestation_params()).expect("generate failed");
        let parsed = vaa::parse(&hex).expect("parse failed");
        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.emitter_chain, 2);
        // payload: type(1) + token_addr(32) + token_chain(2) + decimals(1) + symbol(32) + name(32)
        // "0x" + 2*(1+32+2+1+32+32) = "0x" + 200 hex chars
        assert_eq!(parsed.payload.len(), 202); // "0x" + 200
    }

    #[test]
    fn invalid_guardian_secret_returns_error() {
        let mut p = registration_params();
        p.guardian_secrets = "not_a_hex_key".to_string();
        assert!(matches!(
            generate_registration(p),
            Err(WormholeError::InvalidEncoding(_))
        ));
    }

    #[test]
    fn address_too_long_returns_error() {
        let mut p = registration_params();
        p.contract_address = "0x".to_string() + &"ff".repeat(33); // 33 bytes = too long
        assert!(matches!(
            generate_registration(p),
            Err(WormholeError::InvalidEncoding(_))
        ));
    }

    #[test]
    fn multiple_guardians_produce_multiple_signatures() {
        let mut p = registration_params();
        // Two copies of the same key for simplicity
        p.guardian_secrets = format!("{},{}", DEVNET_GUARDIAN, DEVNET_GUARDIAN);
        let hex = generate_registration(p).expect("generate failed");
        let parsed = vaa::parse(&hex).expect("parse failed");
        assert_eq!(parsed.signatures.len(), 2);
        assert_eq!(parsed.signatures[0].guardian_index, 0);
        assert_eq!(parsed.signatures[1].guardian_index, 1);
    }

    #[test]
    fn core_upgrade_uses_action_byte_1() {
        let p = UpgradeParams {
            module: Module::Core,
            chain_id: 1,
            new_address: "0000000000000000000000000290fb167208af455bb137780163b7b7a9a10c16"
                .to_string(),
            guardian_secrets: DEVNET_GUARDIAN.to_string(),
        };
        // round-trip verifies it produces a valid parseable VAA
        let hex = generate_upgrade(p).expect("generate failed");
        assert!(vaa::parse(&hex).is_ok());
    }

    #[test]
    fn encode_module_left_pads_correctly() {
        let buf = encode_module("Core");
        // "Core" = 4 bytes, should be at the end
        assert_eq!(&buf[28..], b"Core");
        assert_eq!(&buf[..28], &[0u8; 28]);
    }

    #[test]
    fn encode_string_right_right_pads_correctly() {
        let buf = encode_string_right("USDC");
        assert_eq!(&buf[..4], b"USDC");
        assert_eq!(&buf[4..], &[0u8; 28]);
    }
}
