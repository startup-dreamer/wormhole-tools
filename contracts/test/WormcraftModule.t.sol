// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Test} from "forge-std/Test.sol";
import {WormcraftModule} from "../src/WormcraftModule.sol";

contract MockRelayer {
    function quoteEVMDeliveryPrice(uint16, uint256, uint256) external pure returns (uint256, uint256) {
        return (0.001 ether, 0);
    }
}

contract MockSafe {
    address public lastTarget;
    bytes  public lastData;
    bool   public shouldFail;

    function setShouldFail(bool v) external { shouldFail = v; }

    function execTransactionFromModule(address to, uint256, bytes calldata data, uint8)
        external returns (bool)
    {
        if (shouldFail) return false;
        lastTarget = to;
        lastData   = data;
        return true;
    }

    function callAuthorize(address payable module, uint16 chainId, bytes32 caller) external {
        WormcraftModule(module).authorize(chainId, caller);
    }
}

contract WormcraftModuleTest is Test {
    WormcraftModule module_;
    MockRelayer     relayer;
    MockSafe        safe;

    address deployer_        = address(0xDEAD);
    address authorizedCaller = address(0xCAFE);
    address attacker         = address(0xBAD);
    uint16  SOURCE_CHAIN     = 10002;

    function setUp() public {
        relayer = new MockRelayer();
        safe    = new MockSafe();
        module_ = new WormcraftModule(address(relayer), deployer_);

        vm.prank(address(safe));
        module_.authorize(SOURCE_CHAIN, bytes32(uint256(uint160(authorizedCaller))));
    }

    // ── authorize ─────────────────────────────────────────────────────────────

    function test_authorize_stores_caller() public view {
        assertTrue(module_.isAuthorized(address(safe), SOURCE_CHAIN, authorizedCaller));
    }

    function test_authorize_is_self_sovereign() public {
        // An attacker calling authorize only whitelists callers for the attacker-as-safe,
        // not for the real safe.
        vm.prank(attacker);
        module_.authorize(SOURCE_CHAIN, bytes32(uint256(uint160(authorizedCaller))));
        assertFalse(module_.isAuthorized(address(safe), SOURCE_CHAIN, attacker));
        assertTrue(module_.isAuthorized(attacker, SOURCE_CHAIN, authorizedCaller));
    }

    function test_deauthorize_removes_entry() public {
        vm.prank(address(safe));
        module_.deauthorize(SOURCE_CHAIN);
        assertFalse(module_.isAuthorized(address(safe), SOURCE_CHAIN, authorizedCaller));
    }

    // ── receiveWormholeMessages ───────────────────────────────────────────────

    function _payload(address initiator) internal view returns (bytes memory) {
        return abi.encode(
            uint8(0x04),          // MSG_MODULE
            address(safe),        // safe
            address(0x1234),      // target
            bytes("increment()"), // calldata
            initiator
        );
    }

    function test_happy_path_calls_execTransactionFromModule() public {
        bytes memory payload = _payload(authorizedCaller);
        vm.prank(address(relayer));
        module_.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(deployer_))),
            SOURCE_CHAIN, bytes32(0)
        );
        assertEq(safe.lastTarget(), address(0x1234));
    }

    function test_rejects_non_relayer_caller() public {
        bytes memory payload = _payload(authorizedCaller);
        vm.prank(attacker);
        vm.expectRevert("WormcraftModule: only relayer");
        module_.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(deployer_))),
            SOURCE_CHAIN, bytes32(0)
        );
    }

    function test_rejects_untrusted_sender() public {
        bytes memory payload = _payload(authorizedCaller);
        vm.prank(address(relayer));
        vm.expectRevert("WormcraftModule: untrusted sender");
        module_.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(attacker))),  // not the deployer
            SOURCE_CHAIN, bytes32(0)
        );
    }

    function test_rejects_unauthorized_initiator() public {
        bytes memory payload = _payload(attacker);  // attacker not authorized
        vm.prank(address(relayer));
        vm.expectRevert("WormcraftModule: initiator not authorized");
        module_.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(deployer_))),
            SOURCE_CHAIN, bytes32(0)
        );
    }

    function test_rejects_unconfigured_safe() public {
        address unknownSafe = address(0xFFFF);
        bytes memory payload = abi.encode(
            uint8(0x04), unknownSafe, address(0x1234), bytes(""), authorizedCaller
        );
        vm.prank(address(relayer));
        vm.expectRevert("WormcraftModule: safe not configured");
        module_.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(deployer_))),
            SOURCE_CHAIN, bytes32(0)
        );
    }

    function test_reverts_when_safe_execution_fails() public {
        safe.setShouldFail(true);
        bytes memory payload = _payload(authorizedCaller);
        vm.prank(address(relayer));
        vm.expectRevert("WormcraftModule: Safe execution failed");
        module_.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(deployer_))),
            SOURCE_CHAIN, bytes32(0)
        );
    }
}
