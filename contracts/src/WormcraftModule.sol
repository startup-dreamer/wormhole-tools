// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IWormholeRelayer, IWormholeReceiver} from "wormhole-solidity-sdk/interfaces/IWormholeRelayer.sol";
import {IWormcraftModule} from "./interfaces/IWormcraftModule.sol";

interface ISafe {
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation
    ) external returns (bool success);
}

/// @title WormcraftModule
/// @notice Ownerless Gnosis Safe Module. Receives Wormhole-verified messages from
///         WormcraftDeployer and executes them on a target Safe via execTransactionFromModule.
///
///         SETUP (done once per chain, via Safe transaction):
///           1. Safe.enableModule(wormcraftModuleAddress)
///           2. WormcraftModule.authorize(sourceChainId, authorizedCallerBytes32)
///              (msg.sender must equal the Safe address)
///
///         USAGE (CLI):
///           wormcraft deploy upgrade --safe 0xSafe --proxy 0xProxy --new-impl 0xImpl --chains ...
///
///         SECURITY MODEL:
///           - Only Wormhole relayer can call receiveWormholeMessages
///           - Only messages from WormcraftDeployer (verified by identical CREATE2 address) are accepted
///           - Only callers registered by the Safe itself are authorized
///           - Safe's own modules (Zodiac Delay, TimelockController) apply as normal
contract WormcraftModule is IWormcraftModule, IWormholeReceiver {

    /// @notice Wormhole standard relayer (immutable, set in constructor).
    IWormholeRelayer public immutable RELAYER;

    /// @notice WormcraftDeployer address — same on all chains via CREATE2.
    ///         Messages are trusted iff they arrive from this address.
    bytes32 public immutable WORMCRAFT_DEPLOYER;

    /// @dev safe => sourceChainId => authorized caller (bytes32-padded address).
    mapping(address => mapping(uint16 => bytes32)) private _authorized;

    /// @param wormholeRelayer   Wormhole standard relayer on this chain.
    /// @param wormcraftDeployer WormcraftDeployer address (same on all chains via CREATE2).
    constructor(address wormholeRelayer, address wormcraftDeployer) {
        RELAYER            = IWormholeRelayer(wormholeRelayer);
        WORMCRAFT_DEPLOYER = bytes32(uint256(uint160(wormcraftDeployer)));
    }

    // ── Self-sovereign registration ───────────────────────────────────────────

    /// @inheritdoc IWormcraftModule
    function authorize(uint16 sourceChainId, bytes32 caller) external {
        // msg.sender IS the Safe — Safe owners control who can trigger their modules
        _authorized[msg.sender][sourceChainId] = caller;
        emit Authorized(msg.sender, sourceChainId, caller);
    }

    /// @inheritdoc IWormcraftModule
    function deauthorize(uint16 sourceChainId) external {
        delete _authorized[msg.sender][sourceChainId];
        emit Deauthorized(msg.sender, sourceChainId);
    }

    /// @inheritdoc IWormcraftModule
    function isAuthorized(address safe, uint16 sourceChainId, address caller) external view returns (bool) {
        return _authorized[safe][sourceChainId] == bytes32(uint256(uint160(caller)));
    }

    // ── Wormhole receiver ─────────────────────────────────────────────────────

    /// @inheritdoc IWormholeReceiver
    function receiveWormholeMessages(
        bytes memory payload,
        bytes[] memory,
        bytes32 sourceAddress,
        uint16 sourceChain,
        bytes32
    ) external payable override {
        require(msg.sender == address(RELAYER), "WormcraftModule: only relayer");
        require(sourceAddress == WORMCRAFT_DEPLOYER, "WormcraftModule: untrusted sender");

        (, address safe, address target, bytes memory callData, address initiator) =
            abi.decode(payload, (uint8, address, address, bytes, address));

        bytes32 expected = _authorized[safe][sourceChain];
        require(expected != bytes32(0), "WormcraftModule: safe not configured");
        require(
            expected == bytes32(uint256(uint160(initiator))),
            "WormcraftModule: initiator not authorized"
        );

        // 0 = CALL operation (not DELEGATECALL)
        bool success = ISafe(safe).execTransactionFromModule(target, 0, callData, 0);
        require(success, "WormcraftModule: Safe execution failed");

        emit ModuleExecuted(safe, target, initiator, sourceChain);
    }

    receive() external payable {}
}
