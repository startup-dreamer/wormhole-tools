// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Test} from "forge-std/Test.sol";
import {WormcraftAdminModule} from "../src/WormcraftAdminModule.sol";
import {IWormcraftAdminModule, ProxyConfig, ProxyKind} from "../src/interfaces/IWormcraftAdminModule.sol";

contract MockUUPSProxy {
    address public latestImpl;
    function upgradeToAndCall(address newImpl, bytes calldata) external payable {
        latestImpl = newImpl;
    }
}

contract MockProxyAdmin {
    address public latestProxy;
    address public latestImpl;
    function upgradeAndCall(address proxy, address newImpl, bytes calldata) external payable {
        latestProxy = proxy;
        latestImpl  = newImpl;
    }
}

contract MockTimelock {
    bytes32 public lastSalt;
    uint256 public lastDelay;
    bool public executeCalled;
    bool public cancelCalled;
    bytes32 public cancelledId;

    function getMinDelay() external pure returns (uint256) { return 2 days; }

    function hashOperation(address target, uint256, bytes calldata data, bytes32, bytes32 salt)
        external pure returns (bytes32)
    { return keccak256(abi.encode(target, data, salt)); }

    function schedule(address, uint256, bytes calldata, bytes32, bytes32 salt, uint256 delay)
        external { lastSalt = salt; lastDelay = delay; }

    function execute(address target, uint256, bytes calldata data, bytes32, bytes32) external payable {
        executeCalled = true;
        (bool ok,) = target.call{value: msg.value}(data);
        require(ok, "execute: target call failed");
    }

    function cancel(bytes32 id) external { cancelCalled = true; cancelledId = id; }
}

contract WormcraftAdminModuleTest is Test {
    WormcraftAdminModule module;
    MockUUPSProxy        uupsProxy;
    MockProxyAdmin       proxyAdmin;
    MockTimelock         timelock;

    address owner    = address(0xBEEF);
    address attacker = address(0xBAD);
    address implV2   = address(0x1234);
    bytes32 salt     = keccak256("test-salt");

    function setUp() public {
        module     = new WormcraftAdminModule(owner);
        uupsProxy  = new MockUUPSProxy();
        proxyAdmin = new MockProxyAdmin();
        timelock   = new MockTimelock();
    }

    // ── register ──────────────────────────────────────────────────────────────

    function test_register_stores_config() public {
        ProxyConfig memory cfg = ProxyConfig(ProxyKind.UUPS, address(uupsProxy), address(0));
        vm.prank(owner); module.register(address(uupsProxy), cfg);
        ProxyConfig memory stored = module.proxyConfig(address(uupsProxy));
        assertEq(stored.adminTarget, address(uupsProxy));
        assertEq(stored.timelock, address(0));
        assertEq(uint8(stored.kind), uint8(ProxyKind.UUPS));
    }

    function test_register_only_owner() public {
        ProxyConfig memory cfg = ProxyConfig(ProxyKind.UUPS, address(uupsProxy), address(0));
        vm.prank(attacker);
        vm.expectRevert();
        module.register(address(uupsProxy), cfg);
    }

    // ── direct mode ───────────────────────────────────────────────────────────

    function test_direct_uups_upgrade_calls_proxy() public {
        ProxyConfig memory cfg = ProxyConfig(ProxyKind.UUPS, address(uupsProxy), address(0));
        vm.prank(owner); module.register(address(uupsProxy), cfg);
        vm.prank(owner); module.scheduleOrUpgrade(address(uupsProxy), implV2, salt);
        assertEq(uupsProxy.latestImpl(), implV2);
    }

    function test_direct_transparent_upgrade_calls_proxy_admin() public {
        address proxy = address(0xABCD);
        ProxyConfig memory cfg = ProxyConfig(ProxyKind.TRANSPARENT, address(proxyAdmin), address(0));
        vm.prank(owner); module.register(proxy, cfg);
        vm.prank(owner); module.scheduleOrUpgrade(proxy, implV2, salt);
        assertEq(proxyAdmin.latestImpl(), implV2);
        assertEq(proxyAdmin.latestProxy(), proxy);
    }

    function test_direct_upgrade_only_owner() public {
        ProxyConfig memory cfg = ProxyConfig(ProxyKind.UUPS, address(uupsProxy), address(0));
        vm.prank(owner); module.register(address(uupsProxy), cfg);
        vm.prank(attacker);
        vm.expectRevert();
        module.scheduleOrUpgrade(address(uupsProxy), implV2, salt);
    }

    // ── timelock mode ─────────────────────────────────────────────────────────

    function test_timelock_schedules_not_upgrades_immediately() public {
        ProxyConfig memory cfg = ProxyConfig(ProxyKind.UUPS, address(uupsProxy), address(timelock));
        vm.prank(owner); module.register(address(uupsProxy), cfg);
        vm.prank(owner); module.scheduleOrUpgrade(address(uupsProxy), implV2, salt);
        // Implementation must NOT be upgraded yet
        assertEq(uupsProxy.latestImpl(), address(0));
        // Timelock must have received schedule call with correct delay
        assertEq(timelock.lastSalt(), salt);
        assertEq(timelock.lastDelay(), 2 days);
    }

    function test_execute_timelocked_runs_upgrade() public {
        ProxyConfig memory cfg = ProxyConfig(ProxyKind.UUPS, address(uupsProxy), address(timelock));
        vm.prank(owner); module.register(address(uupsProxy), cfg);
        vm.prank(owner); module.scheduleOrUpgrade(address(uupsProxy), implV2, salt);
        // Execute after delay
        module.executeTimelocked(address(uupsProxy), implV2, salt);
        assertTrue(timelock.executeCalled());
        assertEq(uupsProxy.latestImpl(), implV2);
    }

    function test_cancel_calls_timelock_cancel() public {
        ProxyConfig memory cfg = ProxyConfig(ProxyKind.UUPS, address(uupsProxy), address(timelock));
        vm.prank(owner); module.register(address(uupsProxy), cfg);
        vm.prank(owner); module.scheduleOrUpgrade(address(uupsProxy), implV2, salt);
        vm.prank(owner); module.cancelTimelocked(address(uupsProxy), implV2, salt);
        assertTrue(timelock.cancelCalled());
    }

    // ── guards ────────────────────────────────────────────────────────────────

    function test_schedule_reverts_for_unregistered_proxy() public {
        vm.prank(owner);
        vm.expectRevert("WormcraftAdminModule: proxy not registered");
        module.scheduleOrUpgrade(address(0xDEAD), implV2, salt);
    }

    function test_execute_reverts_for_direct_mode_proxy() public {
        ProxyConfig memory cfg = ProxyConfig(ProxyKind.UUPS, address(uupsProxy), address(0));
        vm.prank(owner); module.register(address(uupsProxy), cfg);
        vm.expectRevert("WormcraftAdminModule: not a timelock proxy");
        module.executeTimelocked(address(uupsProxy), implV2, salt);
    }
}
