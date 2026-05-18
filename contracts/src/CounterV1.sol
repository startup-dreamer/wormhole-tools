// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {WormToolProxy} from "./WormToolProxy.sol";

/// @title CounterV1
/// @notice Upgradeable counter — v1 supports only increment.
/// @dev Inherits WormToolProxy so the WormToolDeployer hub can upgrade it cross-chain.
contract CounterV1 is WormToolProxy {
    uint256 public count;

    /// @notice Initialize ownership and WormToolDeployer authority.
    /// @param owner              Owner of this proxy (typically the deployer wallet).
    /// @param wormToolDeployer_  WormToolDeployer address on this chain.
    function initialize(address owner, address wormToolDeployer_) external initializer {
        __WormToolProxy_init(owner, wormToolDeployer_);
    }

    function increment() external {
        count++;
    }

    function version() external pure returns (string memory) {
        return "v1";
    }
}
