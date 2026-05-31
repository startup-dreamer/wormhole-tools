// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;
import {Script, console} from "forge-std/Script.sol";

interface IHasTrustedSender {
    function setTrustedSender(uint16 chainId, bytes32 senderAddress) external;
}

/// @notice Registers WormcraftDeployer instances on peer chains as trusted senders.
///
/// Must be run once per chain after Bootstrap, passing the Wormhole chain IDs of
/// the two peers you want to bridge.  Run it on every chain in your network.
///
/// Usage (run on each chain):
///   forge script script/Wire.s.sol \
///     --rpc-url $RPC_URL \
///     --broadcast \
///     --sig "run(uint16,uint16)" $WORMHOLE_CHAIN_ID_A $WORMHOLE_CHAIN_ID_B
///
/// Common Wormhole chain IDs (testnet):
///   Ethereum Sepolia  = 10002
///   Base Sepolia      = 10004
///   Arbitrum Sepolia  = 10003
contract Wire is Script {
    // Address of the WormcraftDeployer deployed by Bootstrap (same on every chain).
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
