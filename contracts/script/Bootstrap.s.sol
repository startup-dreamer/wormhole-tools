// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {WormToolDeployer} from "../src/WormToolDeployer.sol";

/// @notice Deploys WormToolDeployer with msg.sender (the broadcast key) as owner.
///
/// Usage:
///   forge script script/Bootstrap.s.sol \
///     --rpc-url $RPC_URL \
///     --broadcast \
///     --sig "run(address)" $WORMHOLE_RELAYER_ADDRESS
contract Bootstrap is Script {
    function run(address wormholeRelayer) external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerKey);
        WormToolDeployer d = new WormToolDeployer(wormholeRelayer);
        vm.stopBroadcast();

        console.log("=== Bootstrap complete ===");
        console.log("WormToolDeployer deployed at:", address(d));
        console.log("Owner:", d.owner());
    }
}
