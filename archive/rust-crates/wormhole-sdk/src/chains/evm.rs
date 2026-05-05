//! EVM chain VAA submission.
//!
//! Submits a parsed VAA to the appropriate Wormhole contract on an EVM chain
//! by detecting the payload module and dispatching to the correct contract
//! function.
//!
//! ## Devnet
//!
//! On devnet (Ganache / Anvil), pass a `from` address that is already unlocked
//! on the node.  The submission uses `eth_sendTransaction`, which does not
//! require a private key.
//!
//! ## Testnet / Mainnet
//!
//! Set `WORMHOLE_EVM_KEY` in the environment (or pass `--evm-key` on the CLI)
//! to sign transactions with `eth_sendRawTransaction`.

use sha3::Digest as _;

use crate::WormholeError;

// ── known devnet contract addresses (Wormhole Tilt / Ganache EVM chain 2) ────
pub const DEVNET_CORE: &str = "0xC89Ce4735882C9F0f0FE26686c53074E09B0D550";
pub const DEVNET_TOKEN_BRIDGE: &str = "0x0290FB167208Af455bB137780163b7B7a9a10C16";
pub const DEVNET_NFT_BRIDGE: &str = "0x26b4afb60d6c903165150c6f0aa14f8016be4aec";
pub const DEVNET_RPC: &str = "http://localhost:8545";
/// Default unlocked devnet account (Ganache account index 0).
pub const DEVNET_FROM: &str = "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1";

// ── public types ──────────────────────────────────────────────────────────────

/// Which Wormhole contract a VAA payload targets on EVM.
#[derive(Debug, PartialEq, Eq)]
pub enum EvmTarget {
    Core,
    TokenBridge,
    NftBridge,
    WormholeRelayer,
    /// Payload type byte (for non-governance VAAs such as token-bridge transfers).
    TokenBridgePayload(u8),
}

/// Parameters for EVM VAA submission.
pub struct SubmitParams<'a> {
    /// Hex-encoded VAA (with or without `0x` prefix).
    pub vaa_hex: &'a str,
    /// HTTP(S) JSON-RPC URL of the EVM node.
    pub rpc_url: &'a str,
    /// Target contract address (`0x`-prefixed hex).
    pub contract_address: &'a str,
    /// `from` address for devnet (unlocked account); required when `evm_key` is absent.
    pub from_address: Option<&'a str>,
    /// Hex-encoded secp256k1 private key for signed submission (testnet / mainnet).
    pub evm_key: Option<&'a str>,
}

// ── public API ────────────────────────────────────────────────────────────────

/// Submit a VAA to an EVM chain.
///
/// Detects the payload module, selects the correct contract function, and
/// submits the transaction.  Returns the transaction hash (`0x`-prefixed).
///
/// # Errors
///
/// Returns [`WormholeError::Unsupported`] for unrecognised payload types and
/// [`WormholeError::Network`] for RPC failures.
pub async fn submit_vaa(params: SubmitParams<'_>) -> Result<String, WormholeError> {
    let vaa_bytes = crate::vaa::decode_vaa_bytes(params.vaa_hex)?;
    let payload_hex = extract_payload_hex(&vaa_bytes)?;
    let target = detect_target(&payload_hex);
    let fn_name = evm_function_name(&target)?;

    let call_data = abi_encode_bytes_call(fn_name, &vaa_bytes);

    if let Some(key) = params.evm_key {
        send_signed(params.rpc_url, params.contract_address, 0, &call_data, key).await
    } else {
        let from = params.from_address.ok_or_else(|| {
            WormholeError::Unsupported(
                "devnet submission requires --from or WORMHOLE_EVM_FROM".to_string(),
            )
        })?;
        send_unlocked(params.rpc_url, params.contract_address, from, &call_data).await
    }
}

/// Detect which Wormhole module a payload targets.
///
/// Governance payloads begin with a 32-byte left-padded module name.
/// Token-bridge transfer/attest payloads begin with a type byte.
pub fn detect_target(payload_hex: &str) -> EvmTarget {
    let s = payload_hex.strip_prefix("0x").unwrap_or(payload_hex);
    let bytes = match hex::decode(s) {
        Ok(b) => b,
        Err(_) => return EvmTarget::TokenBridgePayload(0),
    };

    if bytes.len() < 33 {
        return EvmTarget::TokenBridgePayload(bytes.first().copied().unwrap_or(0));
    }

    // First 32 bytes encode the module name (left-padded with zeros)
    let start = bytes[..32].iter().position(|&b| b != 0).unwrap_or(32);
    let module = std::str::from_utf8(&bytes[start..32]).unwrap_or("");

    match module {
        "Core" => EvmTarget::Core,
        "TokenBridge" => EvmTarget::TokenBridge,
        "NFTBridge" => EvmTarget::NftBridge,
        "WormholeRelayer" => EvmTarget::WormholeRelayer,
        _ => EvmTarget::TokenBridgePayload(bytes[0]),
    }
}

/// Read the current guardian set index from the Wormhole core contract.
///
/// Calls `getCurrentGuardianSetIndex()` via `eth_call` and decodes the
/// returned `uint32`.
///
/// # Errors
///
/// Returns [`WormholeError::Network`] on RPC failure or if the result is
/// malformed.
pub async fn read_guardian_set_index(
    rpc_url: &str,
    core_address: &str,
) -> Result<u32, WormholeError> {
    let data = abi_encode_no_args("getCurrentGuardianSetIndex");
    let result = eth_call(rpc_url, core_address, &data).await?;
    decode_u32_result(&result)
}

/// Read the Wormhole chain ID configured in an on-chain contract.
///
/// Calls `chainId()` via `eth_call` and decodes the returned `uint16`.
///
/// # Errors
///
/// Returns [`WormholeError::Network`] on RPC failure or if the result is
/// malformed.
pub async fn read_chain_id(rpc_url: &str, contract_address: &str) -> Result<u16, WormholeError> {
    let data = abi_encode_no_args("chainId");
    let result = eth_call(rpc_url, contract_address, &data).await?;
    decode_u32_result(&result).map(|v| v as u16)
}

// ── private helpers ───────────────────────────────────────────────────────────

/// Map a payload target to the EVM contract function name.
fn evm_function_name(target: &EvmTarget) -> Result<&'static str, WormholeError> {
    match target {
        EvmTarget::Core => Ok("submitContractUpgrade"), // generic; caller overrides if needed
        EvmTarget::TokenBridge => Ok("registerChain"),
        EvmTarget::NftBridge => Ok("registerChain"),
        EvmTarget::WormholeRelayer => Ok("registerChain"),
        EvmTarget::TokenBridgePayload(2) => Ok("createWrapped"), // AttestMeta
        EvmTarget::TokenBridgePayload(t) => Err(WormholeError::Unsupported(format!(
            "token-bridge payload type {t} not supported for direct EVM submission"
        ))),
    }
}

/// ABI-encode a call to `functionName(bytes)` with `data` as the argument.
///
/// Layout: selector(4) | offset=0x20(32) | length(32) | data(padded to 32)
fn abi_encode_bytes_call(function_name: &str, data: &[u8]) -> Vec<u8> {
    let sig = format!("{function_name}(bytes)");
    let hash = sha3::Keccak256::digest(sig.as_bytes());
    let selector = [hash[0], hash[1], hash[2], hash[3]];

    let len = data.len();
    let padded_len = len.div_ceil(32) * 32;

    let mut out = Vec::with_capacity(4 + 32 + 32 + padded_len);
    out.extend_from_slice(&selector);

    // offset to bytes data (always 32 for a single parameter)
    out.extend_from_slice(&[0u8; 31]);
    out.push(0x20);

    // length
    let mut len_buf = [0u8; 32];
    len_buf[28..].copy_from_slice(&(len as u32).to_be_bytes());
    out.extend_from_slice(&len_buf);

    // data padded to 32-byte boundary
    out.extend_from_slice(data);
    out.extend_from_slice(&vec![0u8; padded_len - len]);

    out
}

/// Submit a transaction using `eth_sendTransaction` (devnet with unlocked account).
async fn send_unlocked(
    rpc_url: &str,
    to: &str,
    from: &str,
    data: &[u8],
) -> Result<String, WormholeError> {
    let data_hex = format!("0x{}", hex::encode(data));
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_sendTransaction",
        "params": [{
            "from": from,
            "to": to,
            "data": data_hex,
            "gas": "0x7A120",  // 500_000 gas limit
        }],
        "id": 1
    });

    let response = json_rpc_call(rpc_url, body).await?;
    extract_result_string(response)
}

/// Submit a signed EIP-155 transaction using `eth_sendRawTransaction`.
///
/// Fetches nonce, gas price, and chain ID from the node, builds a [`LegacyTx`],
/// signs it with `key_hex`, and broadcasts it.  Returns the transaction hash.
///
/// # Errors
///
/// Returns [`WormholeError::Signing`] if the key is invalid, [`WormholeError::Network`]
/// on RPC failure, or [`WormholeError::InvalidEncoding`] if the address is malformed.
pub async fn send_signed(
    rpc_url: &str,
    to: &str,
    value_wei: u128,
    data: &[u8],
    key_hex: &str,
) -> Result<String, WormholeError> {
    let from = evm_address_from_key(key_hex)?;
    let (nonce, gas_price, chain_id) = tokio::try_join!(
        eth_get_transaction_count(rpc_url, &from),
        eth_gas_price(rpc_url),
        eth_chain_id(rpc_url),
    )?;
    let gas_price = gas_price * 12 / 10; // 20% buffer
    let to_bytes = parse_address_bytes(to)?;
    let gas_limit = eth_estimate_gas(rpc_url, &from, to, value_wei, data)
        .await
        .unwrap_or(500_000)
        * 12
        / 10;

    let tx = LegacyTx {
        nonce,
        gas_price,
        gas_limit,
        to: Some(to_bytes),
        value: value_wei,
        data: data.to_vec(),
        chain_id,
    };
    let rlp_bytes = tx.rlp_encode_for_signing();
    let hash: [u8; 32] = sha3::Keccak256::digest(&rlp_bytes).into();
    let (r, sig_s, recid) = ecdsa_sign_hash(&hash, key_hex)?;
    let v = chain_id * 2 + 35 + recid as u64; // EIP-155
    let raw = tx.rlp_encode_signed(v, r, sig_s);

    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_sendRawTransaction",
        "params": [format!("0x{}", hex::encode(&raw))],
        "id": 1
    });
    let response = json_rpc_call(rpc_url, body).await?;
    extract_result_string(response)
}

/// Make a JSON-RPC call and return the parsed response body.
pub(crate) async fn json_rpc_call(
    rpc_url: &str,
    body: serde_json::Value,
) -> Result<serde_json::Value, WormholeError> {
    let client = reqwest::Client::new();
    let resp = client
        .post(rpc_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| WormholeError::Network(e.to_string()))?;

    let text = resp
        .text()
        .await
        .map_err(|e| WormholeError::Network(e.to_string()))?;

    serde_json::from_str::<serde_json::Value>(&text).map_err(|_| {
        let preview = text.chars().take(120).collect::<String>();
        WormholeError::Network(format!(
            "RPC returned non-JSON (HTML error page?): {preview}"
        ))
    })
}

/// Extract the `"result"` string from a JSON-RPC response, or propagate the error.
pub(crate) fn extract_result_string(resp: serde_json::Value) -> Result<String, WormholeError> {
    if let Some(err) = resp.get("error") {
        return Err(WormholeError::Network(err.to_string()));
    }
    resp["result"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| WormholeError::Network("missing result in JSON-RPC response".to_string()))
}

/// ABI-encode a no-argument call (selector only).
fn abi_encode_no_args(function_name: &str) -> Vec<u8> {
    let sig = format!("{function_name}()");
    let hash = sha3::Keccak256::digest(sig.as_bytes());
    vec![hash[0], hash[1], hash[2], hash[3]]
}

/// Execute an `eth_call` and return the raw hex result string.
pub(crate) async fn eth_call(
    rpc_url: &str,
    to: &str,
    data: &[u8],
) -> Result<String, WormholeError> {
    let data_hex = format!("0x{}", hex::encode(data));
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_call",
        "params": [{"to": to, "data": data_hex}, "latest"],
        "id": 1
    });
    let response = json_rpc_call(rpc_url, body).await?;
    extract_result_string(response)
}

/// Decode a `0x`-prefixed 32-byte big-endian hex result as a `u32`.
fn decode_u32_result(hex_result: &str) -> Result<u32, WormholeError> {
    let s = hex_result.strip_prefix("0x").unwrap_or(hex_result);
    if s.len() < 8 {
        return Err(WormholeError::Network(format!(
            "eth_call result too short to decode u32: {hex_result}"
        )));
    }
    // The value is right-aligned in a 32-byte word; take the last 8 hex chars.
    let tail = &s[s.len() - 8..];
    u32::from_str_radix(tail, 16)
        .map_err(|e| WormholeError::Network(format!("failed to decode u32 from {tail}: {e}")))
}

/// Decode a hex or base64 VAA string into raw bytes for ABI encoding.
fn extract_payload_hex(vaa_bytes: &[u8]) -> Result<String, WormholeError> {
    // Parse the body offset to reach the payload field
    // Reuse vaa::parse to get the payload hex
    let hex_input = hex::encode(vaa_bytes);
    let parsed = crate::vaa::parse(&hex_input)?;
    Ok(parsed.payload)
}

// ── EIP-155 signing types and helpers ─────────────────────────────────────────

/// EIP-155 legacy transaction for signing and broadcasting.
pub struct LegacyTx {
    /// Transaction nonce for the sender account.
    pub nonce: u64,
    /// Gas price in wei.
    pub gas_price: u128,
    /// Maximum gas units the transaction may consume.
    pub gas_limit: u64,
    /// Recipient address (20 bytes); `None` for contract creation.
    pub to: Option<[u8; 20]>,
    /// Value in wei to transfer.
    pub value: u128,
    /// ABI-encoded call data.
    pub data: Vec<u8>,
    /// EVM chain ID (used for EIP-155 replay protection).
    pub chain_id: u64,
}

impl LegacyTx {
    /// RLP-encode for signing per EIP-155 (9-item list: nonce, gasPrice, gasLimit,
    /// to, value, data, chainId, 0, 0).
    pub fn rlp_encode_for_signing(&self) -> Vec<u8> {
        let mut s = rlp::RlpStream::new_list(9);
        s.append(&self.nonce);
        s.append(&u128_to_rlp_bytes(self.gas_price).as_slice());
        s.append(&self.gas_limit);
        match &self.to {
            Some(addr) => s.append(&addr.as_slice()),
            None => s.append_empty_data(),
        };
        s.append(&u128_to_rlp_bytes(self.value).as_slice());
        s.append(&self.data.as_slice());
        s.append(&self.chain_id);
        s.append(&0u8);
        s.append(&0u8);
        s.out().to_vec()
    }

    /// RLP-encode the signed transaction (9-item list with v, r, s).
    pub fn rlp_encode_signed(&self, v: u64, r: [u8; 32], sig_s: [u8; 32]) -> Vec<u8> {
        let mut stream = rlp::RlpStream::new_list(9);
        stream.append(&self.nonce);
        stream.append(&u128_to_rlp_bytes(self.gas_price).as_slice());
        stream.append(&self.gas_limit);
        match &self.to {
            Some(addr) => stream.append(&addr.as_slice()),
            None => stream.append_empty_data(),
        };
        stream.append(&u128_to_rlp_bytes(self.value).as_slice());
        stream.append(&self.data.as_slice());
        stream.append(&v);
        stream.append(&strip_leading_zeros(&r).as_slice());
        stream.append(&strip_leading_zeros(&sig_s).as_slice());
        stream.out().to_vec()
    }
}

/// Convert `u128` to minimal big-endian bytes (no leading zeros) for RLP.
fn u128_to_rlp_bytes(v: u128) -> Vec<u8> {
    if v == 0 {
        return vec![];
    }
    let be = v.to_be_bytes();
    let start = be.iter().position(|&b| b != 0).unwrap_or(15);
    be[start..].to_vec()
}

/// Strip leading zeros from a 32-byte array for RLP integer encoding.
fn strip_leading_zeros(bytes: &[u8; 32]) -> Vec<u8> {
    let start = bytes.iter().position(|&b| b != 0).unwrap_or(31);
    bytes[start..].to_vec()
}

/// Sign a 32-byte hash with an EVM private key.
///
/// Returns `(r, s, recovery_id)` where `recovery_id` is `0` or `1`.
///
/// # Errors
///
/// Returns [`WormholeError::Signing`] if the key is not valid hex or is an
/// invalid secp256k1 scalar.
pub fn ecdsa_sign_hash(
    hash: &[u8; 32],
    key_hex: &str,
) -> Result<([u8; 32], [u8; 32], u8), WormholeError> {
    use k256::ecdsa::SigningKey;
    let key_bytes = hex::decode(key_hex.strip_prefix("0x").unwrap_or(key_hex))
        .map_err(|e| WormholeError::Signing(e.to_string()))?;
    let signing_key = SigningKey::from_bytes(key_bytes.as_slice().into())
        .map_err(|e| WormholeError::Signing(e.to_string()))?;
    let (sig, recid): (k256::ecdsa::Signature, k256::ecdsa::RecoveryId) = signing_key
        .sign_prehash_recoverable(hash)
        .map_err(|e| WormholeError::Signing(e.to_string()))?;
    let sig_bytes = sig.to_bytes();
    let r: [u8; 32] = sig_bytes[..32]
        .try_into()
        .map_err(|_| WormholeError::Signing("signature r component wrong length".to_string()))?;
    let s: [u8; 32] = sig_bytes[32..]
        .try_into()
        .map_err(|_| WormholeError::Signing("signature s component wrong length".to_string()))?;
    Ok((r, s, recid.to_byte()))
}

/// Derive the checksumless EVM address (lowercase hex, `0x`-prefixed) from a
/// hex-encoded secp256k1 private key.
///
/// # Errors
///
/// Returns [`WormholeError::Signing`] if the key is not valid hex or is an
/// invalid secp256k1 scalar.
pub fn evm_address_from_key(key_hex: &str) -> Result<String, WormholeError> {
    use k256::ecdsa::SigningKey;
    let key_bytes = hex::decode(key_hex.strip_prefix("0x").unwrap_or(key_hex))
        .map_err(|e| WormholeError::Signing(e.to_string()))?;
    let signing_key = SigningKey::from_bytes(key_bytes.as_slice().into())
        .map_err(|e| WormholeError::Signing(e.to_string()))?;
    let pubkey = signing_key.verifying_key().to_encoded_point(false);
    // Skip the 0x04 prefix byte; hash the remaining 64 uncompressed bytes.
    let hash = sha3::Keccak256::digest(&pubkey.as_bytes()[1..]);
    Ok(format!("0x{}", hex::encode(&hash[12..])))
}

// ── private JSON-RPC helpers ──────────────────────────────────────────────────

/// Query the pending transaction count (nonce) for `address`.
async fn eth_get_transaction_count(rpc_url: &str, address: &str) -> Result<u64, WormholeError> {
    let body = serde_json::json!({
        "jsonrpc": "2.0", "method": "eth_getTransactionCount",
        "params": [address, "pending"], "id": 1
    });
    let resp = json_rpc_call(rpc_url, body).await?;
    let hex_str = extract_result_string(resp)?;
    let s = hex_str.strip_prefix("0x").unwrap_or(&hex_str);
    u64::from_str_radix(s, 16).map_err(|e| WormholeError::Network(e.to_string()))
}

/// Query the current suggested gas price.
async fn eth_gas_price(rpc_url: &str) -> Result<u128, WormholeError> {
    let body = serde_json::json!({
        "jsonrpc": "2.0", "method": "eth_gasPrice", "params": [], "id": 1
    });
    let resp = json_rpc_call(rpc_url, body).await?;
    let hex_str = extract_result_string(resp)?;
    let s = hex_str.strip_prefix("0x").unwrap_or(&hex_str);
    u128::from_str_radix(s, 16).map_err(|e| WormholeError::Network(e.to_string()))
}

/// Query the chain ID of the connected network.
async fn eth_chain_id(rpc_url: &str) -> Result<u64, WormholeError> {
    let body = serde_json::json!({
        "jsonrpc": "2.0", "method": "eth_chainId", "params": [], "id": 1
    });
    let resp = json_rpc_call(rpc_url, body).await?;
    let hex_str = extract_result_string(resp)?;
    let s = hex_str.strip_prefix("0x").unwrap_or(&hex_str);
    u64::from_str_radix(s, 16).map_err(|e| WormholeError::Network(e.to_string()))
}

/// Estimate the gas required for a transaction.
async fn eth_estimate_gas(
    rpc_url: &str,
    from: &str,
    to: &str,
    value: u128,
    data: &[u8],
) -> Result<u64, WormholeError> {
    let body = serde_json::json!({
        "jsonrpc": "2.0", "method": "eth_estimateGas",
        "params": [{
            "from": from,
            "to": to,
            "value": format!("0x{:x}", value),
            "data": format!("0x{}", hex::encode(data))
        }],
        "id": 1
    });
    let resp = json_rpc_call(rpc_url, body).await?;
    let hex_str = extract_result_string(resp)?;
    let s = hex_str.strip_prefix("0x").unwrap_or(&hex_str);
    u64::from_str_radix(s, 16).map_err(|e| WormholeError::Network(e.to_string()))
}

/// Parse a `0x`-prefixed hex Ethereum address into a 20-byte array.
fn parse_address_bytes(addr: &str) -> Result<[u8; 20], WormholeError> {
    let s = addr.strip_prefix("0x").unwrap_or(addr);
    let bytes = hex::decode(s).map_err(|e| WormholeError::InvalidEncoding(e.to_string()))?;
    bytes
        .try_into()
        .map_err(|_| WormholeError::InvalidEncoding(format!("address must be 20 bytes: {addr}")))
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_core_module() {
        // 32-byte left-padded "Core" + action byte (doesn't matter here)
        let mut payload = vec![0u8; 33];
        let core = b"Core";
        payload[28..32].copy_from_slice(core);
        payload[32] = 1;
        let hex = format!("0x{}", hex::encode(&payload));
        assert_eq!(detect_target(&hex), EvmTarget::Core);
    }

    #[test]
    fn detect_token_bridge_module() {
        let mut payload = vec![0u8; 33];
        let tb = b"TokenBridge";
        payload[21..32].copy_from_slice(tb);
        payload[32] = 1;
        let hex = format!("0x{}", hex::encode(&payload));
        assert_eq!(detect_target(&hex), EvmTarget::TokenBridge);
    }

    #[test]
    fn detect_attest_meta_payload() {
        // AttestMeta: first byte = 2, no module prefix
        let mut payload = vec![0u8; 33];
        payload[0] = 2; // type = AttestMeta
        let hex = format!("0x{}", hex::encode(&payload));
        assert_eq!(detect_target(&hex), EvmTarget::TokenBridgePayload(2));
    }

    #[test]
    fn abi_encode_selector_matches_keccak() {
        let encoded = abi_encode_bytes_call("registerChain", &[0xDE, 0xAD]);
        // First 4 bytes = keccak256("registerChain(bytes)")[0..4]
        let expected = {
            let hash = sha3::Keccak256::digest(b"registerChain(bytes)");
            [hash[0], hash[1], hash[2], hash[3]]
        };
        assert_eq!(&encoded[..4], &expected);
    }

    #[test]
    fn abi_encode_offset_is_0x20() {
        let encoded = abi_encode_bytes_call("registerChain", &[0xDE, 0xAD]);
        // Bytes 4..36 = offset = 32 (0x20)
        let mut expected_offset = [0u8; 32];
        expected_offset[31] = 0x20;
        assert_eq!(&encoded[4..36], &expected_offset);
    }

    #[test]
    fn abi_encode_length_field() {
        let data = vec![0xAB; 10];
        let encoded = abi_encode_bytes_call("registerChain", &data);
        // Bytes 36..68 = length = 10
        let mut expected_len = [0u8; 32];
        expected_len[31] = 10;
        assert_eq!(&encoded[36..68], &expected_len);
    }

    #[test]
    fn abi_encode_data_padded_to_32() {
        let data = vec![0xAB; 10];
        let encoded = abi_encode_bytes_call("registerChain", &data);
        // Bytes 68..100: data (10 bytes) + 22 zero bytes padding
        assert_eq!(&encoded[68..78], &[0xABu8; 10]);
        assert_eq!(&encoded[78..100], &[0u8; 22]);
        assert_eq!(encoded.len(), 4 + 32 + 32 + 32); // 100 bytes
    }

    #[test]
    fn unsupported_payload_type_returns_error() {
        let target = EvmTarget::TokenBridgePayload(99);
        assert!(evm_function_name(&target).is_err());
    }

    #[test]
    fn abi_encode_no_args_produces_4_byte_selector() {
        let encoded = abi_encode_no_args("getCurrentGuardianSetIndex");
        assert_eq!(encoded.len(), 4);
        let expected = {
            let hash = sha3::Keccak256::digest(b"getCurrentGuardianSetIndex()");
            [hash[0], hash[1], hash[2], hash[3]]
        };
        assert_eq!(encoded.as_slice(), &expected);
    }

    #[test]
    fn decode_u32_result_parses_padded_hex() {
        // 32-byte result with value 3 right-aligned
        let hex = format!("0x{:0>64}", "00000003");
        assert_eq!(decode_u32_result(&hex).unwrap(), 3u32);
    }

    #[test]
    fn decode_u32_result_too_short_returns_error() {
        assert!(decode_u32_result("0x123").is_err());
    }

    #[test]
    fn legacy_tx_rlp_for_signing_has_nine_items() {
        let tx = LegacyTx {
            nonce: 7,
            gas_price: 2_000_000_000u128,
            gas_limit: 21_000u64,
            to: Some([0xABu8; 20]),
            value: 0u128,
            data: vec![],
            chain_id: 11155111,
        };
        let encoded = tx.rlp_encode_for_signing();
        let rlp = rlp::Rlp::new(&encoded);
        assert!(rlp.is_list());
        assert_eq!(rlp.item_count().unwrap(), 9);
    }

    #[test]
    fn ecdsa_sign_produces_valid_recovery_id() {
        let key = "0x0000000000000000000000000000000000000000000000000000000000000001";
        let hash = [0xabu8; 32];
        let (r, s, recid) = ecdsa_sign_hash(&hash, key).unwrap();
        assert_eq!(r.len(), 32);
        assert_eq!(s.len(), 32);
        assert!(recid <= 1);
    }

    #[test]
    fn evm_address_from_key_known_value() {
        let key = "0x0000000000000000000000000000000000000000000000000000000000000001";
        let addr = evm_address_from_key(key).unwrap();
        assert_eq!(
            addr.to_lowercase(),
            "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf"
        );
    }
}
