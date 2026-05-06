// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CounterV1} from "../src/CounterV1.sol";

/// @notice Deploys CounterV1 implementation + ERC1967 proxy at deterministic CREATE2 addresses.
///
/// Addresses are the same on every chain because:
///   - factory  = broadcaster wallet (same key everywhere)
///   - salt     = fixed constants
///   - initcode = no chain-specific inputs:
///       impl: CounterV1 has no constructor args
///       proxy: CounterV1 impl address (identical via CREATE2) + init calldata that
///              embeds owner (same wallet) and WormToolDeployer (same address everywhere)
///
/// Usage:
///   forge script script/DeployProxy.s.sol \
///     --rpc-url $RPC_URL \
///     --broadcast \
///     --sig "run(address)" $WORM_TOOL_DEPLOYER_ADDRESS
contract DeployProxy is Script {
    bytes32 constant IMPL_SALT  = keccak256("worm-tool-counter-v1-impl");
    bytes32 constant PROXY_SALT = keccak256("worm-tool-counter-v1-proxy");

    function run(address wormToolDeployer) external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);
        console.log("Deployer:", deployer);

        // 1. Pre-compute implementation address; deploy only if not already on-chain.
        bytes memory implInitcode = type(CounterV1).creationCode;
        address implAddr = vm.computeCreate2Address(IMPL_SALT, keccak256(implInitcode));

        vm.startBroadcast(deployerKey);

        if (implAddr.code.length == 0) {
            CounterV1 freshImpl = new CounterV1{salt: IMPL_SALT}();
            require(address(freshImpl) == implAddr, "impl address mismatch");
        } else {
            console.log("CounterV1 impl already deployed, skipping");
        }

        // 2. Proxy — initcode encodes (implAddress, initCalldata); both are deterministic
        bytes memory initData = abi.encodeCall(CounterV1.initialize, (deployer, wormToolDeployer));
        ERC1967Proxy proxy = new ERC1967Proxy{salt: PROXY_SALT}(address(implAddr), initData);

        vm.stopBroadcast();

        console.log("=== DeployProxy complete ===");
        console.log("CounterV1 impl :", implAddr);
        console.log("Proxy (v1)     :", address(proxy));
        console.log("version()      :", CounterV1(address(proxy)).version());
        console.log("owner()        :", CounterV1(address(proxy)).owner());
        console.log("wormToolDeployer:", CounterV1(address(proxy)).wormToolDeployer());
    }
}
