// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {WormDeployer} from "../src/WormDeployer.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

interface ICreate2Deployer {
    function deploy(uint256 value, bytes32 salt, bytes memory code) external;
    function computeAddress(bytes32 salt, bytes32 codeHash) external view returns (address);
}

/// @notice Deploys WormDeployer implementation + UUPS proxy at deterministic addresses
///         on any EVM chain that has the canonical Create2Deployer factory.
///
/// Usage:
///   forge script script/Bootstrap.s.sol \
///     --rpc-url $RPC_URL \
///     --broadcast \
///     --sig "run(address)" $WORMHOLE_RELAYER_ADDRESS
contract Bootstrap is Script {
    // Canonical Create2Deployer present on all target testnets
    address constant WORM_CREATE2_FACTORY = 0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2;

    bytes32 constant IMPL_SALT  = keccak256("worm-deployer-impl-v1");
    bytes32 constant PROXY_SALT = keccak256("worm-deployer-proxy-v1");

    function run(address wormholeRelayer) external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        console.log("Deployer:", deployer);

        ICreate2Deployer factory = ICreate2Deployer(WORM_CREATE2_FACTORY);

        // ── Step 1: Deploy implementation ────────────────────────────────────
        bytes memory implBytecode = type(WormDeployer).creationCode;
        address implAddr = factory.computeAddress(IMPL_SALT, keccak256(implBytecode));
        console.log("Expected impl address:", implAddr);

        vm.startBroadcast(deployerKey);

        if (implAddr.code.length == 0) {
            factory.deploy(0, IMPL_SALT, implBytecode);
            console.log("Impl deployed at:", implAddr);
        } else {
            console.log("Impl already deployed at:", implAddr);
        }

        // ── Step 2: Deploy proxy ──────────────────────────────────────────────
        bytes memory initData = abi.encodeCall(WormDeployer.initialize, (wormholeRelayer));
        bytes memory proxyBytecode = abi.encodePacked(
            type(ERC1967Proxy).creationCode,
            abi.encode(implAddr, initData)
        );
        address proxyAddr = factory.computeAddress(PROXY_SALT, keccak256(proxyBytecode));
        console.log("Expected proxy address:", proxyAddr);

        if (proxyAddr.code.length == 0) {
            factory.deploy(0, PROXY_SALT, proxyBytecode);
            console.log("Proxy deployed at:", proxyAddr);
        } else {
            console.log("Proxy already deployed at:", proxyAddr);
        }

        vm.stopBroadcast();

        console.log("=== Bootstrap complete ===");
        console.log("WormDeployer canonical address:", proxyAddr);
        console.log("Add to registry: chain name =>", proxyAddr);
    }
}
