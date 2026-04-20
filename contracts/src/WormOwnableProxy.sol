// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title WormOwnableProxy
/// @notice Abstract base for user contracts upgradeable via `worm deploy upgrade`.
///
/// Inherit this instead of OwnableUpgradeable + UUPSUpgradeable and call
/// `__WormOwnableProxy_init(owner, wormDeployerAddress)` in your initializer.
///
/// Either the contract owner or the local WormDeployer may call
/// `upgradeToAndCall`, enabling cross-chain upgrades via `worm deploy upgrade`.
abstract contract WormOwnableProxy is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    /// @dev Address of the WormDeployer on this chain. Set once at init; never changes.
    address private _wormDeployer;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    /// @notice Initialize ownership and WormDeployer authority.
    /// @param initialOwner    Owner of this contract (typically the deployer).
    /// @param wormDeployerAddr  WormDeployer hub address on this chain.
    function __WormOwnableProxy_init(
        address initialOwner,
        address wormDeployerAddr
    ) internal onlyInitializing {
        __Ownable_init(initialOwner);
        _wormDeployer = wormDeployerAddr;
    }

    /// @notice The WormDeployer address authorized to upgrade this contract.
    function wormDeployer() external view returns (address) {
        return _wormDeployer;
    }

    /// @dev Allow either owner or WormDeployer to authorize upgrades.
    function _authorizeUpgrade(address) internal view override {
        require(
            msg.sender == owner() || msg.sender == _wormDeployer,
            "WormOwnableProxy: not authorized to upgrade"
        );
    }
}
