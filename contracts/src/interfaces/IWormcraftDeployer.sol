// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

// Message type constants encoded in cross-chain payloads.
uint8 constant MSG_DEPLOY  = 0x01;
uint8 constant MSG_CALL    = 0x02;
uint8 constant MSG_UPGRADE = 0x03;

/// @title IWormcraftDeployer
/// @notice Interface for the WormcraftDeployer cross-chain deployment and call hub.
interface IWormcraftDeployer {

    // ── Events ────────────────────────────────────────────────────────────────

    event ContractDeployed(
        address indexed deployed,
        bytes32 indexed salt,
        address indexed initiator
    );

    event DeploymentSkipped(bytes32 indexed salt, string reason);

    event CrossChainCallExecuted(
        address indexed target,
        bool success,
        bytes returnData
    );

    event ContractUpgraded(
        address indexed proxy,
        address indexed newImpl
    );

    // ── Write: source-chain functions ─────────────────────────────────────────

    /// @notice Deploy bytecode to multiple target chains via Wormhole Standard Relayer.
    /// @param targetChains  Wormhole chain IDs of destination chains.
    /// @param bytecode      Compiled contract bytecode (constructor args appended if any).
    /// @param salt          CREATE2 salt — same contract address on every chain.
    /// @param initCalldata  Called on the deployed contract after CREATE2. Pass "" to skip.
    /// @param deployOnCurrentChain  If true, also deploy on the source chain in this tx.
    function deployAcrossChains(
        uint16[] calldata targetChains,
        bytes calldata bytecode,
        bytes32 salt,
        bytes calldata initCalldata,
        bool deployOnCurrentChain
    ) external payable;

    /// @notice Send an arbitrary cross-chain function call through the WormcraftDeployer hub.
    /// @param targetChains  Wormhole chain IDs to deliver to.
    /// @param target        Contract address on each target chain (must be same address; use deterministic deployment).
    /// @param callData      ABI-encoded function call.
    /// @param gasLimit      Gas allocated for execution on each target chain.
    function callAcrossChains(
        uint16[] calldata targetChains,
        address target,
        bytes calldata callData,
        uint256 gasLimit
    ) external payable;

    /// @notice Upgrade a UUPS proxy to a new implementation across multiple chains.
    /// @param targetChains         Wormhole chain IDs.
    /// @param proxy                Proxy contract address (must be same on all chains via deterministic deploy).
    /// @param newImpl              New implementation address (must be same on all chains).
    /// @param upgradeOnCurrentChain  If true, also upgrade on the source chain in this tx.
    function upgradeAcrossChains(
        uint16[] calldata targetChains,
        address proxy,
        address newImpl,
        bool upgradeOnCurrentChain
    ) external payable;

    // ── View: cost quotes ─────────────────────────────────────────────────────

    /// @notice Total ETH cost to deploy to `chains` (uses fixed DEPLOY_GAS_LIMIT).
    function getDeployCost(uint16[] calldata chains) external view returns (uint256);

    /// @notice Total ETH cost to send a call to `chains` with `gasLimit` per chain.
    function getCallCost(uint16[] calldata chains, uint256 gasLimit) external view returns (uint256);

    /// @notice Total ETH cost to upgrade proxies on `chains` (uses fixed UPGRADE_GAS_LIMIT).
    function getUpgradeCost(uint16[] calldata chains) external view returns (uint256);

    /// @notice Compute the CREATE2 address for a given salt and bytecode.
    function computeAddress(bytes32 salt, bytes calldata bytecode) external view returns (address);

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// @notice Set the Wormhole standard relayer address for this chain (call once after CREATE2 deploy).
    function setRelayer(address _relayer) external;

    /// @notice Register the WormcraftDeployer address on a peer chain.
    function setTrustedSender(uint16 chainId, bytes32 senderAddress) external;
}
