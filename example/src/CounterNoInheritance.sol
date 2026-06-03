// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {UUPSUpgradeable}    from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable}      from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title CounterNoInheritance
/// @notice UUPS upgradeable counter that does NOT inherit WormcraftProxy.
///         Cross-chain upgrades are managed by a WormcraftAdminModule address
///         set at initialisation — zero other Wormcraft imports needed.
contract CounterNoInheritance is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    uint256 public count;
    address private _adminModule;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address owner_, address adminModule_) external initializer {
        __Ownable_init(owner_);
        _adminModule = adminModule_;
    }

    function increment() external { count++; }

    function version() external pure returns (string memory) { return "v1"; }

    function adminModule() external view returns (address) { return _adminModule; }

    function _authorizeUpgrade(address) internal view override {
        require(
            msg.sender == owner() || msg.sender == _adminModule,
            "CounterNoInheritance: not authorized"
        );
    }
}
