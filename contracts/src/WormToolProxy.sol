// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title WormToolProxy
/// @notice Abstract base for user contracts upgradeable via `worm deploy upgrade`.
///
/// Inherit this instead of OwnableUpgradeable + UUPSUpgradeable and call
/// `__WormToolProxy_init(owner, wormToolDeployerAddress)` in your initializer.
///
/// Either the contract owner or the local WormToolDeployer may call
/// `upgradeToAndCall`, enabling cross-chain upgrades via `worm deploy upgrade`.
abstract contract WormToolProxy is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    /// @dev Address of the WormToolDeployer on this chain. Set once at init; never changes.
    address private _wormToolDeployer;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    /// @notice Initialize ownership and WormToolDeployer authority.
    /// @param initialOwner        Owner of this contract (typically the deployer).
    /// @param wormToolDeployerAddr  WormToolDeployer hub address on this chain.
    function __WormToolProxy_init(
        address initialOwner,
        address wormToolDeployerAddr
    ) internal onlyInitializing {
        __Ownable_init(initialOwner);
        _wormToolDeployer = wormToolDeployerAddr;
    }

    /// @notice The WormToolDeployer address authorized to upgrade this contract.
    function wormToolDeployer() external view returns (address) {
        return _wormToolDeployer;
    }

    /// @dev Allow either owner or WormToolDeployer to authorize upgrades.
    function _authorizeUpgrade(address) internal view override {
        require(
            msg.sender == owner() || msg.sender == _wormToolDeployer,
            "WormToolProxy: not authorized to upgrade"
        );
    }
}
