// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {WormcraftProxy} from "@wormcraft/WormcraftProxy.sol";

/// @title CounterV2
/// @notice Upgradeable counter — v2 adds decrement and exposes a version string.
/// @dev Drop-in upgrade for CounterV1; storage layout is compatible (uint256 count at slot 0 after proxy slots).
contract CounterV2 is WormcraftProxy {
    uint256 public count;

    /// @notice Re-initializer is not needed for this upgrade (no new storage to initialise).
    /// @dev Initialize is still present for completeness; using reinitializer(2) prevents replay.
    function initialize(address owner, address wormToolDeployer_) external reinitializer(2) {
        __WormcraftProxy_init(owner, wormToolDeployer_);
    }

    function increment() external {
        count++;
    }

    function decrement() external {
        if (count > 0) count--;
    }

    function version() external pure returns (string memory) {
        return "v2";
    }
}
