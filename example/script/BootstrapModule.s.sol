// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {WormcraftModule} from "@wormcraft/WormcraftModule.sol";

/// @notice Deploys WormcraftModule at a deterministic CREATE2 address.
///
/// Must be deployed AFTER WormcraftDeployer Bootstrap so the deployer address is known.
/// Use the same deployer wallet on every chain — same salt + same key = same address everywhere.
///
/// Usage (run on each chain):
///   forge script script/BootstrapModule.s.sol \
///     --rpc-url $RPC_URL --broadcast \
///     --sig "run(address,address)" $WORMHOLE_RELAYER $WORMCRAFT_DEPLOYER
contract BootstrapModule is Script {
    bytes32 constant SALT = keccak256("wormcraft-module-v1");

    function run(address wormholeRelayer, address wormcraftDeployer) external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        WormcraftModule m = new WormcraftModule{salt: SALT}(wormholeRelayer, wormcraftDeployer);

        vm.stopBroadcast();

        console.log("=== BootstrapModule complete ===");
        console.log("WormcraftModule:", address(m));
        console.log("Relayer:", wormholeRelayer);
        console.log("Trusted deployer:", wormcraftDeployer);
        console.log("Owner: none (ownerless)");
    }
}
