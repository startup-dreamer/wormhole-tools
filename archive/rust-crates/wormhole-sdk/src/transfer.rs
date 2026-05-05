//! Token bridge transfer initiation on EVM chains.
//!
//! Builds and submits an EVM `transferTokens` call to the Wormhole token
//! bridge contract.  On devnet (Ganache / Anvil), the `from` account is
//! unlocked so no private key is required.

use sha3::Digest as _;

use crate::WormholeError;

/// Parameters for initiating a token bridge transfer.
pub struct TransferParams<'a> {
    /// HTTP(S) JSON-RPC URL of the EVM node.
    pub rpc_url: &'a str,
    /// Token bridge contract address (`0x`-prefixed hex).
    pub token_bridge: &'a str,
    /// ERC-20 token address to transfer (`0x`-prefixed hex).
    pub token_address: &'a str,
    /// Amount in the token's native units (wei for 18-decimal tokens).
    pub amount: u128,
    /// Wormhole chain ID of the destination chain.
    pub recipient_chain: u16,
    /// 32-byte recipient address on the destination chain (hex, no `0x`).
    pub recipient: &'a str,
    /// Relayer fee in the token's native units (0 for no relayer).
    pub arbiter_fee: u128,
    /// Nonce for deduplication (any u32).
    pub nonce: u32,
    /// `from` address for devnet (unlocked account).
    pub from_address: &'a str,
}

/// Initiate a token bridge transfer on an EVM chain.
///
/// Calls `transferTokens(address,uint256,uint16,bytes32,uint256,uint32)` on
/// the token bridge contract via `eth_sendTransaction` (devnet / unlocked
/// account).  Returns the transaction hash.
///
/// # Errors
///
/// Returns [`WormholeError::InvalidEncoding`] if `recipient` or
/// `token_address` cannot be decoded, or [`WormholeError::Network`] on RPC
/// failure.
pub async fn initiate_transfer(params: &TransferParams<'_>) -> Result<String, WormholeError> {
    let calldata = build_transfer_calldata(params)?;
    let data_hex = format!("0x{}", hex::encode(&calldata));

    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_sendTransaction",
        "params": [{
            "from": params.from_address,
            "to": params.token_bridge,
            "data": data_hex,
            "gas": "0x186A0",  // 100_000 gas limit
        }],
        "id": 1
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(params.rpc_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| WormholeError::Network(e.to_string()))?;

    let value: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| WormholeError::Network(format!("failed to parse RPC response: {e}")))?;

    if let Some(err) = value.get("error") {
        return Err(WormholeError::Network(err.to_string()));
    }

    value["result"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| WormholeError::Network("missing result in JSON-RPC response".to_string()))
}

/// Build ABI calldata for `transferTokens(address,uint256,uint16,bytes32,uint256,uint32)`.
///
/// All parameters are fixed-size ABI types, so the encoding is:
/// selector(4) + token(32) + amount(32) + chain(32) + recipient(32) + fee(32) + nonce(32)
pub fn build_transfer_calldata(params: &TransferParams<'_>) -> Result<Vec<u8>, WormholeError> {
    let sig = "transferTokens(address,uint256,uint16,bytes32,uint256,uint32)";
    let hash = sha3::Keccak256::digest(sig.as_bytes());
    let selector = [hash[0], hash[1], hash[2], hash[3]];

    // Decode token address (20 bytes, left-pad to 32)
    let token_hex = params.token_address.trim_start_matches("0x");
    if token_hex.len() != 40 {
        return Err(WormholeError::InvalidEncoding(format!(
            "token address must be 40 hex chars, got {}",
            token_hex.len()
        )));
    }
    let token_bytes = hex::decode(token_hex)
        .map_err(|e| WormholeError::InvalidEncoding(format!("invalid token address: {e}")))?;

    // Decode recipient (32 bytes)
    let recipient_hex = params.recipient.trim_start_matches("0x");
    if recipient_hex.len() != 64 {
        return Err(WormholeError::InvalidEncoding(format!(
            "recipient must be 64 hex chars, got {}",
            recipient_hex.len()
        )));
    }
    let recipient_bytes = hex::decode(recipient_hex)
        .map_err(|e| WormholeError::InvalidEncoding(format!("invalid recipient: {e}")))?;

    let mut out = Vec::with_capacity(4 + 6 * 32);
    out.extend_from_slice(&selector);

    // address: 12 zero bytes + 20-byte address
    out.extend_from_slice(&[0u8; 12]);
    out.extend_from_slice(&token_bytes);

    // uint256 amount: big-endian in 32 bytes
    out.extend_from_slice(&[0u8; 16]);
    out.extend_from_slice(&params.amount.to_be_bytes());

    // uint16 recipientChain: right-aligned in 32 bytes
    out.extend_from_slice(&[0u8; 30]);
    out.extend_from_slice(&params.recipient_chain.to_be_bytes());

    // bytes32 recipient: exactly 32 bytes
    out.extend_from_slice(&recipient_bytes);

    // uint256 arbiterFee
    out.extend_from_slice(&[0u8; 16]);
    out.extend_from_slice(&params.arbiter_fee.to_be_bytes());

    // uint32 nonce: right-aligned in 32 bytes
    out.extend_from_slice(&[0u8; 28]);
    out.extend_from_slice(&params.nonce.to_be_bytes());

    Ok(out)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_params() -> TransferParams<'static> {
        TransferParams {
            rpc_url: "http://localhost:8545",
            token_bridge: "0x0290FB167208Af455bB137780163b7B7a9a10C16",
            token_address: "0xDDb64fE46a91D46ee29420539FC25FD07c5FEa3E",
            amount: 1_000_000,
            recipient_chain: 1, // Solana
            recipient: "0000000000000000000000000000000000000000000000000000000000000001",
            arbiter_fee: 0,
            nonce: 0,
            from_address: "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1",
        }
    }

    #[test]
    fn calldata_has_correct_length() {
        let p = sample_params();
        let data = build_transfer_calldata(&p).unwrap();
        assert_eq!(data.len(), 4 + 6 * 32); // 196 bytes
    }

    #[test]
    fn selector_matches_keccak() {
        let p = sample_params();
        let data = build_transfer_calldata(&p).unwrap();
        let sig = "transferTokens(address,uint256,uint16,bytes32,uint256,uint32)";
        let hash = sha3::Keccak256::digest(sig.as_bytes());
        assert_eq!(&data[..4], &[hash[0], hash[1], hash[2], hash[3]]);
    }

    #[test]
    fn amount_is_encoded_correctly() {
        let p = sample_params();
        let data = build_transfer_calldata(&p).unwrap();
        // Amount (1_000_000 = 0xF4240) is at bytes 36..68
        let expected_amount = 1_000_000u128.to_be_bytes();
        assert_eq!(&data[52..68], &expected_amount); // last 16 bytes of the 32-byte slot
    }

    #[test]
    fn recipient_chain_is_encoded_correctly() {
        let p = sample_params();
        let data = build_transfer_calldata(&p).unwrap();
        // recipientChain (1 = Solana) at bytes 68..100, right-aligned
        assert_eq!(data[98], 0);
        assert_eq!(data[99], 1); // big-endian u16 = 0x0001
    }

    #[test]
    fn invalid_token_address_length_returns_error() {
        let mut p = sample_params();
        p.token_address = "0xdeadbeef"; // too short
        assert!(build_transfer_calldata(&p).is_err());
    }

    #[test]
    fn invalid_recipient_length_returns_error() {
        let mut p = sample_params();
        p.recipient = "0001"; // too short
        assert!(build_transfer_calldata(&p).is_err());
    }
}
