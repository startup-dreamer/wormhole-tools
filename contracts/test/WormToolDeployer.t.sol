// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Test} from "forge-std/Test.sol";
import {WormToolDeployer} from "../src/WormToolDeployer.sol";

contract MockRelayer {
    struct Call { uint16 chain; address target; bytes payload; uint256 gas; }
    Call[] internal _calls;
    uint256 public mockCost = 0.001 ether;

    function calls(uint256 i) external view returns (Call memory) { return _calls[i]; }
    function callCount() external view returns (uint256) { return _calls.length; }

    function quoteEVMDeliveryPrice(uint16, uint256, uint256)
        external view returns (uint256, uint256) {
        return (mockCost, 0);
    }

    function sendPayloadToEvm(
        uint16 targetChain, address targetAddress,
        bytes memory payload, uint256, uint256 gasLimit
    ) external payable returns (uint64) {
        _calls.push(Call(targetChain, targetAddress, payload, gasLimit));
        return uint64(_calls.length);
    }
}

contract WormToolDeployerTest is Test {
    WormToolDeployer deployer;
    MockRelayer relayer;
    address owner = address(0xBEEF);

    function setUp() public {
        relayer = new MockRelayer();
        vm.prank(owner);
        deployer = new WormToolDeployer(address(relayer));
    }

    function test_deployAcrossChains_sends_correct_payload() public {
        vm.prank(owner);
        deployer.setTrustedSender(10004, bytes32(uint256(uint160(address(deployer)))));

        bytes memory bytecode = hex"6080604052";
        bytes32 salt = keccak256("test-v1");
        uint16[] memory chains = new uint16[](1);
        chains[0] = 10004;

        uint256 cost = deployer.getDeployCost(chains);
        deployer.deployAcrossChains{value: cost}(chains, bytecode, salt, "", false);

        assertEq(relayer.callCount(), 1);
        (uint8 msgType,,,,) = abi.decode(
            relayer.calls(0).payload,
            (uint8, bytes, bytes32, bytes, address)
        );
        assertEq(msgType, 0x01);
    }

    function test_computeAddress_is_deterministic() public view {
        bytes memory bc = hex"6080";
        bytes32 salt = keccak256("s");
        address a1 = deployer.computeAddress(salt, bc);
        address a2 = deployer.computeAddress(salt, bc);
        assertEq(a1, a2);
        assertTrue(a1 != address(0));
    }

    function test_receiveWormholeMessages_deploy_creates_contract() public {
        bytes memory bytecode = type(MinimalContract).creationCode;
        bytes32 salt = keccak256("recv-test");
        address expected = deployer.computeAddress(salt, bytecode);

        bytes memory payload = abi.encode(uint8(0x01), bytecode, salt, bytes(""), address(this));

        vm.prank(owner);
        deployer.setTrustedSender(10002, bytes32(uint256(uint160(address(deployer)))));
        vm.prank(address(relayer));
        deployer.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(address(deployer)))), 10002, bytes32(0)
        );

        assertTrue(expected.code.length > 0, "contract not deployed");
    }

    function test_receiveWormholeMessages_deploy_twice_skips_not_reverts() public {
        bytes memory bytecode = type(MinimalContract).creationCode;
        bytes32 salt = keccak256("idempotent-test");
        bytes memory payload = abi.encode(uint8(0x01), bytecode, salt, bytes(""), address(this));

        vm.prank(owner);
        deployer.setTrustedSender(10002, bytes32(uint256(uint160(address(deployer)))));

        vm.prank(address(relayer));
        deployer.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(address(deployer)))), 10002, bytes32(0)
        );

        // Second delivery must NOT revert (idempotent)
        vm.prank(address(relayer));
        deployer.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(address(deployer)))), 10002, bytes32(0)
        );
    }

    function test_receiveWormholeMessages_call_executes() public {
        Counter counter = new Counter();
        bytes memory callData = abi.encodeWithSignature("increment()");
        bytes memory payload = abi.encode(uint8(0x02), address(counter), callData);

        vm.prank(owner);
        deployer.setTrustedSender(10002, bytes32(uint256(uint160(address(deployer)))));
        vm.prank(address(relayer));
        deployer.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(address(deployer)))), 10002, bytes32(0)
        );

        assertEq(counter.count(), 1);
    }

    function test_rejects_untrusted_sender() public {
        bytes memory payload = abi.encode(uint8(0x01), hex"", bytes32(0), bytes(""), address(0));
        vm.prank(address(relayer));
        vm.expectRevert("untrusted sender");
        deployer.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(address(0xBAD)))), 10002, bytes32(0)
        );
    }
}

contract MinimalContract {}
contract Counter {
    uint256 public count;
    function increment() external { count++; }
}
