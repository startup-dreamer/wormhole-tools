// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IWormholeRelayer, IWormholeReceiver} from "wormhole-solidity-sdk/interfaces/IWormholeRelayer.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IWormDeployer, MSG_DEPLOY, MSG_CALL, MSG_UPGRADE} from "./interfaces/IWormDeployer.sol";

contract WormDeployer is IWormDeployer, IWormholeReceiver, Ownable {

    // ── Constants ─────────────────────────────────────────────────────────────

    uint256 public constant DEPLOY_GAS_LIMIT  = 3_000_000;
    uint256 public constant UPGRADE_GAS_LIMIT = 200_000;

    // ── Storage ───────────────────────────────────────────────────────────────

    IWormholeRelayer public immutable relayer;

    /// @dev chainId => WormDeployer address on that chain (Wormhole bytes32 format).
    mapping(uint16 => bytes32) public trustedSenders;

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @notice Deploy WormDeployer with the Wormhole relayer address for this chain.
    constructor(address _relayer) Ownable(msg.sender) {
        relayer = IWormholeRelayer(_relayer);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// @inheritdoc IWormDeployer
    function setTrustedSender(uint16 chainId, bytes32 senderAddress) external onlyOwner {
        trustedSenders[chainId] = senderAddress;
    }

    // ── Source-chain: Deploy ──────────────────────────────────────────────────

    /// @inheritdoc IWormDeployer
    function deployAcrossChains(
        uint16[] calldata targetChains,
        bytes calldata bytecode,
        bytes32 salt,
        bytes calldata initCalldata,
        bool deployOnCurrentChain
    ) external payable {
        bytes memory payload = abi.encode(
            MSG_DEPLOY, bytecode, salt, initCalldata, msg.sender
        );
        uint256 remaining = msg.value;

        for (uint256 i = 0; i < targetChains.length; i++) {
            (uint256 cost,) = relayer.quoteEVMDeliveryPrice(
                targetChains[i], 0, DEPLOY_GAS_LIMIT
            );
            require(remaining >= cost, "WormDeployer: insufficient fee");
            remaining -= cost;
            relayer.sendPayloadToEvm{value: cost}(
                targetChains[i],
                _trustedSenderAddress(targetChains[i]),
                payload,
                0,
                DEPLOY_GAS_LIMIT
            );
        }

        if (deployOnCurrentChain) {
            _deploy(bytecode, salt, initCalldata, msg.sender);
        }
    }

    // ── Source-chain: Call ────────────────────────────────────────────────────

    /// @inheritdoc IWormDeployer
    function callAcrossChains(
        uint16[] calldata targetChains,
        address target,
        bytes calldata callData,
        uint256 gasLimit
    ) external payable {
        bytes memory payload = abi.encode(MSG_CALL, target, callData);
        uint256 remaining = msg.value;

        for (uint256 i = 0; i < targetChains.length; i++) {
            (uint256 cost,) = relayer.quoteEVMDeliveryPrice(targetChains[i], 0, gasLimit);
            require(remaining >= cost, "WormDeployer: insufficient fee");
            remaining -= cost;
            relayer.sendPayloadToEvm{value: cost}(
                targetChains[i],
                _trustedSenderAddress(targetChains[i]),
                payload,
                0,
                gasLimit
            );
        }
    }

    // ── Source-chain: Upgrade ─────────────────────────────────────────────────

    /// @inheritdoc IWormDeployer
    function upgradeAcrossChains(
        uint16[] calldata targetChains,
        address proxy,
        address newImpl,
        bool upgradeOnCurrentChain
    ) external payable {
        bytes memory payload = abi.encode(MSG_UPGRADE, proxy, newImpl);
        uint256 remaining = msg.value;

        for (uint256 i = 0; i < targetChains.length; i++) {
            (uint256 cost,) = relayer.quoteEVMDeliveryPrice(
                targetChains[i], 0, UPGRADE_GAS_LIMIT
            );
            require(remaining >= cost, "WormDeployer: insufficient fee");
            remaining -= cost;
            relayer.sendPayloadToEvm{value: cost}(
                targetChains[i],
                _trustedSenderAddress(targetChains[i]),
                payload,
                0,
                UPGRADE_GAS_LIMIT
            );
        }

        if (upgradeOnCurrentChain) {
            _upgrade(proxy, newImpl);
        }
    }

    // ── Receive (called by Wormhole relayer on target chain) ──────────────────

    /// @inheritdoc IWormholeReceiver
    function receiveWormholeMessages(
        bytes memory payload,
        bytes[] memory,
        bytes32 sourceAddress,
        uint16 sourceChain,
        bytes32
    ) external payable override {
        require(msg.sender == address(relayer), "WormDeployer: only relayer");
        require(
            trustedSenders[sourceChain] == sourceAddress,
            "untrusted sender"
        );

        uint8 msgType = abi.decode(payload, (uint8));

        if (msgType == MSG_DEPLOY) {
            (, bytes memory bytecode, bytes32 salt, bytes memory initData, address initiator) =
                abi.decode(payload, (uint8, bytes, bytes32, bytes, address));
            _deploy(bytecode, salt, initData, initiator);

        } else if (msgType == MSG_CALL) {
            (, address target, bytes memory callData) =
                abi.decode(payload, (uint8, address, bytes));
            _call(target, callData);

        } else if (msgType == MSG_UPGRADE) {
            (, address proxy, address newImpl) =
                abi.decode(payload, (uint8, address, address));
            _upgrade(proxy, newImpl);
        }
    }

    // ── View: cost quotes ─────────────────────────────────────────────────────

    /// @inheritdoc IWormDeployer
    function getDeployCost(uint16[] calldata chains) external view returns (uint256 total) {
        for (uint256 i = 0; i < chains.length; i++) {
            (uint256 cost,) = relayer.quoteEVMDeliveryPrice(chains[i], 0, DEPLOY_GAS_LIMIT);
            total += cost;
        }
    }

    /// @inheritdoc IWormDeployer
    function getCallCost(uint16[] calldata chains, uint256 gasLimit) external view returns (uint256 total) {
        for (uint256 i = 0; i < chains.length; i++) {
            (uint256 cost,) = relayer.quoteEVMDeliveryPrice(chains[i], 0, gasLimit);
            total += cost;
        }
    }

    /// @inheritdoc IWormDeployer
    function getUpgradeCost(uint16[] calldata chains) external view returns (uint256 total) {
        for (uint256 i = 0; i < chains.length; i++) {
            (uint256 cost,) = relayer.quoteEVMDeliveryPrice(chains[i], 0, UPGRADE_GAS_LIMIT);
            total += cost;
        }
    }

    /// @inheritdoc IWormDeployer
    function computeAddress(bytes32 salt, bytes calldata bytecode) external view returns (address) {
        return Create2.computeAddress(salt, keccak256(bytecode));
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _deploy(
        bytes memory bytecode,
        bytes32 salt,
        bytes memory initData,
        address initiator
    ) internal {
        address deployed;
        try this._create2(salt, bytecode) returns (address addr) {
            deployed = addr;
        } catch {
            emit DeploymentSkipped(salt, "already deployed");
            return;
        }

        if (initData.length > 0) {
            (bool ok, bytes memory ret) = deployed.call(initData);
            require(ok, string(abi.encodePacked("WormDeployer: init failed: ", ret)));
        }

        emit ContractDeployed(deployed, salt, initiator);
    }

    /// @dev External so it can be wrapped in try/catch (Solidity limitation).
    function _create2(bytes32 salt, bytes memory bytecode) external returns (address) {
        require(msg.sender == address(this), "WormDeployer: internal only");
        return Create2.deploy(0, salt, bytecode);
    }

    function _call(address target, bytes memory callData) internal {
        (bool ok, bytes memory ret) = target.call(callData);
        emit CrossChainCallExecuted(target, ok, ret);
        if (!ok) revert(string(ret));
    }

    function _upgrade(address proxy, address newImpl) internal {
        // Calls upgradeToAndCall on a UUPS proxy.
        // The proxy's _authorizeUpgrade must allow address(this) (WormOwnableProxy).
        (bool ok, bytes memory ret) = proxy.call(
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", newImpl, bytes(""))
        );
        require(ok, string(abi.encodePacked("WormDeployer: upgrade failed: ", ret)));
        emit ContractUpgraded(proxy, newImpl);
    }

    function _trustedSenderAddress(uint16 chainId) internal view returns (address) {
        bytes32 addr = trustedSenders[chainId];
        require(addr != bytes32(0), "WormDeployer: no trusted sender for chain");
        return address(uint160(uint256(addr)));
    }

    receive() external payable {}
}
