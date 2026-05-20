// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IWormcraftAdminModule, ProxyConfig, ProxyKind} from "./interfaces/IWormcraftAdminModule.sol";

interface IUUPSProxy {
    function upgradeToAndCall(address newImpl, bytes calldata data) external payable;
}

interface ITransparentProxyAdmin {
    function upgradeAndCall(address proxy, address newImpl, bytes calldata data) external payable;
}

interface ITimelockController {
    function schedule(address target, uint256 value, bytes calldata data,
        bytes32 predecessor, bytes32 salt, uint256 delay) external;
    function execute(address target, uint256 value, bytes calldata data,
        bytes32 predecessor, bytes32 salt) external payable;
    function cancel(bytes32 id) external;
    function hashOperation(address target, uint256 value, bytes calldata data,
        bytes32 predecessor, bytes32 salt) external pure returns (bytes32);
    function getMinDelay() external view returns (uint256);
}

/// @title WormcraftAdminModule
/// @notice Standalone upgrade admin for protocols that do not inherit WormcraftProxy.
///         Compatible with OZ TimelockController and Gnosis Safe multisig governance.
///
/// UUPS + Timelock setup (Safe as canceller):
///   1. Deploy this contract (CREATE2, same address on every chain).
///   2. Grant this contract PROPOSER_ROLE + EXECUTOR_ROLE on your TimelockController.
///   3. Keep your Safe as CANCELLER_ROLE on the TimelockController.
///   4. In your UUPS _authorizeUpgrade: require(msg.sender == owner() || msg.sender == adminModule).
///   5. register(proxy, ProxyConfig(UUPS, proxyAddress, timelockAddress)).
///
/// Transparent + Timelock setup:
///   Same as above, but adminTarget = your ProxyAdmin contract address.
///   register(proxy, ProxyConfig(TRANSPARENT, proxyAdminAddress, timelockAddress)).
contract WormcraftAdminModule is IWormcraftAdminModule, Ownable {

    mapping(address => ProxyConfig) private _configs;

    constructor(address owner_) Ownable(owner_) {}

    /// @inheritdoc IWormcraftAdminModule
    function register(address proxy, ProxyConfig calldata config) external onlyOwner {
        require(proxy != address(0), "WormcraftAdminModule: zero proxy");
        require(config.adminTarget != address(0), "WormcraftAdminModule: zero adminTarget");
        _configs[proxy] = config;
        emit ProxyRegistered(proxy, config);
    }

    /// @inheritdoc IWormcraftAdminModule
    function scheduleOrUpgrade(address proxy, address newImpl, bytes32 salt) external onlyOwner {
        ProxyConfig memory cfg = _configs[proxy];
        require(cfg.adminTarget != address(0), "WormcraftAdminModule: proxy not registered");

        (address target, bytes memory upgradeCalldata) = _upgradeCall(cfg, proxy, newImpl);

        if (cfg.timelock == address(0)) {
            (bool ok, bytes memory ret) = target.call(upgradeCalldata);
            require(ok, string(abi.encodePacked("WormcraftAdminModule: upgrade failed: ", ret)));
            emit UpgradeExecuted(proxy, newImpl);
        } else {
            ITimelockController tl = ITimelockController(cfg.timelock);
            tl.schedule(target, 0, upgradeCalldata, bytes32(0), salt, tl.getMinDelay());
            bytes32 opId = tl.hashOperation(target, 0, upgradeCalldata, bytes32(0), salt);
            emit UpgradeScheduled(proxy, newImpl, opId, salt);
        }
    }

    /// @inheritdoc IWormcraftAdminModule
    function executeTimelocked(address proxy, address newImpl, bytes32 salt) external {
        ProxyConfig memory cfg = _configs[proxy];
        require(cfg.timelock != address(0), "WormcraftAdminModule: not a timelock proxy");
        (address target, bytes memory upgradeCalldata) = _upgradeCall(cfg, proxy, newImpl);
        ITimelockController(cfg.timelock).execute(target, 0, upgradeCalldata, bytes32(0), salt);
        emit UpgradeExecuted(proxy, newImpl);
    }

    /// @inheritdoc IWormcraftAdminModule
    function cancelTimelocked(address proxy, address newImpl, bytes32 salt) external onlyOwner {
        ProxyConfig memory cfg = _configs[proxy];
        require(cfg.timelock != address(0), "WormcraftAdminModule: not a timelock proxy");
        (address target, bytes memory upgradeCalldata) = _upgradeCall(cfg, proxy, newImpl);
        bytes32 opId = ITimelockController(cfg.timelock).hashOperation(
            target, 0, upgradeCalldata, bytes32(0), salt
        );
        ITimelockController(cfg.timelock).cancel(opId);
        emit UpgradeCancelled(proxy, opId);
    }

    /// @inheritdoc IWormcraftAdminModule
    function timelockOperationId(address proxy, address newImpl, bytes32 salt)
        external view returns (bytes32)
    {
        ProxyConfig memory cfg = _configs[proxy];
        require(cfg.adminTarget != address(0), "WormcraftAdminModule: proxy not registered");
        require(cfg.timelock != address(0), "WormcraftAdminModule: not a timelock proxy");
        (address target, bytes memory upgradeCalldata) = _upgradeCall(cfg, proxy, newImpl);
        return ITimelockController(cfg.timelock).hashOperation(
            target, 0, upgradeCalldata, bytes32(0), salt
        );
    }

    /// @inheritdoc IWormcraftAdminModule
    function proxyConfig(address proxy) external view returns (ProxyConfig memory) {
        return _configs[proxy];
    }

    function _upgradeCall(ProxyConfig memory cfg, address proxy, address newImpl)
        internal pure returns (address target, bytes memory callData)
    {
        if (cfg.kind == ProxyKind.UUPS) {
            target = proxy;
            callData = abi.encodeWithSignature("upgradeToAndCall(address,bytes)", newImpl, bytes(""));
        } else {
            target = cfg.adminTarget;
            callData = abi.encodeWithSignature("upgradeAndCall(address,address,bytes)", proxy, newImpl, bytes(""));
        }
    }

    receive() external payable {}
}
