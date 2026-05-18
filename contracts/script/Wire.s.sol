// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;
import {Script, console} from "forge-std/Script.sol";

interface IHasTrustedSender {
    function setTrustedSender(uint16 chainId, bytes32 senderAddress) external;
}

contract Wire is Script {
    address constant DEPLOYER = 0x0aA4B5899bAF7326397b1041db9c854056126F57;
    bytes32 constant ADDR32 = bytes32(uint256(uint160(0x0aA4B5899bAF7326397b1041db9c854056126F57)));

    function run(uint16 peer1, uint16 peer2) external {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(key);
        IHasTrustedSender(DEPLOYER).setTrustedSender(peer1, ADDR32);
        IHasTrustedSender(DEPLOYER).setTrustedSender(peer2, ADDR32);
        vm.stopBroadcast();
        console.log("Wired ok");
    }
}
