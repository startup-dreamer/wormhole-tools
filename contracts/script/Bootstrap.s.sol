// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {WormToolDeployer} from "../src/WormToolDeployer.sol";

interface ICreate2Deployer {
    function deploy(uint256 value, bytes32 salt, bytes memory code) external;
    function computeAddress(bytes32 salt, bytes32 codeHash) external view returns (address);
}

/// @notice Deploys WormToolDeployer at a deterministic address on any EVM chain
///         that has the canonical Create2Deployer factory.
///
/// Usage:
///   forge script script/Bootstrap.s.sol \
///     --rpc-url $RPC_URL \
///     --broadcast \
///     --sig "run(address)" $WORMHOLE_RELAYER_ADDRESS
contract Bootstrap is Script {
    // Canonical Create2Deployer present on all target testnets
    address constant WORM_CREATE2_FACTORY = 0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2;

    bytes32 constant DEPLOY_SALT = keccak256("worm-deployer-v1");

    function run(address wormholeRelayer) external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        console.log("Deployer:", deployer);

        ICreate2Deployer factory = ICreate2Deployer(WORM_CREATE2_FACTORY);

        bytes memory bytecode = abi.encodePacked(
            type(WormToolDeployer).creationCode,
            abi.encode(wormholeRelayer)
        );
        address wormToolDeployerAddr = factory.computeAddress(DEPLOY_SALT, keccak256(bytecode));
        console.log("Expected WormToolDeployer address:", wormToolDeployerAddr);

        vm.startBroadcast(deployerKey);

        if (wormToolDeployerAddr.code.length == 0) {
            factory.deploy(0, DEPLOY_SALT, bytecode);
            console.log("WormToolDeployer deployed at:", wormToolDeployerAddr);
        } else {
            console.log("WormToolDeployer already deployed at:", wormToolDeployerAddr);
        }

        vm.stopBroadcast();

        console.log("=== Bootstrap complete ===");
        console.log("WormToolDeployer canonical address:", wormToolDeployerAddr);
        console.log("Add to registry: chain name =>", wormToolDeployerAddr);
    }
}
