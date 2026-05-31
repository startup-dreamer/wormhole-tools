# WormcraftAdminModule — Inheritance-Free Cross-Chain Governance

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add `WormcraftAdminModule`, a standalone contract enabling cross-chain proxy upgrades without requiring protocol contracts to inherit `WormcraftProxy`, with full support for OZ `TimelockController` and Gnosis Safe multisig governance.

**Architecture:** `WormcraftAdminModule` is a standalone contract deployed at a deterministic CREATE2 address on each chain. Protocols register their proxies and an optional `TimelockController` with it. The CLI routes `wormcraft deploy upgrade` through `callAcrossChains` targeting the AdminModule — `WormcraftDeployer` itself needs zero changes. Two execution flows exist: **Direct** (immediate upgrade, no delay) and **Timelock** (schedule → delay → execute). Safe multisig works as the TimelockController's `CANCELLER`, preserving its veto power throughout the delay window.

**Tech Stack:** Solidity 0.8.28, OpenZeppelin Contracts 5.x, Foundry, TypeScript 5.4, viem v2, Commander.js v12, vitest

**Feature Branch:** `feat/admin-module-governance`

---

## Why WormcraftDeployer needs no changes

`callAcrossChains` already sends arbitrary calldata to any target address. The AdminModule just becomes that target:

```
Before: WormcraftDeployer ──MSG_UPGRADE──▶ proxy.upgradeToAndCall()   ← requires WormcraftProxy inheritance
After:  WormcraftDeployer ──MSG_CALL────▶ adminModule.scheduleOrUpgrade(proxy, newImpl, salt)
                                                │
                                      ┌─────────┴──────────┐
                                 Direct mode          Timelock mode
                                      │                     │
                            proxy.upgradeToAndCall()   timelock.schedule(upgradeCalldata)
                            (UUPS or ProxyAdmin)       [2-day delay]
                                                        timelock.execute()
```

## Safe + Timelock integration

```
Your Safe (N/M signers)
  └─ CANCELLER_ROLE on TimelockController  ← can veto during delay window
  └─ owner() of WormcraftAdminModule       ← can register/cancel operations

WormcraftAdminModule
  └─ PROPOSER_ROLE + EXECUTOR_ROLE on TimelockController

Flow:
  wormcraft deploy upgrade --admin-module 0x... --salt my-op
      │
      ▼ (via Wormhole relayer, same source tx)
  WormcraftAdminModule.scheduleOrUpgrade()
      │
      ▼
  TimelockController.schedule(upgradeCalldata, delay=getMinDelay())
      │
      [delay period — Safe can cancel here]
      │
  wormcraft deploy execute --admin-module 0x... --salt my-op
      │
      ▼
  WormcraftAdminModule.executeTimelocked()
      │
      ▼
  TimelockController.execute() → proxy.upgradeToAndCall(newImpl)
```

---

## Task 1: `IWormcraftAdminModule.sol`

**Files:**
- Create: `contracts/src/interfaces/IWormcraftAdminModule.sol`

**Step 1: Write the interface**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

enum ProxyKind { UUPS, TRANSPARENT }

struct ProxyConfig {
    ProxyKind kind;
    /// @dev UUPS: the proxy address itself. TRANSPARENT: the ProxyAdmin contract address.
    address adminTarget;
    /// @dev address(0) = direct mode (no delay). Non-zero = TimelockController address.
    address timelock;
}

interface IWormcraftAdminModule {
    event ProxyRegistered(address indexed proxy, ProxyConfig config);
    event UpgradeScheduled(address indexed proxy, address indexed newImpl, bytes32 timelockOpId, bytes32 salt);
    event UpgradeExecuted(address indexed proxy, address indexed newImpl);
    event UpgradeCancelled(address indexed proxy, bytes32 timelockOpId);

    /// @notice Register a proxy with its admin config. Only owner.
    function register(address proxy, ProxyConfig calldata config) external;

    /// @notice Direct mode: upgrades immediately. Timelock mode: schedules on TimelockController.
    ///         Called by WormcraftDeployer's callAcrossChains — only owner may call.
    function scheduleOrUpgrade(address proxy, address newImpl, bytes32 salt) external;

    /// @notice Execute a previously scheduled timelock operation. Callable by anyone after delay.
    function executeTimelocked(address proxy, address newImpl, bytes32 salt) external;

    /// @notice Cancel a pending timelock operation. Only owner.
    function cancelTimelocked(address proxy, address newImpl, bytes32 salt) external;

    /// @notice Compute the OZ TimelockController operationId for a given upgrade.
    function timelockOperationId(address proxy, address newImpl, bytes32 salt) external view returns (bytes32);

    /// @notice Get the registered config for a proxy.
    function proxyConfig(address proxy) external view returns (ProxyConfig memory);
}
```

**Step 2: Build**
```bash
cd contracts && forge build --no-cache
```
Expected: no errors

**Step 3: Commit**
```bash
git add contracts/src/interfaces/IWormcraftAdminModule.sol
git commit -m "feat: add IWormcraftAdminModule interface"
```

---

## Task 2: `WormcraftAdminModule.sol`

**Files:**
- Create: `contracts/src/WormcraftAdminModule.sol`

**Step 1: Write the contract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IWormcraftAdminModule, ProxyConfig, ProxyKind} from "./interfaces/IWormcraftAdminModule.sol";

interface IUUPSProxy {
    function upgradeToAndCall(address newImpl, bytes calldata data) external payable;
}

interface ITransparentProxyAdmin {
    function upgradeAndCall(address proxy, address newImpl, bytes calldata data) external payable;
}

interface ITimelockController {
    function schedule(address target, uint256 value, bytes calldata data,
        bytes32 predecessor, bytes32 salt, uint256 delay) external;
    function execute(address target, uint256 value, bytes calldata data,
        bytes32 predecessor, bytes32 salt) external payable;
    function cancel(bytes32 id) external;
    function hashOperation(address target, uint256 value, bytes calldata data,
        bytes32 predecessor, bytes32 salt) external pure returns (bytes32);
    function getMinDelay() external view returns (uint256);
}

/// @title WormcraftAdminModule
/// @notice Standalone upgrade admin for protocols that do not inherit WormcraftProxy.
///         Compatible with OZ TimelockController and Gnosis Safe multisig governance.
///
/// UUPS + Timelock setup (Safe as canceller):
///   1. Deploy this contract (CREATE2, same address on every chain).
///   2. Grant this contract PROPOSER_ROLE + EXECUTOR_ROLE on your TimelockController.
///   3. Keep your Safe as CANCELLER_ROLE on the TimelockController.
///   4. In your UUPS _authorizeUpgrade: require(msg.sender == owner() || msg.sender == adminModule).
///   5. register(proxy, ProxyConfig(UUPS, proxyAddress, timelockAddress)).
///
/// Transparent + Timelock setup:
///   Same as above, but adminTarget = your ProxyAdmin contract address.
///   register(proxy, ProxyConfig(TRANSPARENT, proxyAdminAddress, timelockAddress)).
contract WormcraftAdminModule is IWormcraftAdminModule, Ownable {

    mapping(address => ProxyConfig) private _configs;

    constructor(address owner_) Ownable(owner_) {}

    /// @inheritdoc IWormcraftAdminModule
    function register(address proxy, ProxyConfig calldata config) external onlyOwner {
        require(proxy != address(0), "WormcraftAdminModule: zero proxy");
        require(config.adminTarget != address(0), "WormcraftAdminModule: zero adminTarget");
        _configs[proxy] = config;
        emit ProxyRegistered(proxy, config);
    }

    /// @inheritdoc IWormcraftAdminModule
    function scheduleOrUpgrade(address proxy, address newImpl, bytes32 salt) external onlyOwner {
        ProxyConfig memory cfg = _configs[proxy];
        require(cfg.adminTarget != address(0), "WormcraftAdminModule: proxy not registered");

        (address target, bytes memory upgradeCalldata) = _upgradeCall(cfg, proxy, newImpl);

        if (cfg.timelock == address(0)) {
            (bool ok, bytes memory ret) = target.call(upgradeCalldata);
            require(ok, string(abi.encodePacked("WormcraftAdminModule: upgrade failed: ", ret)));
            emit UpgradeExecuted(proxy, newImpl);
        } else {
            ITimelockController tl = ITimelockController(cfg.timelock);
            tl.schedule(target, 0, upgradeCalldata, bytes32(0), salt, tl.getMinDelay());
            bytes32 opId = tl.hashOperation(target, 0, upgradeCalldata, bytes32(0), salt);
            emit UpgradeScheduled(proxy, newImpl, opId, salt);
        }
    }

    /// @inheritdoc IWormcraftAdminModule
    function executeTimelocked(address proxy, address newImpl, bytes32 salt) external {
        ProxyConfig memory cfg = _configs[proxy];
        require(cfg.timelock != address(0), "WormcraftAdminModule: not a timelock proxy");
        (address target, bytes memory upgradeCalldata) = _upgradeCall(cfg, proxy, newImpl);
        ITimelockController(cfg.timelock).execute(target, 0, upgradeCalldata, bytes32(0), salt);
        emit UpgradeExecuted(proxy, newImpl);
    }

    /// @inheritdoc IWormcraftAdminModule
    function cancelTimelocked(address proxy, address newImpl, bytes32 salt) external onlyOwner {
        ProxyConfig memory cfg = _configs[proxy];
        require(cfg.timelock != address(0), "WormcraftAdminModule: not a timelock proxy");
        (address target, bytes memory upgradeCalldata) = _upgradeCall(cfg, proxy, newImpl);
        bytes32 opId = ITimelockController(cfg.timelock).hashOperation(
            target, 0, upgradeCalldata, bytes32(0), salt
        );
        ITimelockController(cfg.timelock).cancel(opId);
        emit UpgradeCancelled(proxy, opId);
    }

    /// @inheritdoc IWormcraftAdminModule
    function timelockOperationId(address proxy, address newImpl, bytes32 salt)
        external view returns (bytes32)
    {
        ProxyConfig memory cfg = _configs[proxy];
        require(cfg.adminTarget != address(0), "WormcraftAdminModule: proxy not registered");
        require(cfg.timelock != address(0), "WormcraftAdminModule: not a timelock proxy");
        (address target, bytes memory upgradeCalldata) = _upgradeCall(cfg, proxy, newImpl);
        return ITimelockController(cfg.timelock).hashOperation(
            target, 0, upgradeCalldata, bytes32(0), salt
        );
    }

    /// @inheritdoc IWormcraftAdminModule
    function proxyConfig(address proxy) external view returns (ProxyConfig memory) {
        return _configs[proxy];
    }

    function _upgradeCall(ProxyConfig memory cfg, address proxy, address newImpl)
        internal pure returns (address target, bytes memory callData)
    {
        if (cfg.kind == ProxyKind.UUPS) {
            target = proxy;
            callData = abi.encodeWithSignature("upgradeToAndCall(address,bytes)", newImpl, bytes(""));
        } else {
            target = cfg.adminTarget;
            callData = abi.encodeWithSignature("upgradeAndCall(address,address,bytes)", proxy, newImpl, bytes(""));
        }
    }

    receive() external payable {}
}
```

**Step 2: Build**
```bash
cd contracts && forge build
```
Expected: compiles cleanly

**Step 3: Commit**
```bash
git add contracts/src/WormcraftAdminModule.sol
git commit -m "feat: add WormcraftAdminModule standalone proxy governance contract"
```

---

## Task 3: Foundry tests for `WormcraftAdminModule`

**Files:**
- Create: `contracts/test/WormcraftAdminModule.t.sol`

**Step 1: Write the tests**

```solidity
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
    struct ScheduleCall { address target; bytes data; bytes32 salt; uint256 delay; }
    ScheduleCall public lastSchedule;
    bool public executeCalled;
    bool public cancelCalled;
    bytes32 public cancelledId;

    function getMinDelay() external pure returns (uint256) { return 2 days; }

    function hashOperation(address target, uint256, bytes calldata data, bytes32, bytes32 salt)
        external pure returns (bytes32)
    { return keccak256(abi.encode(target, data, salt)); }

    function schedule(address target, uint256, bytes calldata data, bytes32, bytes32 salt, uint256 delay)
        external { lastSchedule = ScheduleCall(target, data, salt, delay); }

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
        assertEq(timelock.lastSchedule().salt, salt);
        assertEq(timelock.lastSchedule().delay, 2 days);
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
```

**Step 2: Run — expect all green**
```bash
cd contracts && forge test --match-contract WormcraftAdminModuleTest -v
```
Expected: 10 tests pass

**Step 3: Commit**
```bash
git add contracts/test/WormcraftAdminModule.t.sol
git commit -m "test: WormcraftAdminModule unit tests (direct, timelock, transparent, guards)"
```

---

## Task 4: SDK — ABI helpers for AdminModule

**Files:**
- Modify: `packages/sdk/src/deploy/abi.ts`
- Modify: `packages/sdk/tests/deploy/abi.test.ts`

**Step 1: Write failing tests — append to `packages/sdk/tests/deploy/abi.test.ts`**

```typescript
import {
  encodeScheduleUpgradeMessage,
  encodeExecuteUpgradeMessage,
} from '../../src/deploy/abi.js';

// ... append after existing tests ...

describe('AdminModule ABI encoding', () => {
  const proxy   = `0x${'11'.repeat(20)}` as `0x${string}`;
  const newImpl = `0x${'22'.repeat(20)}` as `0x${string}`;
  const salt    = `0x${'42'.repeat(32)}` as `0x${string}`;

  it('encodeScheduleUpgradeMessage returns 0x-prefixed hex', () => {
    const result = encodeScheduleUpgradeMessage({ proxy, newImpl, salt });
    expect(result.startsWith('0x')).toBe(true);
    expect(result.length).toBeGreaterThan(10);
  });

  it('encodeExecuteUpgradeMessage returns 0x-prefixed hex', () => {
    const result = encodeExecuteUpgradeMessage({ proxy, newImpl, salt });
    expect(result.startsWith('0x')).toBe(true);
    expect(result.length).toBeGreaterThan(10);
  });

  it('schedule and execute produce different selectors', () => {
    const schedule = encodeScheduleUpgradeMessage({ proxy, newImpl, salt });
    const execute  = encodeExecuteUpgradeMessage({ proxy, newImpl, salt });
    expect(schedule.slice(0, 10)).not.toBe(execute.slice(0, 10));
  });

  it('is deterministic', () => {
    const p = { proxy, newImpl, salt };
    expect(encodeScheduleUpgradeMessage(p)).toBe(encodeScheduleUpgradeMessage(p));
  });
});
```

**Step 2: Run — expect FAIL**
```bash
cd packages/sdk && npx vitest run tests/deploy/abi.test.ts
```
Expected: FAIL — `encodeScheduleUpgradeMessage` not exported

**Step 3: Add to `packages/sdk/src/deploy/abi.ts`**

Add `encodeFunctionData` to the existing viem import, then append:

```typescript
import { encodeAbiParameters, parseAbiParameters, encodeFunctionData } from 'viem';

// ... existing code unchanged ...

export interface AdminModuleUpgradeParams {
  proxy:   `0x${string}`;
  newImpl: `0x${string}`;
  salt:    `0x${string}`;
}

const SCHEDULE_ABI = [{
  name: 'scheduleOrUpgrade',
  type: 'function',
  inputs: [
    { name: 'proxy',   type: 'address' },
    { name: 'newImpl', type: 'address' },
    { name: 'salt',    type: 'bytes32' },
  ],
}] as const;

const EXECUTE_ABI = [{
  name: 'executeTimelocked',
  type: 'function',
  inputs: [
    { name: 'proxy',   type: 'address' },
    { name: 'newImpl', type: 'address' },
    { name: 'salt',    type: 'bytes32' },
  ],
}] as const;

/** Encode calldata for WormcraftAdminModule.scheduleOrUpgrade(). */
export function encodeScheduleUpgradeMessage(p: AdminModuleUpgradeParams): `0x${string}` {
  return encodeFunctionData({
    abi: SCHEDULE_ABI,
    functionName: 'scheduleOrUpgrade',
    args: [p.proxy, p.newImpl, p.salt],
  });
}

/** Encode calldata for WormcraftAdminModule.executeTimelocked(). */
export function encodeExecuteUpgradeMessage(p: AdminModuleUpgradeParams): `0x${string}` {
  return encodeFunctionData({
    abi: EXECUTE_ABI,
    functionName: 'executeTimelocked',
    args: [p.proxy, p.newImpl, p.salt],
  });
}
```

**Step 4: Run — expect PASS**
```bash
cd packages/sdk && npx vitest run tests/deploy/abi.test.ts
```
Expected: all tests pass

**Step 5: Commit**
```bash
git add packages/sdk/src/deploy/abi.ts packages/sdk/tests/deploy/abi.test.ts
git commit -m "feat(sdk): add encodeScheduleUpgradeMessage and encodeExecuteUpgradeMessage"
```

---

## Task 5: SDK — `scheduleUpgradeViaManagedAdmin` + `executeUpgradeViaManagedAdmin`

**Files:**
- Modify: `packages/sdk/src/deploy/index.ts`
- Modify: `packages/sdk/tests/deploy/index.test.ts`

**Step 1: Write failing tests — append to `packages/sdk/tests/deploy/index.test.ts`**

```typescript
import {
  scheduleUpgradeViaManagedAdmin,
  executeUpgradeViaManagedAdmin,
} from '../../src/deploy/index.js';

// reuse makeMockChain from existing test file

const ADMIN_MODULE = `0x${'ad'.repeat(20)}` as `0x${string}`;
const PROXY        = `0x${'cc'.repeat(20)}` as `0x${string}`;
const NEW_IMPL     = `0x${'bb'.repeat(20)}` as `0x${string}`;
const UPGRADE_SALT = `0x${'ff'.repeat(32)}` as `0x${string}`;

describe('scheduleUpgradeViaManagedAdmin', () => {
  it('sends tx to WormcraftDeployer with AdminModule as callAcrossChains target', async () => {
    const eth = makeMockChain(10002n, 'sepolia');
    await scheduleUpgradeViaManagedAdmin({
      chains: [eth],
      adminModule: ADMIN_MODULE,
      proxy: PROXY,
      newImpl: NEW_IMPL,
      salt: UPGRADE_SALT,
      wormToolDeployerAddress: DEPLOYER,
    });
    expect(eth.sendTransaction).toHaveBeenCalledTimes(1);
    // The tx goes to WormcraftDeployer, not to the AdminModule directly
    const [toAddr] = (eth.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(toAddr.toLowerCase()).toBe(DEPLOYER.toLowerCase());
  });
});

describe('executeUpgradeViaManagedAdmin', () => {
  it('sends a different calldata selector than schedule', async () => {
    const eth1 = makeMockChain(10002n, 'sepolia');
    const eth2 = makeMockChain(10002n, 'sepolia');

    await scheduleUpgradeViaManagedAdmin({
      chains: [eth1], adminModule: ADMIN_MODULE, proxy: PROXY,
      newImpl: NEW_IMPL, salt: UPGRADE_SALT, wormToolDeployerAddress: DEPLOYER,
    });
    await executeUpgradeViaManagedAdmin({
      chains: [eth2], adminModule: ADMIN_MODULE, proxy: PROXY,
      newImpl: NEW_IMPL, salt: UPGRADE_SALT, wormToolDeployerAddress: DEPLOYER,
    });

    const scheduleData = (eth1.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    const executeData  = (eth2.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    // Different 4-byte selectors (calldata for scheduleOrUpgrade vs executeTimelocked)
    expect(scheduleData.slice(0, 10)).not.toBe(executeData.slice(0, 10));
  });
});
```

**Step 2: Run — expect FAIL**
```bash
cd packages/sdk && npx vitest run tests/deploy/index.test.ts
```
Expected: FAIL — functions not defined

**Step 3: Add to `packages/sdk/src/deploy/index.ts`**

Append after the existing `upgradeAcrossChains` export:

```typescript
import {
  encodeScheduleUpgradeMessage,
  encodeExecuteUpgradeMessage,
} from './abi.js';

export interface ManagedUpgradeParams {
  chains: WormcraftChain[];
  /** WormcraftAdminModule address — same on all chains via deterministic CREATE2. */
  adminModule: `0x${string}`;
  proxy:   `0x${string}`;
  newImpl: `0x${string}`;
  /** Arbitrary bytes32 salt that identifies this upgrade operation. Used by TimelockController. */
  salt:    `0x${string}`;
  wormToolDeployerAddress: string;
  value?: bigint;
}

/**
 * Schedule (or directly execute, if no timelock is configured) a proxy upgrade
 * via WormcraftAdminModule.  No inheritance required in the proxy contract.
 *
 * Routes through callAcrossChains — WormcraftDeployer itself is unchanged.
 * If the proxy is registered with a TimelockController, the upgrade is only
 * scheduled here; call executeUpgradeViaManagedAdmin after the delay.
 */
export async function scheduleUpgradeViaManagedAdmin(
  params: ManagedUpgradeParams,
): Promise<ChainDeployResult[]> {
  const { chains, adminModule, proxy, newImpl, salt, wormToolDeployerAddress, value = 0n } = params;
  const calldata = encodeScheduleUpgradeMessage({ proxy, newImpl, salt });
  return callAcrossChains({ chains, target: adminModule, calldata, wormToolDeployerAddress, value });
}

/**
 * Execute a previously scheduled timelock upgrade via WormcraftAdminModule.
 * Call this after the TimelockController's getMinDelay() has elapsed.
 */
export async function executeUpgradeViaManagedAdmin(
  params: ManagedUpgradeParams,
): Promise<ChainDeployResult[]> {
  const { chains, adminModule, proxy, newImpl, salt, wormToolDeployerAddress, value = 0n } = params;
  const calldata = encodeExecuteUpgradeMessage({ proxy, newImpl, salt });
  return callAcrossChains({ chains, target: adminModule, calldata, wormToolDeployerAddress, value });
}
```

**Step 4: Also export from `packages/sdk/src/index.ts`** if it does not re-export via `deploy/index.js` wildcard — check that `ManagedUpgradeParams`, `scheduleUpgradeViaManagedAdmin`, `executeUpgradeViaManagedAdmin` appear in the barrel export. (They will if `export * from './deploy/index.js'` is already present — verify with `grep "deploy/index" packages/sdk/src/index.ts`.)

**Step 5: Run — expect PASS**
```bash
cd packages/sdk && npx vitest run tests/deploy/index.test.ts
```

**Step 6: Commit**
```bash
git add packages/sdk/src/deploy/index.ts packages/sdk/tests/deploy/index.test.ts
git commit -m "feat(sdk): add scheduleUpgradeViaManagedAdmin and executeUpgradeViaManagedAdmin"
```

---

## Task 6: CLI — `--admin-module` on `deploy upgrade` + new `deploy execute`

**Files:**
- Modify: `packages/cli/src/commands/deploy.ts`

The existing `upgrade` command is at the `deploy.command('upgrade')` block.
The new `execute` command is appended immediately after it.

**Step 1: Modify the `upgrade` subcommand — add two new options**

Find the block starting with `deploy.command('upgrade')`.
Add `.option('--admin-module <address>', ...)` and `.option('--salt <salt>', ...)`.
Expand the opts type and branch the action:

```typescript
deploy
  .command('upgrade')
  .description('Upgrade a UUPS proxy to a new implementation across chains')
  .requiredOption('--proxy <address>', 'Proxy contract address')
  .requiredOption('--new-impl <address>', 'New implementation address')
  .requiredOption('--chains <chains>', 'Comma-separated chain names')
  .option('--admin-module <address>', 'Route through WormcraftAdminModule (no inheritance required)')
  .option('--salt <salt>', 'Upgrade salt — required when --admin-module is used')
  .option('--deployer <address>', 'Override WormcraftDeployer address')
  .option('--value <wei>', 'ETH in wei for Wormhole relayer fees')
  .action(async (opts: {
    proxy: string; newImpl: string; chains: string;
    adminModule?: string; salt?: string;
    deployer?: string; value?: string;
  }) => {
    try {
      const config = loadConfig();
      const chainNames = opts.chains.split(',').map(s => s.trim());
      const chains = chainNames.map(n => createEvmChain(n, config));
      const deployer = resolveDeployer(chainNames[0]!, opts.deployer);

      if (opts.adminModule) {
        if (!opts.salt) {
          printError('--salt is required when using --admin-module');
          process.exit(1);
        }
        const { scheduleUpgradeViaManagedAdmin } = await import('@wormcraft/sdk');
        const results = await scheduleUpgradeViaManagedAdmin({
          chains,
          adminModule: opts.adminModule as `0x${string}`,
          proxy:       opts.proxy    as `0x${string}`,
          newImpl:     opts.newImpl  as `0x${string}`,
          salt:        saltFromStr(opts.salt),
          wormToolDeployerAddress: deployer,
          ...(opts.value !== undefined && { value: BigInt(opts.value) }),
        });
        printJson(results.map((r: { chain: string; receipt: { txHash: string; success: boolean } }) => ({
          chain: r.chain, txHash: r.receipt.txHash, success: r.receipt.success,
        })));
      } else {
        // Existing path — backward compatible
        const results = await upgradeAcrossChains({
          chains,
          proxy:   opts.proxy   as `0x${string}`,
          newImpl: opts.newImpl as `0x${string}`,
          wormToolDeployerAddress: deployer,
          ...(opts.value !== undefined && { value: BigInt(opts.value) }),
        });
        printJson(results.map((r: { chain: string; receipt: { txHash: string; success: boolean } }) => ({
          chain: r.chain, txHash: r.receipt.txHash, success: r.receipt.success,
        })));
      }
    } catch (err) { printError('deploy upgrade failed', err); process.exit(1); }
  });
```

**Step 2: Add `deploy execute` subcommand** — append after the existing `upgrade` block:

```typescript
deploy
  .command('execute')
  .description('Execute a timelocked upgrade after the TimelockController delay has passed')
  .requiredOption('--proxy <address>',        'Proxy contract address')
  .requiredOption('--new-impl <address>',     'New implementation address (same as used when scheduling)')
  .requiredOption('--chains <chains>',        'Comma-separated chain names')
  .requiredOption('--admin-module <address>', 'WormcraftAdminModule address')
  .requiredOption('--salt <salt>',            'Salt used when scheduling the upgrade')
  .option('--deployer <address>', 'Override WormcraftDeployer address')
  .option('--value <wei>',        'ETH in wei for Wormhole relayer fees')
  .action(async (opts: {
    proxy: string; newImpl: string; chains: string;
    adminModule: string; salt: string; deployer?: string; value?: string;
  }) => {
    try {
      const config = loadConfig();
      const chainNames = opts.chains.split(',').map(s => s.trim());
      const chains = chainNames.map(n => createEvmChain(n, config));
      const deployer = resolveDeployer(chainNames[0]!, opts.deployer);
      const { executeUpgradeViaManagedAdmin } = await import('@wormcraft/sdk');
      const results = await executeUpgradeViaManagedAdmin({
        chains,
        adminModule: opts.adminModule as `0x${string}`,
        proxy:       opts.proxy       as `0x${string}`,
        newImpl:     opts.newImpl     as `0x${string}`,
        salt:        saltFromStr(opts.salt),
        wormToolDeployerAddress: deployer,
        ...(opts.value !== undefined && { value: BigInt(opts.value) }),
      });
      printJson(results.map((r: { chain: string; receipt: { txHash: string; success: boolean } }) => ({
        chain: r.chain, txHash: r.receipt.txHash, success: r.receipt.success,
      })));
    } catch (err) { printError('deploy execute failed', err); process.exit(1); }
  });
```

**Step 3: Build and smoke-test help output**
```bash
cd packages/cli && npm run build
node dist/main.js deploy upgrade --help  # must show --admin-module and --salt
node dist/main.js deploy execute --help  # must exist and show all required options
```
Expected: both commands show correct options, no type errors from build

**Step 4: Commit**
```bash
git add packages/cli/src/commands/deploy.ts
git commit -m "feat(cli): add --admin-module to deploy upgrade; add deploy execute for timelocked upgrades"
```

---

## Task 7: Example — `CounterNoInheritance.sol` + deploy script

**Files:**
- Create: `example/src/CounterNoInheritance.sol`
- Create: `example/script/DeployWithAdminModule.s.sol`

**Step 1: Write the contract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {UUPSUpgradeable}    from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable}      from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title CounterNoInheritance
/// @notice UUPS upgradeable counter that does NOT inherit WormcraftProxy.
///         Cross-chain upgrades are managed by a WormcraftAdminModule address
///         set at initialisation — zero other Wormcraft imports needed.
contract CounterNoInheritance is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    uint256 public count;
    address private _adminModule;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address owner_, address adminModule_) external initializer {
        __Ownable_init(owner_);
        _adminModule = adminModule_;
    }

    function increment() external { count++; }

    function version() external pure returns (string memory) { return "v1"; }

    function adminModule() external view returns (address) { return _adminModule; }

    function _authorizeUpgrade(address) internal view override {
        require(
            msg.sender == owner() || msg.sender == _adminModule,
            "CounterNoInheritance: not authorized"
        );
    }
}
```

**Step 2: Write the deploy script**

```solidity
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
```

**Step 3: Build**
```bash
cd example && forge build
```
Expected: both new files compile cleanly

**Step 4: Commit**
```bash
git add example/src/CounterNoInheritance.sol example/script/DeployWithAdminModule.s.sol
git commit -m "feat(example): add CounterNoInheritance and DeployWithAdminModule for governance path"
```

---

## Task 8: Update `example/README.md` — add Part 3

**Files:**
- Modify: `example/README.md`

**Step 1: Append Part 3 section**

```markdown
---

## Part 3 — No-inheritance path with Safe + Timelock (production governance)

Use this path when your protocol already has its own admin system, or when you need
a governance delay before upgrades take effect.

### How it works

```
Your Gnosis Safe (N/M signers)
  ├─ owner() of WormcraftAdminModule   ← registers proxies, can cancel upgrades
  └─ CANCELLER_ROLE on TimelockController  ← vetoes malicious proposals during delay

WormcraftAdminModule (standalone contract, deployed once per chain via CREATE2)
  ├─ PROPOSER_ROLE on TimelockController  ← schedules upgrades cross-chain
  └─ EXECUTOR_ROLE on TimelockController  ← executes upgrades after delay

CounterNoInheritance (your contract — zero Wormcraft imports)
  └─ _authorizeUpgrade allows: owner() OR adminModule
```

### Step 1 — Deploy WormcraftAdminModule

```bash
# Deploy with the same deployer key used for WormcraftDeployer (deterministic address)
forge create contracts/src/WormcraftAdminModule.sol:WormcraftAdminModule \
  --constructor-args $OWNER_ADDRESS \
  --rpc-url $WORMCRAFT_ETH_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
```

Run on each chain. Use the same `--constructor-args` (owner address) so the CREATE2
address is identical everywhere.

### Step 2 — Configure TimelockController roles (Safe pattern)

If your protocol uses Gnosis Safe → TimelockController:

```bash
TIMELOCK=0x<your_timelock>
ADMIN_MODULE=0x<wormcraft_admin_module>

# Grant WormcraftAdminModule proposer + executor roles
cast send $TIMELOCK "grantRole(bytes32,address)" \
  $(cast call $TIMELOCK "PROPOSER_ROLE()(bytes32)") $ADMIN_MODULE \
  --rpc-url $WORMCRAFT_ETH_SEPOLIA_RPC --private-key $DEPLOYER_PRIVATE_KEY

cast send $TIMELOCK "grantRole(bytes32,address)" \
  $(cast call $TIMELOCK "EXECUTOR_ROLE()(bytes32)") $ADMIN_MODULE \
  --rpc-url $WORMCRAFT_ETH_SEPOLIA_RPC --private-key $DEPLOYER_PRIVATE_KEY

# Your Safe already holds CANCELLER_ROLE — verify:
cast call $TIMELOCK "hasRole(bytes32,address)(bool)" \
  $(cast call $TIMELOCK "CANCELLER_ROLE()(bytes32)") $SAFE_ADDRESS \
  --rpc-url $WORMCRAFT_ETH_SEPOLIA_RPC
```

Repeat on every chain.

### Step 3 — Deploy CounterNoInheritance proxy (each chain)

```bash
forge script script/DeployWithAdminModule.s.sol \
  --rpc-url $WORMCRAFT_ETH_SEPOLIA_RPC \
  --broadcast \
  --sig "run(address)" $ADMIN_MODULE
```

### Step 4 — Register the proxy with WormcraftAdminModule

```bash
# ProxyKind enum: 0 = UUPS, 1 = TRANSPARENT
# For UUPS + Timelock:
cast send $ADMIN_MODULE \
  "register(address,(uint8,address,address))" \
  $PROXY "(0,$PROXY,$TIMELOCK)" \
  --rpc-url $WORMCRAFT_ETH_SEPOLIA_RPC --private-key $DEPLOYER_PRIVATE_KEY
```

Repeat on every chain.

### Step 5 — Schedule cross-chain upgrade (triggers timelock on each chain)

```bash
UPGRADE_SALT="counter-v2-upgrade-2026-05-20"

wormcraft deploy upgrade \
  --proxy        $PROXY \
  --new-impl     $NEW_IMPL \
  --chains       sepolia,base-sepolia,arbitrum-sepolia \
  --admin-module $ADMIN_MODULE \
  --salt         "$UPGRADE_SALT" \
  --deployer     $WORMCRAFT_DEPLOYER \
  --value        2000000000000000
```

This schedules the upgrade on the `TimelockController` on every target chain in one
source transaction. Your Safe can cancel during the delay window if needed.

### Step 6 — Execute after the timelock delay

```bash
# After TimelockController.getMinDelay() seconds have elapsed:

wormcraft deploy execute \
  --proxy        $PROXY \
  --new-impl     $NEW_IMPL \
  --chains       sepolia,base-sepolia,arbitrum-sepolia \
  --admin-module $ADMIN_MODULE \
  --salt         "$UPGRADE_SALT" \
  --deployer     $WORMCRAFT_DEPLOYER \
  --value        2000000000000000
```

### Compatibility matrix

| Proxy standard | Admin setup | Wormcraft imports in contract |
|----------------|-------------|-------------------------------|
| UUPS + WormcraftProxy (Part 2) | WormcraftDeployer hardcoded | Yes — inherit WormcraftProxy |
| UUPS + AdminModule (Part 3) | WormcraftAdminModule address in storage | One address check in `_authorizeUpgrade` |
| Transparent + AdminModule | WormcraftAdminModule is the ProxyAdmin | None |
| Any proxy + Timelock + Safe | As above + TimelockController roles | None |
```

**Step 2: Commit**
```bash
git add example/README.md
git commit -m "docs(example): add Part 3 — no-inheritance path with Safe + TimelockController governance"
```

---

## Full test run before PR

```bash
# Solidity tests
cd contracts && forge test -v

# SDK tests
cd packages/sdk && npx vitest run

# CLI build
cd packages/cli && npm run build

# SDK type check
cd packages/sdk && npx tsc --noEmit
```

All must pass green.
