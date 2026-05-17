// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {WormDeployer} from "../src/WormDeployer.sol";

interface ICreate2Deployer {
    function deploy(uint256 value, bytes32 salt, bytes memory code) external;
    function computeAddress(bytes32 salt, bytes32 codeHash) external view returns (address);
}

/// @notice Deploys WormDeployer at a deterministic address on any EVM chain
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
            type(WormDeployer).creationCode,
            abi.encode(wormholeRelayer)
        );
        address wormDeployerAddr = factory.computeAddress(DEPLOY_SALT, keccak256(bytecode));
        console.log("Expected WormDeployer address:", wormDeployerAddr);

        vm.startBroadcast(deployerKey);

        if (wormDeployerAddr.code.length == 0) {
            factory.deploy(0, DEPLOY_SALT, bytecode);
            console.log("WormDeployer deployed at:", wormDeployerAddr);
        } else {
            console.log("WormDeployer already deployed at:", wormDeployerAddr);
        }

        vm.stopBroadcast();

        console.log("=== Bootstrap complete ===");
        console.log("WormDeployer canonical address:", wormDeployerAddr);
        console.log("Add to registry: chain name =>", wormDeployerAddr);
    }
}
