// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IWormholeRelayer, IWormholeReceiver} from "wormhole-solidity-sdk/interfaces/IWormholeRelayer.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IWormcraftDeployer, MSG_DEPLOY, MSG_CALL, MSG_UPGRADE} from "./interfaces/IWormcraftDeployer.sol";

contract WormcraftDeployer is IWormcraftDeployer, IWormholeReceiver, Ownable {

    // ── Constants ─────────────────────────────────────────────────────────────

    uint256 public constant DEPLOY_GAS_LIMIT  = 3_000_000;
    uint256 public constant UPGRADE_GAS_LIMIT = 200_000;

    // ── Storage ───────────────────────────────────────────────────────────────

    /// @notice Wormhole standard relayer for this chain (set once after deployment via setRelayer).
    IWormholeRelayer public relayer;

    /// @dev chainId => WormcraftDeployer address on that chain (Wormhole bytes32 format).
    mapping(uint16 => bytes32) public trustedSenders;

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @notice Deploy WormcraftDeployer.
    /// @dev    `owner` is passed explicitly (not msg.sender) so that the same owner
    ///         address can be encoded in the constructor args on every chain — keeping
    ///         the init-bytecode hash identical and therefore the CREATE2 address the
    ///         same everywhere.  Call `setRelayer` immediately after deployment.
    constructor(address owner) Ownable(owner) {}

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// @notice Set the Wormhole relayer for this chain. Must be called once after CREATE2 deploy.
    /// @dev    Not restricted to one-time to allow upgrading relayer if Wormhole deploys a new one.
    function setRelayer(address _relayer) external onlyOwner {
        relayer = IWormholeRelayer(_relayer);
    }

    /// @inheritdoc IWormcraftDeployer
    function setTrustedSender(uint16 chainId, bytes32 senderAddress) external onlyOwner {
        trustedSenders[chainId] = senderAddress;
    }

    // ── Source-chain: Deploy ──────────────────────────────────────────────────

    /// @inheritdoc IWormcraftDeployer
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
            require(remaining >= cost, "WormcraftDeployer: insufficient fee");
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

    /// @inheritdoc IWormcraftDeployer
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
            require(remaining >= cost, "WormcraftDeployer: insufficient fee");
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

    /// @inheritdoc IWormcraftDeployer
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
            require(remaining >= cost, "WormcraftDeployer: insufficient fee");
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
        require(msg.sender == address(relayer), "WormcraftDeployer: only relayer");
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

    /// @inheritdoc IWormcraftDeployer
    function getDeployCost(uint16[] calldata chains) external view returns (uint256 total) {
        for (uint256 i = 0; i < chains.length; i++) {
            (uint256 cost,) = relayer.quoteEVMDeliveryPrice(chains[i], 0, DEPLOY_GAS_LIMIT);
            total += cost;
        }
    }

    /// @inheritdoc IWormcraftDeployer
    function getCallCost(uint16[] calldata chains, uint256 gasLimit) external view returns (uint256 total) {
        for (uint256 i = 0; i < chains.length; i++) {
            (uint256 cost,) = relayer.quoteEVMDeliveryPrice(chains[i], 0, gasLimit);
            total += cost;
        }
    }

    /// @inheritdoc IWormcraftDeployer
    function getUpgradeCost(uint16[] calldata chains) external view returns (uint256 total) {
        for (uint256 i = 0; i < chains.length; i++) {
            (uint256 cost,) = relayer.quoteEVMDeliveryPrice(chains[i], 0, UPGRADE_GAS_LIMIT);
            total += cost;
        }
    }

    /// @inheritdoc IWormcraftDeployer
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
        // Pre-check: skip silently if the contract is already deployed at this address.
        // Using a pre-check instead of try/catch on an external call avoids the EIP-150
        // 63/64 gas-forwarding penalty, which starves large-bytecode CREATE2 deployments.
        address predicted = Create2.computeAddress(salt, keccak256(bytecode));
        if (predicted.code.length > 0) {
            emit DeploymentSkipped(salt, "already deployed");
            return;
        }

        address deployed = Create2.deploy(0, salt, bytecode);

        if (initData.length > 0) {
            (bool ok, bytes memory ret) = deployed.call(initData);
            require(ok, string(abi.encodePacked("WormcraftDeployer: init failed: ", ret)));
        }

        emit ContractDeployed(deployed, salt, initiator);
    }

    function _call(address target, bytes memory callData) internal {
        (bool ok, bytes memory ret) = target.call(callData);
        emit CrossChainCallExecuted(target, ok, ret);
        if (!ok) revert(string(ret));
    }

    function _upgrade(address proxy, address newImpl) internal {
        // Calls upgradeToAndCall on a UUPS proxy.
        // The proxy's _authorizeUpgrade must allow address(this) (WormcraftProxy).
        (bool ok, bytes memory ret) = proxy.call(
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", newImpl, bytes(""))
        );
        require(ok, string(abi.encodePacked("WormcraftDeployer: upgrade failed: ", ret)));
        emit ContractUpgraded(proxy, newImpl);
    }

    function _trustedSenderAddress(uint16 chainId) internal view returns (address) {
        bytes32 addr = trustedSenders[chainId];
        require(addr != bytes32(0), "WormcraftDeployer: no trusted sender for chain");
        return address(uint160(uint256(addr)));
    }

    receive() external payable {}
}
