// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CounterNoInheritance} from "../src/CounterNoInheritance.sol";

/// @notice Deploy CounterNoInheritance at a deterministic CREATE2 address.
///         Run on each chain — same address everywhere (deterministic inputs).
///
/// Usage:
///   forge script script/DeployWithAdminModule.s.sol \
///     --rpc-url $RPC_URL --broadcast \
///     --sig "run(address)" $WORMCRAFT_ADMIN_MODULE_ADDRESS
contract DeployWithAdminModule is Script {
    bytes32 constant IMPL_SALT  = keccak256("wormcraft-counter-no-inherit-v1-impl");
    bytes32 constant PROXY_SALT = keccak256("wormcraft-counter-no-inherit-v1-proxy");

    function run(address adminModule) external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        bytes memory implInitcode = type(CounterNoInheritance).creationCode;
        address implAddr = vm.computeCreate2Address(IMPL_SALT, keccak256(implInitcode));

        vm.startBroadcast(deployerKey);

        if (implAddr.code.length == 0) {
            new CounterNoInheritance{salt: IMPL_SALT}();
        } else {
            console.log("Impl already deployed, skipping");
        }

        bytes memory initData = abi.encodeCall(
            CounterNoInheritance.initialize, (deployer, adminModule)
        );
        ERC1967Proxy proxy = new ERC1967Proxy{salt: PROXY_SALT}(implAddr, initData);

        vm.stopBroadcast();

        console.log("=== DeployWithAdminModule complete ===");
        console.log("Impl  :", implAddr);
        console.log("Proxy :", address(proxy));
        console.log("Admin :", CounterNoInheritance(address(proxy)).adminModule());
    }
}
