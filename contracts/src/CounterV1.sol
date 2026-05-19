// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {WormcraftProxy} from "./WormcraftProxy.sol";

/// @title CounterV1
/// @notice Upgradeable counter — v1 supports only increment.
/// @dev Inherits WormcraftProxy so the WormcraftDeployer hub can upgrade it cross-chain.
contract CounterV1 is WormcraftProxy {
    uint256 public count;

    /// @notice Initialize ownership and WormcraftDeployer authority.
    /// @param owner              Owner of this proxy (typically the deployer wallet).
    /// @param wormToolDeployer_  WormcraftDeployer address on this chain.
    function initialize(address owner, address wormToolDeployer_) external initializer {
        __WormcraftProxy_init(owner, wormToolDeployer_);
    }

    function increment() external {
        count++;
    }

    function version() external pure returns (string memory) {
        return "v1";
    }
}
