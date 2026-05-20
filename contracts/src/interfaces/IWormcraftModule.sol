// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title IWormcraftModule
/// @notice Ownerless Gnosis Safe Module for cross-chain contract execution.
///         Receives MSG_MODULE payloads from WormcraftDeployer via Wormhole and
///         calls ISafe.execTransactionFromModule on the target Safe.
///
///         No governance logic lives here. The Safe handles all thresholds,
///         timelocks, and veto rights through its own modules.
interface IWormcraftModule {

    event Authorized(address indexed safe, uint16 sourceChainId, bytes32 caller);
    event Deauthorized(address indexed safe, uint16 sourceChainId);
    event ModuleExecuted(
        address indexed safe,
        address indexed target,
        address indexed initiator,
        uint16 sourceChainId
    );

    /// @notice Register an authorized source-chain caller for a Safe.
    ///         MUST be called by the Safe itself (msg.sender == safe).
    ///         This means setup requires a Safe transaction — Safe owners govern who can use the module.
    /// @param sourceChainId  Wormhole chain ID of the source chain.
    /// @param caller         Authorized caller address (bytes32-padded) on the source chain.
    function authorize(uint16 sourceChainId, bytes32 caller) external;

    /// @notice Remove a previously authorized caller.
    ///         MUST be called by the Safe itself (msg.sender == safe).
    function deauthorize(uint16 sourceChainId) external;

    /// @notice Check if `caller` is authorized to trigger module execution for `safe` from `sourceChainId`.
    function isAuthorized(address safe, uint16 sourceChainId, address caller) external view returns (bool);
}
