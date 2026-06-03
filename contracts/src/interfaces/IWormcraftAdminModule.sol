// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

enum ProxyKind { UUPS, TRANSPARENT }

struct ProxyConfig {
    ProxyKind kind;
    /// @dev UUPS: the proxy address itself. TRANSPARENT: the ProxyAdmin contract address.
    address adminTarget;
    /// @dev address(0) = direct mode (no delay). Non-zero = TimelockController address.
    address timelock;
}

interface IWormcraftAdminModule {
    event ProxyRegistered(address indexed proxy, ProxyConfig config);
    event UpgradeScheduled(address indexed proxy, address indexed newImpl, bytes32 timelockOpId, bytes32 salt);
    event UpgradeExecuted(address indexed proxy, address indexed newImpl);
    event UpgradeCancelled(address indexed proxy, bytes32 timelockOpId);

    /// @notice Register a proxy with its admin config. Only owner.
    function register(address proxy, ProxyConfig calldata config) external;

    /// @notice Direct mode: upgrades immediately. Timelock mode: schedules on TimelockController.
    ///         Called by WormcraftDeployer's callAcrossChains — only owner may call.
    function scheduleOrUpgrade(address proxy, address newImpl, bytes32 salt) external;

    /// @notice Execute a previously scheduled timelock operation. Callable by anyone after delay.
    function executeTimelocked(address proxy, address newImpl, bytes32 salt) external;

    /// @notice Cancel a pending timelock operation. Only owner.
    function cancelTimelocked(address proxy, address newImpl, bytes32 salt) external;

    /// @notice Compute the OZ TimelockController operationId for a given upgrade.
    function timelockOperationId(address proxy, address newImpl, bytes32 salt) external view returns (bytes32);

    /// @notice Get the registered config for a proxy.
    function proxyConfig(address proxy) external view returns (ProxyConfig memory);
}
