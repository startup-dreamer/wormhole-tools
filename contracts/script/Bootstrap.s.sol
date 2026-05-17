// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {WormToolDeployer} from "../src/WormToolDeployer.sol";

/// @notice Deploys WormToolDeployer at a deterministic CREATE2 address on any EVM chain.
///
/// The same address is guaranteed on every chain because:
///   - CREATE2 factory  = the broadcast key's address (same everywhere)
///   - salt             = keccak256("worm-tool-deployer-v1") (constant)
///   - init bytecode    = WormToolDeployer bytecode ++ abi.encode(owner)
///                        where owner = the broadcast key address (same everywhere)
///
/// Usage:
///   forge script script/Bootstrap.s.sol \
///     --rpc-url $RPC_URL \
///     --broadcast \
///     --sig "run(address)" $WORMHOLE_RELAYER_ADDRESS
contract Bootstrap is Script {
    bytes32 constant SALT = keccak256("worm-tool-deployer-v1");

    function run(address wormholeRelayer) external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerKey);

        // new{salt: SALT} → CREATE2 with broadcaster as factory.
        // Same key + same salt + same owner arg = same address on every chain.
        WormToolDeployer d = new WormToolDeployer{salt: SALT}(deployer);
        d.setRelayer(wormholeRelayer);

        vm.stopBroadcast();

        console.log("=== Bootstrap complete ===");
        console.log("WormToolDeployer deployed at:", address(d));
        console.log("Owner:", d.owner());
        console.log("Relayer:", address(d.relayer()));
    }
}
