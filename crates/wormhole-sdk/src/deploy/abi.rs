//! ABI encoding for WormDeployer contract calls.
//!
//! Each `encode_*` function returns the full calldata (4-byte selector + ABI-encoded args)
//! ready to pass to `send_signed`.

use alloy_core::sol;
use alloy_core::sol_types::SolCall;

sol! {
    interface WormDeployer {
        function deployAcrossChains(
            uint16[] calldata targetChains,
            bytes calldata bytecode,
            bytes32 salt,
            bytes calldata initCalldata,
            bool deployOnCurrentChain
        ) external payable;

        function callAcrossChains(
            uint16[] calldata targetChains,
            address target,
            bytes calldata callData,
            uint256 gasLimit
        ) external payable;

        function upgradeAcrossChains(
            uint16[] calldata targetChains,
            address proxy,
            address newImpl,
            bool upgradeOnCurrentChain
        ) external payable;

        function getDeployCost(uint16[] calldata chains) external view returns (uint256);
        function getCallCost(uint16[] calldata chains, uint256 gasLimit) external view returns (uint256);
        function getUpgradeCost(uint16[] calldata chains) external view returns (uint256);
        function computeAddress(bytes32 salt, bytes calldata bytecode) external view returns (address);
    }
}

/// Encode a `deployAcrossChains` call.
///
/// Returns the full calldata (4-byte selector + ABI-encoded arguments).
pub fn encode_deploy_across_chains(
    chain_ids: &[u16],
    bytecode: &[u8],
    salt: &[u8; 32],
    init_calldata: &[u8],
    deploy_on_source: bool,
) -> Vec<u8> {
    use alloy_core::primitives::{Bytes, FixedBytes};
    WormDeployer::deployAcrossChainsCall {
        targetChains: chain_ids.to_vec(),
        bytecode: Bytes::copy_from_slice(bytecode),
        salt: FixedBytes::from(salt),
        initCalldata: Bytes::copy_from_slice(init_calldata),
        deployOnCurrentChain: deploy_on_source,
    }
    .abi_encode()
}

/// Encode a `callAcrossChains` call.
///
/// Returns the full calldata (4-byte selector + ABI-encoded arguments).
pub fn encode_call_across_chains(
    chain_ids: &[u16],
    target: [u8; 20],
    call_data: &[u8],
    gas_limit: u64,
) -> Vec<u8> {
    use alloy_core::primitives::{Address, Bytes, U256};
    WormDeployer::callAcrossChainsCall {
        targetChains: chain_ids.to_vec(),
        target: Address::from(target),
        callData: Bytes::copy_from_slice(call_data),
        gasLimit: U256::from(gas_limit),
    }
    .abi_encode()
}

/// Encode an `upgradeAcrossChains` call.
///
/// Returns the full calldata (4-byte selector + ABI-encoded arguments).
pub fn encode_upgrade_across_chains(
    chain_ids: &[u16],
    proxy: [u8; 20],
    new_impl: [u8; 20],
    upgrade_on_source: bool,
) -> Vec<u8> {
    use alloy_core::primitives::Address;
    WormDeployer::upgradeAcrossChainsCall {
        targetChains: chain_ids.to_vec(),
        proxy: Address::from(proxy),
        newImpl: Address::from(new_impl),
        upgradeOnCurrentChain: upgrade_on_source,
    }
    .abi_encode()
}

/// Encode a `getDeployCost` view call.
///
/// Returns the full calldata ready for `eth_call`.
pub fn encode_get_deploy_cost(chain_ids: &[u16]) -> Vec<u8> {
    WormDeployer::getDeployCostCall {
        chains: chain_ids.to_vec(),
    }
    .abi_encode()
}

/// Encode a `getCallCost` view call.
///
/// Returns the full calldata ready for `eth_call`.
pub fn encode_get_call_cost(chain_ids: &[u16], gas_limit: u64) -> Vec<u8> {
    use alloy_core::primitives::U256;
    WormDeployer::getCallCostCall {
        chains: chain_ids.to_vec(),
        gasLimit: U256::from(gas_limit),
    }
    .abi_encode()
}

/// Encode a `getUpgradeCost` view call.
///
/// Returns the full calldata ready for `eth_call`.
pub fn encode_get_upgrade_cost(chain_ids: &[u16]) -> Vec<u8> {
    WormDeployer::getUpgradeCostCall {
        chains: chain_ids.to_vec(),
    }
    .abi_encode()
}

/// Decode a `uint256` `eth_call` response (hex-encoded) to `u128`.
///
/// Relayer fees fit comfortably in u128. Returns a [`crate::WormholeError::Network`]
/// if the string is too short or contains non-hex characters.
pub fn decode_u256_result(hex_result: &str) -> Result<u128, crate::WormholeError> {
    let s = hex_result.strip_prefix("0x").unwrap_or(hex_result);
    if s.len() < 32 {
        return Err(crate::WormholeError::Network("result too short".into()));
    }
    u128::from_str_radix(&s[s.len().saturating_sub(32)..], 16)
        .map_err(|e| crate::WormholeError::Network(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha3::Digest;

    fn selector(sig: &[u8]) -> [u8; 4] {
        let hash = sha3::Keccak256::digest(sig);
        [hash[0], hash[1], hash[2], hash[3]]
    }

    #[test]
    fn deploy_across_chains_selector_matches_interface() {
        let encoded =
            encode_deploy_across_chains(&[10004u16], &[0x60u8, 0x80], &[0u8; 32], &[], false);
        let expected = selector(b"deployAcrossChains(uint16[],bytes,bytes32,bytes,bool)");
        assert_eq!(&encoded[..4], &expected);
    }

    #[test]
    fn call_across_chains_selector_correct() {
        let encoded = encode_call_across_chains(&[10004u16], [0u8; 20], &[], 300_000u64);
        let expected = selector(b"callAcrossChains(uint16[],address,bytes,uint256)");
        assert_eq!(&encoded[..4], &expected);
    }

    #[test]
    fn upgrade_across_chains_selector_correct() {
        let encoded = encode_upgrade_across_chains(&[10004u16], [0u8; 20], [0u8; 20], false);
        let expected = selector(b"upgradeAcrossChains(uint16[],address,address,bool)");
        assert_eq!(&encoded[..4], &expected);
    }

    #[test]
    fn get_deploy_cost_selector_correct() {
        let encoded = encode_get_deploy_cost(&[10004u16]);
        let expected = selector(b"getDeployCost(uint16[])");
        assert_eq!(&encoded[..4], &expected);
    }

    #[test]
    fn decode_u256_result_parses_padded_hex() {
        let hex = format!("0x{:0>64}", "0f4240"); // 1_000_000
        assert_eq!(decode_u256_result(&hex).unwrap(), 1_000_000u128);
    }
}
