// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;
import {Script, console} from "forge-std/Script.sol";

interface IHasTrustedSender {
    function setTrustedSender(uint16 chainId, bytes32 senderAddress) external;
}

contract Wire is Script {
    address constant DEPLOYER = 0xC8059e943CD42BfC6273C5A8E6F01fdB80Fa7748;
    bytes32 constant ADDR32 = bytes32(uint256(uint160(0xC8059e943CD42BfC6273C5A8E6F01fdB80Fa7748)));

    function run(uint16 peer1, uint16 peer2) external {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(key);
        IHasTrustedSender(DEPLOYER).setTrustedSender(peer1, ADDR32);
        IHasTrustedSender(DEPLOYER).setTrustedSender(peer2, ADDR32);
        vm.stopBroadcast();
        console.log("Wired: peer1=%s peer2=%s", peer1, peer2);
    }
}
