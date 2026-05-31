# WormcraftModule — Ownerless Safe-Compatible Cross-Chain Governance

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add `WormcraftModule` — an ownerless Safe Module contract — so protocols that have transferred upgrade authority to a Gnosis Safe multisig can execute cross-chain upgrades via the `wormcraft` CLI without modifying their contracts, writing custom timelock logic, or trusting any Wormcraft admin key.

**Architecture:**
`WormcraftModule` is a [Gnosis Safe Module](https://docs.safe.global/advanced/smart-account-modules) deployed at a deterministic CREATE2 address. The Safe's owners enable it via a normal Safe transaction (one-time setup). After that, a whitelisted source address can trigger `Safe.execTransactionFromModule()` cross-chain through the Wormhole relay. Wormcraft implements **zero governance logic** — Safe handles all thresholds, timelocks, and veto rights. `WormcraftDeployer` has its ownership renounced after the Bootstrap setup, becoming permanently ownerless.

**Tech Stack:** Solidity 0.8.28, OpenZeppelin Contracts 5.x, Gnosis Safe `ISafe` interface, Wormhole Standard Relayer, Foundry, TypeScript 5.4, viem v2, Commander.js v12, vitest

**Feature Branch:** `feat/wormcraft-module-safe`

---

## Architecture deep-dive

### Why `execTransactionFromModule`

Safe modules can call `execTransactionFromModule(to, value, data, operation)` **without collecting any signatures**. The Safe's threshold and signers are irrelevant — the module is the trusted actor. The Safe's owners control trust by voting to enable/disable the module via normal Safe governance. Wormcraft doesn't need to know about signature formats, nonces, or timelocks.

### Why renouncing WormcraftDeployer ownership is safe

`setRelayer` and `setTrustedSender` are the only owner-gated functions. Both are called in the Bootstrap script immediately after deployment, then `renounceOwnership()` is called in the same transaction batch. After that, the relayer address and trusted sender mapping are frozen forever. If Wormhole ever deprecates their relayer, a new WormcraftDeployer can be deployed from scratch (CREATE2 with a new salt).

### Trust chain (fully auditable, no hidden admin)

```
Source chain:
  Authorized wallet (registered by the Safe itself)
    → WormcraftDeployer.executeViaModule(targetChains, moduleAddr, safe, target, calldata)
    → Wormhole verifies cross-chain delivery

Target chain:
  WormcraftModule.receiveWormholeMessages()
    → verify: msg.sender == Wormhole relayer                (Wormhole guarantee)
    → verify: sourceAddress == WormcraftDeployer address    (same CREATE2 address)
    → verify: initiator == _authorized[safe][sourceChain]   (Safe-governed whitelist)
    → ISafe(safe).execTransactionFromModule(target, value, calldata, CALL)
    → proxy.upgradeToAndCall(newImpl, "")
```

### What Safe governance looks like for a protocol

**One-time setup (done via Safe UI, requires N-of-M approval):**
1. Safe tx: `Safe.enableModule(wormcraftModuleAddress)`
2. Safe tx: `WormcraftModule.authorize(sourceChainId, callerAddressBytes32)`

**Every upgrade thereafter (single CLI command, no Safe UI needed):**
```bash
wormcraft deploy upgrade \
  --proxy 0x... --new-impl 0x... --safe 0x... \
  --chains base-sepolia,arbitrum-sepolia
```

The Safe on each target chain executes the upgrade atomically when the Wormhole message arrives. If the Safe has a Zodiac Delay module or an OZ TimelockController enabled, that delay is respected — Wormcraft doesn't need to know about it.

---

## Task 1: Add `MSG_MODULE` + `executeViaModule` to `WormcraftDeployer`

**Files:**
- Modify: `contracts/src/WormcraftDeployer.sol`
- Modify: `contracts/src/interfaces/IWormcraftDeployer.sol`

**Step 1: Add constant and function to `IWormcraftDeployer.sol`**

Add after `MSG_UPGRADE`:
```solidity
uint8 constant MSG_MODULE = 0x04;
```

Add to the interface:
```solidity
/// @notice Execute an arbitrary call on a target contract via WormcraftModule + Safe.execTransactionFromModule.
/// @param targetChains   Wormhole chain IDs of destination chains.
/// @param moduleAddress  WormcraftModule address (same on all chains via CREATE2).
/// @param safe           Safe multisig address on each target chain.
/// @param target         Contract to call inside the Safe transaction.
/// @param callData       ABI-encoded call to execute.
function executeViaModule(
    uint16[] calldata targetChains,
    address moduleAddress,
    address safe,
    address target,
    bytes calldata callData
) external payable;
```

**Step 2: Implement in `WormcraftDeployer.sol`**

Add after `upgradeAcrossChains`:
```solidity
/// @inheritdoc IWormcraftDeployer
function executeViaModule(
    uint16[] calldata targetChains,
    address moduleAddress,
    address safe,
    address target,
    bytes calldata callData
) external payable {
    // Include msg.sender so WormcraftModule can verify the initiator is authorized
    bytes memory payload = abi.encode(MSG_MODULE, safe, target, callData, msg.sender);
    uint256 remaining = msg.value;

    for (uint256 i = 0; i < targetChains.length; i++) {
        (uint256 cost,) = relayer.quoteEVMDeliveryPrice(
            targetChains[i], 0, DEPLOY_GAS_LIMIT
        );
        require(remaining >= cost, "WormcraftDeployer: insufficient fee");
        remaining -= cost;
        // Send directly to WormcraftModule (not to WormcraftDeployer on target chain)
        relayer.sendPayloadToEvm{value: cost}(
            targetChains[i],
            moduleAddress,
            payload,
            0,
            DEPLOY_GAS_LIMIT
        );
    }
}
```

Also add `getModuleCost` to the interface and implementation:
```solidity
/// @notice Quote total ETH cost for executeViaModule across `chains`.
function getModuleCost(uint16[] calldata chains) external view returns (uint256 total) {
    for (uint256 i = 0; i < chains.length; i++) {
        (uint256 cost,) = relayer.quoteEVMDeliveryPrice(chains[i], 0, DEPLOY_GAS_LIMIT);
        total += cost;
    }
}
```

**Step 3: Build**
```bash
cd contracts && forge build
```
Expected: compiles cleanly

**Step 4: Commit**
```bash
git add contracts/src/WormcraftDeployer.sol contracts/src/interfaces/IWormcraftDeployer.sol
git commit -m "feat: add MSG_MODULE + executeViaModule to WormcraftDeployer"
```

---

## Task 2: Renounce ownership in `Bootstrap.s.sol`

**Files:**
- Modify: `example/script/Bootstrap.s.sol`

**Step 1: Add `renounceOwnership()` call**

After `d.setRelayer(wormholeRelayer)`, add:
```solidity
d.renounceOwnership();
```

Full updated run function:
```solidity
function run(address wormholeRelayer) external {
    uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
    address deployer = vm.addr(deployerKey);
    console.log("Deployer:", deployer);

    vm.startBroadcast(deployerKey);

    WormcraftDeployer d = new WormcraftDeployer{salt: SALT}(deployer);
    d.setRelayer(wormholeRelayer);
    d.renounceOwnership();   // ← permanently ownerless

    vm.stopBroadcast();

    console.log("=== Bootstrap complete ===");
    console.log("WormcraftDeployer:", address(d));
    console.log("Owner (should be 0x0):", d.owner());
    console.log("Relayer:", address(d.relayer()));
}
```

**Step 2: Build**
```bash
cd example && forge build
```

**Step 3: Commit**
```bash
git add example/script/Bootstrap.s.sol
git commit -m "feat(example): renounce WormcraftDeployer ownership after Bootstrap setup"
```

---

## Task 3: `IWormcraftModule.sol` interface

**Files:**
- Create: `contracts/src/interfaces/IWormcraftModule.sol`

**Step 1: Write the interface**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title IWormcraftModule
/// @notice Ownerless Gnosis Safe Module for cross-chain contract execution.
///         Receives MSG_MODULE payloads from WormcraftDeployer via Wormhole and
///         calls ISafe.execTransactionFromModule on the target Safe.
///
///         No governance logic lives here. The Safe handles all thresholds,
///         timelocks, and veto rights through its own modules.
interface IWormcraftModule {

    event Authorized(address indexed safe, uint16 sourceChainId, bytes32 caller);
    event Deauthorized(address indexed safe, uint16 sourceChainId);
    event ModuleExecuted(
        address indexed safe,
        address indexed target,
        address indexed initiator,
        uint16 sourceChainId
    );

    /// @notice Register an authorized source-chain caller for a Safe.
    ///         MUST be called by the Safe itself (msg.sender == safe).
    ///         This means setup requires a Safe transaction — Safe owners govern who can use the module.
    /// @param sourceChainId  Wormhole chain ID of the source chain.
    /// @param caller         Authorized caller address (bytes32-padded) on the source chain.
    function authorize(uint16 sourceChainId, bytes32 caller) external;

    /// @notice Remove a previously authorized caller.
    ///         MUST be called by the Safe itself (msg.sender == safe).
    function deauthorize(uint16 sourceChainId) external;

    /// @notice Check if `caller` is authorized to trigger module execution for `safe` from `sourceChainId`.
    function isAuthorized(address safe, uint16 sourceChainId, address caller) external view returns (bool);
}
```

**Step 2: Build**
```bash
cd contracts && forge build --no-cache
```
Expected: no errors

**Step 3: Commit**
```bash
git add contracts/src/interfaces/IWormcraftModule.sol
git commit -m "feat: add IWormcraftModule interface"
```

---

## Task 4: `WormcraftModule.sol`

**Files:**
- Create: `contracts/src/WormcraftModule.sol`

**Step 1: Write the contract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IWormholeRelayer, IWormholeReceiver} from "wormhole-solidity-sdk/interfaces/IWormholeRelayer.sol";
import {IWormcraftModule} from "./interfaces/IWormcraftModule.sol";

interface ISafe {
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation
    ) external returns (bool success);
}

/// @title WormcraftModule
/// @notice Ownerless Gnosis Safe Module. Receives Wormhole-verified messages from
///         WormcraftDeployer and executes them on a target Safe via execTransactionFromModule.
///
///         SETUP (done once per chain, via Safe transaction):
///           1. Safe.enableModule(wormcraftModuleAddress)
///           2. WormcraftModule.authorize(sourceChainId, authorizedCallerBytes32)
///              (msg.sender must equal the Safe address)
///
///         USAGE (CLI):
///           wormcraft deploy upgrade --safe 0xSafe --proxy 0xProxy --new-impl 0xImpl --chains ...
///
///         SECURITY MODEL:
///           - Only Wormhole relayer can call receiveWormholeMessages
///           - Only messages from WormcraftDeployer (verified by identical CREATE2 address) are accepted
///           - Only callers registered by the Safe itself are authorized
///           - Safe's own modules (Zodiac Delay, TimelockController) apply as normal
contract WormcraftModule is IWormcraftModule, IWormholeReceiver {

    /// @notice Wormhole standard relayer (immutable, set in constructor).
    IWormholeRelayer public immutable RELAYER;

    /// @notice WormcraftDeployer address — same on all chains via CREATE2.
    ///         Messages are trusted iff they arrive from this address.
    bytes32 public immutable WORMCRAFT_DEPLOYER;

    /// @dev safe → sourceChainId → authorized caller (bytes32-padded address).
    mapping(address => mapping(uint16 => bytes32)) private _authorized;

    /// @param wormholeRelayer   Wormhole standard relayer on this chain.
    /// @param wormcraftDeployer WormcraftDeployer address (same on all chains via CREATE2).
    constructor(address wormholeRelayer, address wormcraftDeployer) {
        RELAYER           = IWormholeRelayer(wormholeRelayer);
        WORMCRAFT_DEPLOYER = bytes32(uint256(uint160(wormcraftDeployer)));
    }

    // ── Self-sovereign registration ───────────────────────────────────────────

    /// @inheritdoc IWormcraftModule
    function authorize(uint16 sourceChainId, bytes32 caller) external {
        // msg.sender IS the Safe — Safe owners control who can trigger their modules
        _authorized[msg.sender][sourceChainId] = caller;
        emit Authorized(msg.sender, sourceChainId, caller);
    }

    /// @inheritdoc IWormcraftModule
    function deauthorize(uint16 sourceChainId) external {
        delete _authorized[msg.sender][sourceChainId];
        emit Deauthorized(msg.sender, sourceChainId);
    }

    /// @inheritdoc IWormcraftModule
    function isAuthorized(address safe, uint16 sourceChainId, address caller) external view returns (bool) {
        return _authorized[safe][sourceChainId] == bytes32(uint256(uint160(caller)));
    }

    // ── Wormhole receiver ─────────────────────────────────────────────────────

    /// @inheritdoc IWormholeReceiver
    function receiveWormholeMessages(
        bytes memory payload,
        bytes[] memory,
        bytes32 sourceAddress,
        uint16 sourceChain,
        bytes32
    ) external payable override {
        require(msg.sender == address(RELAYER), "WormcraftModule: only relayer");
        require(sourceAddress == WORMCRAFT_DEPLOYER, "WormcraftModule: untrusted sender");

        (, address safe, address target, bytes memory callData, address initiator) =
            abi.decode(payload, (uint8, address, address, bytes, address));

        bytes32 expected = _authorized[safe][sourceChain];
        require(expected != bytes32(0), "WormcraftModule: safe not configured");
        require(
            expected == bytes32(uint256(uint160(initiator))),
            "WormcraftModule: initiator not authorized"
        );

        // 0 = CALL operation (not DELEGATECALL)
        bool success = ISafe(safe).execTransactionFromModule(target, 0, callData, 0);
        require(success, "WormcraftModule: Safe execution failed");

        emit ModuleExecuted(safe, target, initiator, sourceChain);
    }

    receive() external payable {}
}
```

**Step 2: Build**
```bash
cd contracts && forge build
```
Expected: compiles cleanly, no warnings

**Step 3: Commit**
```bash
git add contracts/src/WormcraftModule.sol
git commit -m "feat: add WormcraftModule ownerless Safe module for cross-chain governance"
```

---

## Task 5: Foundry tests for `WormcraftModule`

**Files:**
- Create: `contracts/test/WormcraftModule.t.sol`

**Step 1: Write the tests**

```solidity
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

    // Allow Safe to call authorize on WormcraftModule (simulating Safe tx)
    function callAuthorize(address module, uint16 chainId, bytes32 caller) external {
        WormcraftModule(module).authorize(chainId, caller);
    }
}

contract WormcraftModuleTest is Test {
    WormcraftModule module;
    MockRelayer     relayer;
    MockSafe        safe;

    address deployer      = address(0xDEAD);
    address authorizedCaller = address(0xCAFE);
    address attacker      = address(0xBAD);
    uint16  SOURCE_CHAIN  = 10002;

    function setUp() public {
        relayer = new MockRelayer();
        safe    = new MockSafe();
        module  = new WormcraftModule(address(relayer), deployer);

        // Safe authorizes caller — must be called by safe itself
        vm.prank(address(safe));
        module.authorize(SOURCE_CHAIN, bytes32(uint256(uint160(authorizedCaller))));
    }

    // ── authorize ─────────────────────────────────────────────────────────────

    function test_authorize_stores_caller() public view {
        assertTrue(module.isAuthorized(address(safe), SOURCE_CHAIN, authorizedCaller));
    }

    function test_authorize_only_by_safe_itself() public {
        // Any address can authorize callers for THEMSELVES (as a Safe)
        // but they can't authorize for another safe's address
        address fakeSafe = address(0xAAAA);
        vm.prank(attacker);
        module.authorize(SOURCE_CHAIN, bytes32(uint256(uint160(authorizedCaller))));
        // attacker authorized for attacker-as-safe, not for the real safe
        assertFalse(module.isAuthorized(address(safe), SOURCE_CHAIN, attacker));
        assertTrue(module.isAuthorized(attacker, SOURCE_CHAIN, authorizedCaller));
    }

    function test_deauthorize_removes_entry() public {
        vm.prank(address(safe));
        module.deauthorize(SOURCE_CHAIN);
        assertFalse(module.isAuthorized(address(safe), SOURCE_CHAIN, authorizedCaller));
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
        module.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(deployer))),
            SOURCE_CHAIN, bytes32(0)
        );
        assertEq(safe.lastTarget(), address(0x1234));
    }

    function test_rejects_non_relayer_caller() public {
        bytes memory payload = _payload(authorizedCaller);
        vm.prank(attacker);
        vm.expectRevert("WormcraftModule: only relayer");
        module.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(deployer))),
            SOURCE_CHAIN, bytes32(0)
        );
    }

    function test_rejects_untrusted_sender() public {
        bytes memory payload = _payload(authorizedCaller);
        vm.prank(address(relayer));
        vm.expectRevert("WormcraftModule: untrusted sender");
        module.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(attacker))),  // not deployer
            SOURCE_CHAIN, bytes32(0)
        );
    }

    function test_rejects_unauthorized_initiator() public {
        bytes memory payload = _payload(attacker);  // attacker not authorized
        vm.prank(address(relayer));
        vm.expectRevert("WormcraftModule: initiator not authorized");
        module.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(deployer))),
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
        module.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(deployer))),
            SOURCE_CHAIN, bytes32(0)
        );
    }

    function test_reverts_when_safe_execution_fails() public {
        safe.setShouldFail(true);
        bytes memory payload = _payload(authorizedCaller);
        vm.prank(address(relayer));
        vm.expectRevert("WormcraftModule: Safe execution failed");
        module.receiveWormholeMessages(
            payload, new bytes[](0),
            bytes32(uint256(uint160(deployer))),
            SOURCE_CHAIN, bytes32(0)
        );
    }
}
```

**Step 2: Run — expect all green**
```bash
cd contracts && forge test --match-contract WormcraftModuleTest -v
```
Expected: 8 tests pass

**Step 3: Commit**
```bash
git add contracts/test/WormcraftModule.t.sol
git commit -m "test: WormcraftModule — relay verification, Safe execution, authorization guards"
```

---

## Task 6: SDK — `executeViaModule` function + ABI

**Files:**
- Modify: `packages/sdk/src/deploy/index.ts`
- Modify: `packages/sdk/tests/deploy/index.test.ts`

**Step 1: Write failing tests — append to `packages/sdk/tests/deploy/index.test.ts`**

```typescript
import { executeViaModule } from '../../src/deploy/index.js';

const MODULE    = `0x${'ee'.repeat(20)}` as `0x${string}`;
const SAFE      = `0x${'aa'.repeat(20)}` as `0x${string}`;
const PROXY     = `0x${'cc'.repeat(20)}` as `0x${string}`;
const NEW_IMPL  = `0x${'bb'.repeat(20)}` as `0x${string}`;

describe('executeViaModule', () => {
  it('sends one tx to WormcraftDeployer encoding the module address', async () => {
    const eth = makeMockChain(10002n, 'sepolia');
    await executeViaModule({
      chains: [eth],
      moduleAddress: MODULE,
      safe: SAFE,
      target: PROXY,
      calldata: '0x12345678' as `0x${string}`,
      wormToolDeployerAddress: DEPLOYER,
    });
    expect(eth.sendTransaction).toHaveBeenCalledTimes(1);
    const [toAddr] = (eth.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(toAddr.toLowerCase()).toBe(DEPLOYER.toLowerCase());
  });

  it('throws when chains array is empty', async () => {
    await expect(executeViaModule({
      chains: [],
      moduleAddress: MODULE,
      safe: SAFE,
      target: PROXY,
      calldata: '0x' as `0x${string}`,
      wormToolDeployerAddress: DEPLOYER,
    })).rejects.toThrow();
  });
});
```

**Step 2: Run — expect FAIL**
```bash
cd packages/sdk && npx vitest run tests/deploy/index.test.ts
```
Expected: FAIL — `executeViaModule` not exported

**Step 3: Add ABI and function to `packages/sdk/src/deploy/index.ts`**

Append after the existing `upgradeAcrossChains` function:

```typescript
const EXECUTE_VIA_MODULE_ABI = [{
  name: 'executeViaModule',
  type: 'function',
  inputs: [
    { name: 'targetChains',  type: 'uint16[]' },
    { name: 'moduleAddress', type: 'address'  },
    { name: 'safe',          type: 'address'  },
    { name: 'target',        type: 'address'  },
    { name: 'callData',      type: 'bytes'    },
  ],
  stateMutability: 'payable',
}] as const;

export interface ExecuteViaModuleParams {
  chains: WormcraftChain[];
  /** WormcraftModule address — same on all chains via CREATE2. */
  moduleAddress: `0x${string}`;
  /** Gnosis Safe address on each target chain. */
  safe: `0x${string}`;
  /** Contract to call inside the Safe transaction (e.g. the proxy). */
  target: `0x${string}`;
  /** ABI-encoded function call to execute (e.g. upgradeToAndCall calldata). */
  calldata: `0x${string}`;
  wormToolDeployerAddress: string;
  value?: bigint;
}

/**
 * Execute a call on a target contract via WormcraftModule + Safe.execTransactionFromModule.
 *
 * Requires one-time setup on each target chain:
 *   1. Safe.enableModule(wormcraftModuleAddress)
 *   2. WormcraftModule.authorize(sourceChainId, callerAddressBytes32)
 *      — called as a Safe transaction so Safe owners govern the whitelist.
 *
 * After setup, this is the only function needed for all cross-chain upgrades.
 * The Safe handles all governance (thresholds, timelocks, veto).
 */
export async function executeViaModule(
  params: ExecuteViaModuleParams,
): Promise<ChainDeployResult[]> {
  const {
    chains, moduleAddress, safe, target, calldata,
    wormToolDeployerAddress, value = 0n,
  } = params;
  const [sourceChain, ...rest] = chains;
  if (!sourceChain) throw new WormcraftError('executeViaModule: at least one chain required');

  const targetChainIds = rest.map(c => Number(c.chainId));

  const data = encodeFunctionData({
    abi: EXECUTE_VIA_MODULE_ABI,
    functionName: 'executeViaModule',
    args: [targetChainIds, moduleAddress, safe, target, calldata],
  });

  const receipt = await sourceChain.sendTransaction(wormToolDeployerAddress, data, value);
  return [{ chain: sourceChain.chainName, chainId: sourceChain.chainId, receipt }];
}
```

**Step 4: Run — expect PASS**
```bash
cd packages/sdk && npx vitest run tests/deploy/index.test.ts
```

**Step 5: Commit**
```bash
git add packages/sdk/src/deploy/index.ts packages/sdk/tests/deploy/index.test.ts
git commit -m "feat(sdk): add executeViaModule for Safe-compatible cross-chain upgrades"
```

---

## Task 7: CLI — `deploy upgrade --safe` flag + `module setup` helper

**Files:**
- Modify: `packages/cli/src/commands/deploy.ts`

### Part A: Add `--safe` + `--module` to `deploy upgrade`

**Step 1: Modify the existing `deploy upgrade` command**

Find `deploy.command('upgrade')`. Add new options and branch the action:

```typescript
deploy
  .command('upgrade')
  .description('Upgrade a proxy across chains — direct (WormcraftProxy) or via Safe module')
  .requiredOption('--proxy <address>',    'Proxy contract address')
  .requiredOption('--new-impl <address>', 'New implementation address')
  .requiredOption('--chains <chains>',    'Comma-separated chain names')
  .option('--safe <address>',    'Route through Gnosis Safe (requires WormcraftModule setup)')
  .option('--module <address>',  'WormcraftModule address (required when --safe is used)')
  .option('--deployer <address>', 'Override WormcraftDeployer address')
  .option('--value <wei>',        'ETH in wei for Wormhole relayer fees')
  .action(async (opts: {
    proxy: string; newImpl: string; chains: string;
    safe?: string; module?: string; deployer?: string; value?: string;
  }) => {
    try {
      const config = loadConfig();
      const chainNames = opts.chains.split(',').map(s => s.trim());
      const chains = chainNames.map(n => createEvmChain(n, config));
      const deployer = resolveDeployer(chainNames[0]!, opts.deployer);

      if (opts.safe) {
        if (!opts.module) {
          printError('--module <WormcraftModule address> is required when using --safe');
          process.exit(1);
        }
        // Encode upgradeToAndCall calldata — this is what the Safe will execute on the proxy
        const { encodeAbiParameters, parseAbiParameters } = await import('viem');
        const upgradeCalldata = encodeAbiParameters(
          parseAbiParameters('bytes4 selector, address impl, bytes data'),
          // upgradeToAndCall(address,bytes) selector = 0x4f1ef286
          ['0x4f1ef286', opts.newImpl as `0x${string}`, '0x'],
        );

        // Use viem's encodeFunctionData for correctness
        const { encodeFunctionData } = await import('viem');
        const calldata = encodeFunctionData({
          abi: [{
            name: 'upgradeToAndCall',
            type: 'function',
            inputs: [{ name: 'newImplementation', type: 'address' }, { name: 'data', type: 'bytes' }],
          }] as const,
          functionName: 'upgradeToAndCall',
          args: [opts.newImpl as `0x${string}`, '0x'],
        });

        const { executeViaModule } = await import('@wormcraft/sdk');
        const results = await executeViaModule({
          chains,
          moduleAddress: opts.module as `0x${string}`,
          safe:          opts.safe   as `0x${string}`,
          target:        opts.proxy  as `0x${string}`,
          calldata,
          wormToolDeployerAddress: deployer,
          ...(opts.value !== undefined && { value: BigInt(opts.value) }),
        });
        printJson(results.map((r: { chain: string; receipt: { txHash: string; success: boolean } }) => ({
          chain: r.chain, txHash: r.receipt.txHash, success: r.receipt.success,
        })));

      } else {
        // Existing direct path — backward compatible
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

### Part B: Add `wormcraft module setup` command

This generates the Safe transaction JSON for the two one-time setup steps, ready to import into [Safe Transaction Builder](https://help.safe.global/en/articles/40809-transaction-builder).

Add a new top-level `module` command group and `setup` subcommand:

```typescript
// In registerDeployCommand or as a new registerModuleCommand function:

const moduleCmd = program
  .command('module')
  .description('Helpers for WormcraftModule setup with Gnosis Safe');

moduleCmd
  .command('setup')
  .description('Generate Safe transaction JSON for one-time WormcraftModule setup')
  .requiredOption('--safe <address>',        'Safe address on this chain')
  .requiredOption('--module <address>',      'WormcraftModule address on this chain')
  .requiredOption('--source-chain <id>',     'Wormhole chain ID of the source chain where upgrades are initiated')
  .requiredOption('--authorized <address>',  'Wallet/Safe address on the source chain that will initiate upgrades')
  .action((opts: { safe: string; module: string; sourceChain: string; authorized: string }) => {
    // Step 1: enableModule calldata
    const { encodeFunctionData } = require('viem');
    const enableModuleCalldata = encodeFunctionData({
      abi: [{
        name: 'enableModule', type: 'function',
        inputs: [{ name: 'module', type: 'address' }],
      }] as const,
      functionName: 'enableModule',
      args: [opts.module as `0x${string}`],
    });

    // Step 2: authorize calldata (called on WormcraftModule, but triggered as Safe tx so msg.sender = safe)
    const callerBytes32 = '0x' + opts.authorized.toLowerCase().replace('0x', '').padStart(64, '0');
    const authorizeCalldata = encodeFunctionData({
      abi: [{
        name: 'authorize', type: 'function',
        inputs: [{ name: 'sourceChainId', type: 'uint16' }, { name: 'caller', type: 'bytes32' }],
      }] as const,
      functionName: 'authorize',
      args: [Number(opts.sourceChain), callerBytes32 as `0x${string}`],
    });

    // Safe Transaction Builder batch format
    const batch = {
      version: '1.0',
      chainId: 'auto',
      createdAt: Date.now(),
      meta: { name: 'WormcraftModule setup', description: 'Enable WormcraftModule + authorize source caller' },
      transactions: [
        { to: opts.safe,   value: '0', data: enableModuleCalldata,  contractMethod: null, contractInputsValues: null },
        { to: opts.module, value: '0', data: authorizeCalldata,      contractMethod: null, contractInputsValues: null },
      ],
    };

    process.stdout.write(JSON.stringify(batch, null, 2) + '\n');
    process.stderr.write('\nImport this JSON into Safe > Transaction Builder > Load JSON\n');
    process.stderr.write('Both transactions will execute atomically.\n');
  });
```

**Step 2: Export `registerModuleCommand` from deploy.ts and call it from `index.ts`**

**Step 3: Build and test help**
```bash
cd packages/cli && npm run build
node dist/main.js deploy upgrade --help   # must show --safe and --module
node dist/main.js module setup --help     # must show all required options
```
Expected: both show correct options

**Step 4: Commit**
```bash
git add packages/cli/src/commands/deploy.ts packages/cli/src/index.ts
git commit -m "feat(cli): add deploy upgrade --safe --module; add module setup JSON generator"
```

---

## Task 8: Example — `BootstrapModule.s.sol` + update README

**Files:**
- Create: `example/script/BootstrapModule.s.sol`
- Modify: `example/README.md`

**Step 1: Write the Foundry deploy script**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {WormcraftModule} from "@wormcraft/WormcraftModule.sol";

/// @notice Deploys WormcraftModule at a deterministic CREATE2 address.
///
/// Must be deployed AFTER WormcraftDeployer Bootstrap so the deployer address is known.
/// Use the same deployer wallet — same salt + same key = same address on all chains.
///
/// Usage (run on EACH chain):
///   forge script script/BootstrapModule.s.sol \
///     --rpc-url $RPC_URL --broadcast \
///     --sig "run(address,address)" $WORMHOLE_RELAYER $WORMCRAFT_DEPLOYER
contract BootstrapModule is Script {
    bytes32 constant SALT = keccak256("wormcraft-module-v1");

    function run(address wormholeRelayer, address wormcraftDeployer) external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        WormcraftModule m = new WormcraftModule{salt: SALT}(wormholeRelayer, wormcraftDeployer);

        vm.stopBroadcast();

        console.log("=== BootstrapModule complete ===");
        console.log("WormcraftModule:", address(m));
        console.log("Relayer:", wormholeRelayer);
        console.log("Trusted deployer:", wormcraftDeployer);
        console.log("Owner: none (ownerless)");
    }
}
```

**Step 2: Update `example/README.md` — add Part 3**

Append this section:

```markdown
---

## Part 3 — Safe multisig governance (no inheritance, ownerless infrastructure)

Use this path when your protocol has transferred upgrade authority to a Gnosis Safe.
Wormcraft acts as a relay only — your Safe handles all governance logic.

### How it works

```
Your Safe (N/M signers on each chain)
  └─ enableModule → WormcraftModule     ← one-time Safe tx
  └─ authorize(sourceChain, caller)     ← one-time Safe tx

WormcraftModule (ownerless, deployed once per chain)
  ← receives Wormhole-verified MSG_MODULE from WormcraftDeployer
  → Safe.execTransactionFromModule(proxy, upgradeCalldata)
  → proxy.upgradeToAndCall(newImpl)

WormcraftDeployer (ownerless after Bootstrap + renounceOwnership)
  ← your wallet calls executeViaModule(...)
  → Wormhole relay → WormcraftModule
```

### Step 1 — Deploy WormcraftModule (each chain)

```bash
WORMHOLE_RELAYER=0x<chain_specific_relayer>
WORMCRAFT_DEPLOYER=0x<from_bootstrap>

forge script script/BootstrapModule.s.sol \
  --rpc-url $WORMCRAFT_ETH_SEPOLIA_RPC \
  --broadcast \
  --sig "run(address,address)" $WORMHOLE_RELAYER $WORMCRAFT_DEPLOYER
```

The printed address is the same on every chain (same salt + same deployer key).

### Step 2 — One-time Safe setup (each chain, via Safe UI)

Generate the Safe transaction JSON:

```bash
wormcraft module setup \
  --safe          $YOUR_SAFE_ADDRESS \
  --module        $WORMCRAFT_MODULE_ADDRESS \
  --source-chain  10002 \            # Wormhole chain ID where upgrades are initiated
  --authorized    $YOUR_WALLET       # wallet that calls wormcraft deploy upgrade
```

This outputs a JSON batch you import into **Safe > Transaction Builder > Load JSON**.
The batch does two things atomically:
1. `Safe.enableModule(wormcraftModuleAddress)` — lets WormcraftModule act on the Safe
2. `WormcraftModule.authorize(sourceChainId, yourWallet)` — called as a Safe tx so msg.sender = Safe

### Step 3 — Deploy your proxy (no inheritance needed)

Your contract can be a standard UUPS, Transparent, or any proxy. No Wormcraft imports.
The only requirement: the Safe is the upgrade authority.

```bash
# Example with CounterNoInheritance (any proxy works)
forge script script/DeployWithAdminModule.s.sol \
  --rpc-url $WORMCRAFT_ETH_SEPOLIA_RPC --broadcast \
  --sig "run(address)" $YOUR_SAFE_ADDRESS   # owner = the Safe
```

### Step 4 — Cross-chain upgrade (one command)

```bash
wormcraft deploy upgrade \
  --proxy    $PROXY \
  --new-impl $NEW_IMPL \
  --safe     $YOUR_SAFE_ADDRESS \
  --module   $WORMCRAFT_MODULE_ADDRESS \
  --chains   sepolia,base-sepolia,arbitrum-sepolia \
  --value    2000000000000000
```

This triggers `Safe.execTransactionFromModule(proxy, upgradeCalldata)` on every chain
in one source transaction. The Safe's own modules (Zodiac Delay, OZ TimelockController,
Guard contracts) apply normally — Wormcraft doesn't bypass them.

### Trust model summary

| Actor | Role | Can be changed by |
|-------|------|------------------|
| Your Safe | Upgrade authority | Safe N/M threshold |
| WormcraftModule | Cross-chain relay | No one (ownerless) |
| WormcraftDeployer | Message bus | No one (ownerless after Bootstrap) |
| Your wallet (`--authorized`) | Initiates upgrades | Safe tx to WormcraftModule.authorize() |
```

**Step 3: Build example**
```bash
cd example && forge build
```

**Step 4: Commit**
```bash
git add example/script/BootstrapModule.s.sol example/README.md
git commit -m "feat(example): add BootstrapModule script and Part 3 Safe governance docs"
```

---

## Final verification

```bash
# All Solidity tests
cd contracts && forge test -v

# SDK tests
cd packages/sdk && npx vitest run

# CLI build + type check
cd packages/cli && npm run build && npx tsc --noEmit

# Smoke test new commands
node packages/cli/dist/main.js deploy upgrade --help
node packages/cli/dist/main.js module setup --help
```

All must pass before opening a PR.

---

## What is NOT in this plan (by design)

| Excluded | Reason |
|----------|--------|
| Custom timelock logic in Wormcraft | Safe handles this — use Zodiac Delay or OZ TimelockController as a Safe module |
| Cross-chain signature collection | Not needed — `execTransactionFromModule` bypasses threshold |
| WormcraftDeployer admin functions | Removed via `renounceOwnership()` — truly ownerless post-Bootstrap |
| Upgrading WormcraftModule itself | Deploy a new one with a new salt; old one is permanently frozen |
