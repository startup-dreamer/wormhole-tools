//! Cross-chain deployment primitives.
//!
//! This module wires together the sub-modules used by `worm deploy` and exposes
//! the three primary async operations: [`deploy_across_chains`],
//! [`call_across_chains`], and [`upgrade_across_chains`].

pub mod abi;
pub mod artifact;
pub mod create2;
pub mod registry;
pub mod status;

use crate::WormholeError;
use crate::chains::evm::{eth_call, send_signed};
use registry::ChainRegistry;

// ── param structs ─────────────────────────────────────────────────────────────

/// Parameters for a multi-chain deployment.
pub struct DeployParams<'a> {
    /// Name of the chain that originates the deployment transaction (e.g. `"sepolia"`).
    pub source_chain: &'a str,
    /// Names of the chains that should receive the deployment (e.g. `["base-sepolia"]`).
    pub target_chains: Vec<&'a str>,
    /// Full EVM creation bytecode (including constructor arguments).
    pub bytecode: Vec<u8>,
    /// Human-readable salt string; hashed with keccak256 unless it is already
    /// a 0x-prefixed 32-byte hex literal.
    pub salt: &'a str,
    /// ABI-encoded constructor call data forwarded to the deployed contract.
    pub init_calldata: Vec<u8>,
    /// When `true`, the WormDeployer also deploys on the source chain.
    pub deploy_on_source: bool,
    /// Hex-encoded secp256k1 private key used to sign the transaction.
    pub evm_key: &'a str,
    /// Override for the source-chain RPC URL. Falls back to the registry default when `None`.
    pub source_rpc: Option<&'a str>,
}

/// Parameters for a cross-chain call.
pub struct CallParams<'a> {
    /// Name of the chain that originates the call transaction (e.g. `"sepolia"`).
    pub source_chain: &'a str,
    /// Names of the chains that should receive the call (e.g. `["base-sepolia"]`).
    pub target_chains: Vec<&'a str>,
    /// `0x`-prefixed EVM address of the contract to call on each target chain.
    pub target_contract: &'a str,
    /// ABI-encoded call data to forward to the target contract.
    pub call_data: Vec<u8>,
    /// Maximum gas units the relayer will forward on each target chain.
    pub gas_limit: u64,
    /// Hex-encoded secp256k1 private key used to sign the transaction.
    pub evm_key: &'a str,
    /// Override for the source-chain RPC URL. Falls back to the registry default when `None`.
    pub source_rpc: Option<&'a str>,
}

/// Parameters for a cross-chain proxy upgrade.
pub struct UpgradeParams<'a> {
    /// Name of the chain that originates the upgrade transaction (e.g. `"sepolia"`).
    pub source_chain: &'a str,
    /// Names of the chains that should receive the upgrade (e.g. `["base-sepolia"]`).
    pub target_chains: Vec<&'a str>,
    /// `0x`-prefixed EVM address of the proxy contract to upgrade.
    pub proxy: &'a str,
    /// `0x`-prefixed EVM address of the new implementation contract.
    pub new_impl: &'a str,
    /// When `true`, the WormDeployer also upgrades on the source chain.
    pub upgrade_on_source: bool,
    /// Hex-encoded secp256k1 private key used to sign the transaction.
    pub evm_key: &'a str,
    /// Override for the source-chain RPC URL. Falls back to the registry default when `None`.
    pub source_rpc: Option<&'a str>,
}

// ── result structs ────────────────────────────────────────────────────────────

/// Result of a successful multi-chain deployment transaction.
#[derive(Debug)]
pub struct DeployResult {
    /// Transaction hash (`0x`-prefixed) of the source-chain transaction.
    pub tx_hash: String,
    /// Predicted CREATE2 address of the deployed contract (`0x`-prefixed).
    pub expected_address: String,
    /// The 32-byte salt used in the CREATE2 derivation.
    pub salt_bytes32: [u8; 32],
    /// Name of the source chain.
    pub source_chain: String,
    /// Names of all target chains.
    pub target_chains: Vec<String>,
    /// Relayer fee paid (in wei) as reported by the WormDeployer cost quote.
    pub cost_wei: u128,
}

// ── public async functions ────────────────────────────────────────────────────

/// Deploy a contract to one or more chains via the WormDeployer relayer.
///
/// 1. Validates all parameters.
/// 2. Looks up the source chain in the registry.
/// 3. Calls `getDeployCost` to obtain the required fee.
/// 4. Submits a signed `deployAcrossChains` transaction.
/// 5. Returns a [`DeployResult`] with the predicted address and transaction hash.
///
/// # Errors
///
/// Returns [`WormholeError::Unsupported`] for unknown chain names,
/// [`WormholeError::InvalidEncoding`] for malformed parameters, and
/// [`WormholeError::Network`] on RPC failures.
pub async fn deploy_across_chains(params: DeployParams<'_>) -> Result<DeployResult, WormholeError> {
    if params.bytecode.is_empty() {
        return Err(WormholeError::Unsupported(
            "bytecode must not be empty".to_string(),
        ));
    }
    if params.target_chains.is_empty() {
        return Err(WormholeError::Unsupported(
            "at least one target chain is required".to_string(),
        ));
    }

    let source_entry = ChainRegistry::get(params.source_chain).ok_or_else(|| {
        WormholeError::Unsupported(format!("unknown chain: {}", params.source_chain))
    })?;

    let target_ids = resolve_chain_ids(&params.target_chains)?;
    let rpc = params.source_rpc.unwrap_or(source_entry.default_rpc);
    let deployer = source_entry.worm_deployer;

    let salt = create2::salt_from_str(params.salt);

    // Quote the cross-chain delivery fee.
    let cost_calldata = abi::encode_get_deploy_cost(&target_ids);
    let cost_hex = eth_call(rpc, deployer, &cost_calldata).await?;
    let cost_wei = abi::decode_u256_result(&cost_hex)?;

    // Build and send the write transaction.
    let calldata = abi::encode_deploy_across_chains(
        &target_ids,
        &params.bytecode,
        &salt,
        &params.init_calldata,
        params.deploy_on_source,
    );
    let tx_hash = send_signed(rpc, deployer, cost_wei, &calldata, params.evm_key).await?;

    // Predict the CREATE2 address using the deployer as the factory.
    let deployer_bytes = parse_address(deployer)?;
    let expected_bytes = create2::compute_create2_address(deployer_bytes, salt, &params.bytecode);
    let expected_address = format!("0x{}", hex::encode(expected_bytes));

    Ok(DeployResult {
        tx_hash,
        expected_address,
        salt_bytes32: salt,
        source_chain: params.source_chain.to_string(),
        target_chains: params.target_chains.iter().map(|s| s.to_string()).collect(),
        cost_wei,
    })
}

/// Invoke a function on a contract that has been deployed across chains.
///
/// 1. Validates all parameters.
/// 2. Looks up the source chain in the registry.
/// 3. Calls `getCallCost` to obtain the required fee.
/// 4. Submits a signed `callAcrossChains` transaction.
/// 5. Returns the transaction hash.
///
/// # Errors
///
/// Returns [`WormholeError::Unsupported`] for unknown chain names or invalid
/// parameters, [`WormholeError::InvalidEncoding`] for malformed addresses, and
/// [`WormholeError::Network`] on RPC failures.
pub async fn call_across_chains(params: CallParams<'_>) -> Result<String, WormholeError> {
    if params.call_data.is_empty() {
        return Err(WormholeError::Unsupported(
            "call_data must not be empty".to_string(),
        ));
    }
    if params.gas_limit == 0 {
        return Err(WormholeError::Unsupported(
            "gas_limit must be greater than zero".to_string(),
        ));
    }
    if params.target_chains.is_empty() {
        return Err(WormholeError::Unsupported(
            "at least one target chain is required".to_string(),
        ));
    }

    let source_entry = ChainRegistry::get(params.source_chain).ok_or_else(|| {
        WormholeError::Unsupported(format!("unknown chain: {}", params.source_chain))
    })?;

    let target_ids = resolve_chain_ids(&params.target_chains)?;
    let rpc = params.source_rpc.unwrap_or(source_entry.default_rpc);
    let deployer = source_entry.worm_deployer;

    let target_bytes = parse_address(params.target_contract)?;

    // Quote the cross-chain delivery fee.
    let cost_calldata = abi::encode_get_call_cost(&target_ids, params.gas_limit);
    let cost_hex = eth_call(rpc, deployer, &cost_calldata).await?;
    let cost_wei = abi::decode_u256_result(&cost_hex)?;

    // Build and send the write transaction.
    let calldata = abi::encode_call_across_chains(
        &target_ids,
        target_bytes,
        &params.call_data,
        params.gas_limit,
    );
    send_signed(rpc, deployer, cost_wei, &calldata, params.evm_key).await
}

/// Upgrade a proxy contract across chains.
///
/// 1. Validates all parameters (including address format).
/// 2. Looks up the source chain in the registry.
/// 3. Calls `getUpgradeCost` to obtain the required fee.
/// 4. Submits a signed `upgradeAcrossChains` transaction.
/// 5. Returns the transaction hash.
///
/// # Errors
///
/// Returns [`WormholeError::Unsupported`] for unknown chain names or invalid
/// parameters, [`WormholeError::InvalidEncoding`] for malformed addresses, and
/// [`WormholeError::Network`] on RPC failures.
pub async fn upgrade_across_chains(params: UpgradeParams<'_>) -> Result<String, WormholeError> {
    if params.target_chains.is_empty() {
        return Err(WormholeError::Unsupported(
            "at least one target chain is required".to_string(),
        ));
    }

    // Validate addresses early before any async work.
    if params.proxy.len() != 42 || !params.proxy.starts_with("0x") {
        return Err(WormholeError::InvalidEncoding(format!(
            "proxy must be a 42-character 0x-prefixed address, got: {}",
            params.proxy
        )));
    }
    if params.new_impl.len() != 42 || !params.new_impl.starts_with("0x") {
        return Err(WormholeError::InvalidEncoding(format!(
            "new_impl must be a 42-character 0x-prefixed address, got: {}",
            params.new_impl
        )));
    }

    let source_entry = ChainRegistry::get(params.source_chain).ok_or_else(|| {
        WormholeError::Unsupported(format!("unknown chain: {}", params.source_chain))
    })?;

    let target_ids = resolve_chain_ids(&params.target_chains)?;
    let rpc = params.source_rpc.unwrap_or(source_entry.default_rpc);
    let deployer = source_entry.worm_deployer;

    let proxy_bytes = parse_address(params.proxy)?;
    let impl_bytes = parse_address(params.new_impl)?;

    // Quote the cross-chain delivery fee.
    let cost_calldata = abi::encode_get_upgrade_cost(&target_ids);
    let cost_hex = eth_call(rpc, deployer, &cost_calldata).await?;
    let cost_wei = abi::decode_u256_result(&cost_hex)?;

    // Build and send the write transaction.
    let calldata = abi::encode_upgrade_across_chains(
        &target_ids,
        proxy_bytes,
        impl_bytes,
        params.upgrade_on_source,
    );
    send_signed(rpc, deployer, cost_wei, &calldata, params.evm_key).await
}

// ── private helpers ───────────────────────────────────────────────────────────

/// Resolve a slice of chain names to their Wormhole IDs.
///
/// Returns [`WormholeError::Unsupported`] for any name not found in the registry.
fn resolve_chain_ids(names: &[&str]) -> Result<Vec<u16>, WormholeError> {
    names
        .iter()
        .map(|n| {
            ChainRegistry::get(n)
                .map(|e| e.wormhole_id)
                .ok_or_else(|| WormholeError::Unsupported(format!("unknown chain: {n}")))
        })
        .collect()
}

/// Parse a `0x`-prefixed hex Ethereum address string into a 20-byte array.
///
/// Returns [`WormholeError::InvalidEncoding`] if the string is not valid hex
/// or does not decode to exactly 20 bytes.
fn parse_address(addr: &str) -> Result<[u8; 20], WormholeError> {
    let s = addr.strip_prefix("0x").unwrap_or(addr);
    hex::decode(s)
        .map_err(|e| WormholeError::InvalidEncoding(e.to_string()))?
        .try_into()
        .map_err(|_| {
            WormholeError::InvalidEncoding(format!("address must be 20 bytes: {addr}"))
        })
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deploy_params_rejects_empty_bytecode() {
        let result = tokio::runtime::Runtime::new().unwrap().block_on(
            deploy_across_chains(DeployParams {
                source_chain: "sepolia",
                target_chains: vec!["base-sepolia"],
                bytecode: vec![],
                salt: "v1",
                init_calldata: vec![],
                deploy_on_source: false,
                evm_key: "0x01",
                source_rpc: None,
            }),
        );
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("bytecode"),
            "error should mention bytecode, got: {msg}"
        );
    }

    #[test]
    fn deploy_params_rejects_unknown_chain() {
        let result = tokio::runtime::Runtime::new().unwrap().block_on(
            deploy_across_chains(DeployParams {
                source_chain: "mainnet",
                target_chains: vec!["base-sepolia"],
                bytecode: vec![0x60],
                salt: "v1",
                init_calldata: vec![],
                deploy_on_source: false,
                evm_key: "0x01",
                source_rpc: None,
            }),
        );
        assert!(result.is_err());
    }

    #[test]
    fn call_params_rejects_zero_gas_limit() {
        let result = tokio::runtime::Runtime::new().unwrap().block_on(
            call_across_chains(CallParams {
                source_chain: "sepolia",
                target_chains: vec!["base-sepolia"],
                target_contract: "0x0000000000000000000000000000000000000000",
                call_data: vec![0x01],
                gas_limit: 0,
                evm_key: "0x01",
                source_rpc: None,
            }),
        );
        assert!(result.is_err());
    }

    #[test]
    fn deploy_params_rejects_empty_target_chains() {
        let result = tokio::runtime::Runtime::new().unwrap().block_on(
            deploy_across_chains(DeployParams {
                source_chain: "sepolia",
                target_chains: vec![],
                bytecode: vec![0x60],
                salt: "v1",
                init_calldata: vec![],
                deploy_on_source: false,
                evm_key: "0x01",
                source_rpc: None,
            }),
        );
        assert!(result.is_err());
    }

    #[test]
    fn deploy_params_rejects_unknown_target_chain() {
        let result = tokio::runtime::Runtime::new().unwrap().block_on(
            deploy_across_chains(DeployParams {
                source_chain: "sepolia",
                target_chains: vec!["unknown-chain"],
                bytecode: vec![0x60],
                salt: "v1",
                init_calldata: vec![],
                deploy_on_source: false,
                evm_key: "0x01",
                source_rpc: None,
            }),
        );
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("unknown-chain"),
            "error should mention the chain name, got: {msg}"
        );
    }

    #[test]
    fn call_params_rejects_empty_call_data() {
        let result = tokio::runtime::Runtime::new().unwrap().block_on(
            call_across_chains(CallParams {
                source_chain: "sepolia",
                target_chains: vec!["base-sepolia"],
                target_contract: "0x0000000000000000000000000000000000000000",
                call_data: vec![],
                gas_limit: 100_000,
                evm_key: "0x01",
                source_rpc: None,
            }),
        );
        assert!(result.is_err());
    }

    #[test]
    fn upgrade_params_rejects_invalid_proxy_address() {
        let result = tokio::runtime::Runtime::new().unwrap().block_on(
            upgrade_across_chains(UpgradeParams {
                source_chain: "sepolia",
                target_chains: vec!["base-sepolia"],
                proxy: "not-an-address",
                new_impl: "0x0000000000000000000000000000000000000000",
                upgrade_on_source: false,
                evm_key: "0x01",
                source_rpc: None,
            }),
        );
        assert!(result.is_err());
    }

    #[test]
    fn upgrade_params_rejects_invalid_impl_address() {
        let result = tokio::runtime::Runtime::new().unwrap().block_on(
            upgrade_across_chains(UpgradeParams {
                source_chain: "sepolia",
                target_chains: vec!["base-sepolia"],
                proxy: "0x0000000000000000000000000000000000000000",
                new_impl: "not-an-address",
                upgrade_on_source: false,
                evm_key: "0x01",
                source_rpc: None,
            }),
        );
        assert!(result.is_err());
    }

    #[test]
    fn resolve_chain_ids_returns_correct_wormhole_ids() {
        let ids = resolve_chain_ids(&["sepolia", "base-sepolia"]).unwrap();
        assert_eq!(ids, vec![10002u16, 10004u16]);
    }

    #[test]
    fn resolve_chain_ids_errors_on_unknown() {
        let result = resolve_chain_ids(&["sepolia", "not-a-chain"]);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("not-a-chain"));
    }

    #[test]
    fn parse_address_roundtrip() {
        let addr = "0x0102030405060708090a0b0c0d0e0f1011121314";
        let bytes = parse_address(addr).unwrap();
        assert_eq!(bytes[0], 0x01);
        assert_eq!(bytes[19], 0x14);
    }

    #[test]
    fn parse_address_rejects_short_input() {
        let result = parse_address("0xdeadbeef");
        assert!(result.is_err());
    }
}
