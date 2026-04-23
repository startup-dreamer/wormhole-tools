# Worm Deploy — Multi-chain Deployment Feature Plan (v2 — Full Rewrite)

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Design and ship a new Solidity contract suite (`WormDeployer`) plus `worm deploy` CLI commands covering: single-transaction multi-chain deployment via CREATE2, cross-chain contract interaction (init/call), and proxy-based upgrades across chains.

**Architecture:** Two parallel workstreams. Part A writes the Solidity contracts (Foundry project in `contracts/`). Part B writes the Rust CLI that wraps them. Contracts are compiled first; their ABIs are checked into `contracts/artifacts/` so the Rust side never needs Solidity tooling at runtime.

**Tech Stack:** Solidity ^0.8.20 · Foundry · OpenZeppelin Contracts v5 · Wormhole Solidity SDK · Rust stable · clap v4 · tokio · reqwest · k256 · alloy-core (ABI encoding) · rlp (EIP-155 tx) · sha3 (existing)

**Feature Branch:** `feat/worm-deploy-multichain`

---

## Design Decisions (read before writing any code)

### D1: New WormDeployer — not the hackathon contract
The existing WormholeDeployer at `0xB6C636...` is a proof-of-concept. We write a new `WormDeployer.sol` that adds call routing and upgrades to the same delivery path. The CLI is built against the new contract only.

### D2: Monolithic message hub
One contract handles all three message types (deploy, call, upgrade). This keeps the trusted-sender mapping simple: every chain registers one address per peer chain. No routing indirection.

### D3: Message type discriminator in payload
```
payload = abi.encode(uint8 msgType, ...args)
MSG_DEPLOY  = 0x01
MSG_CALL    = 0x02
MSG_UPGRADE = 0x03
```
`receiveWormholeMessages` decodes the type byte first, then dispatches.

### D4: initCalldata solves the ownership problem
When deploying via `worm deploy multi`, the user passes `--init-hex 0x...` (ABI-encoded calldata). After CREATE2 deploys the contract, WormDeployer calls `deployed.call(initCalldata)`. This lets users run `initialize(owner)` atomically with deployment. `cast calldata "initialize(address)" 0xYOUR_ADDR` generates the hex.

### D5: WormOwnableProxy for upgradeable contracts
We provide an abstract Solidity base class `WormOwnableProxy.sol`. User contracts inherit it. It implements UUPS `_authorizeUpgrade` so that either the owner OR the local WormDeployer can trigger an upgrade. This is required for `worm deploy upgrade` to work.

### D6: WormDeployer is itself UUPS-upgradeable
Deployed as a proxy+implementation pair so we can fix bugs without redeploying to all chains. The impl is bootstrapped once per chain; the proxy address is the "canonical" WormDeployer address.

### D7: CLI accepts `--init-hex` not a parsed function sig
Rather than implementing a Solidity ABI type parser in Rust, accept raw hex calldata. Devs generate it with `cast calldata "fn(types)" args`. This is pragmatic and composable.

### D8: Gas limits — deploy and upgrade are fixed, call is configurable
- Deploy: hardcoded `3_000_000` — complex constructors need headroom
- Upgrade: hardcoded `200_000` — `upgradeToAndCall` is cheap
- Call: configurable via `--gas-limit` — init calls vary wildly

### D9: WormDeployer bootstrapped via Create2Deployer
The canonical `Create2Deployer` at `0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2` exists on all target testnets. WormDeployer's implementation + proxy are deployed via it using a fixed salt, producing a deterministic address on every chain. The bootstrap script runs once per chain; resulting addresses are committed to the chain registry.

### D10: Partial delivery is safe — CREATE2 is idempotent
If a chain receives the deployment twice (re-send), the second CREATE2 call reverts with "deployment collision." WormDeployer catches this in a `try/catch` and emits a `DeploymentSkipped` event instead of reverting, so the relayer doesn't retry infinitely.

---

## Repository Layout (new files only)

```
wormhole-cli/
  contracts/                           ← NEW: Foundry project
    foundry.toml
    remappings.txt
    .gitmodules
    lib/
      forge-std/                       ← git submodule
      wormhole-solidity-sdk/           ← git submodule
      openzeppelin-contracts/          ← git submodule
    src/
      WormDeployer.sol                 ← main hub (deploy + call + upgrade)
      WormOwnableProxy.sol             ← base class for user upgradeable contracts
      interfaces/
        IWormDeployer.sol              ← interface (for ABI generation)
    test/
      WormDeployer.t.sol               ← Foundry unit tests
      WormOwnableProxy.t.sol
    script/
      Bootstrap.s.sol                  ← deploys WormDeployer to a new chain
    artifacts/                         ← compiled, checked in — Rust reads these
      WormDeployer.json                ← ABI only (no bytecode needed by CLI at runtime)
  crates/
    wormhole-sdk/src/
      deploy/
        mod.rs                         ← re-exports + DeployParams + DeployResult
        abi.rs                         ← alloy-core ABI encoding for WormDeployer
        create2.rs                     ← deterministic address computation
        artifact.rs                    ← parse Hardhat/Foundry artifacts
        registry.rs                    ← chain name → Wormhole ID, RPC, WormDeployer addr
        status.rs                      ← per-chain deployment status polling
    wormhole-cli/src/
      commands/
        deploy.rs                      ← clap subcommands: multi, address, status, call, upgrade
```

---

## Part A — Smart Contracts

---

## Task C1: Foundry Project Setup

**Files:**
- Create: `contracts/foundry.toml`
- Create: `contracts/remappings.txt`
- Create: `contracts/.gitmodules`

### Step 1: Initialize Foundry project

```bash
mkdir -p contracts/src/interfaces contracts/test contracts/script contracts/artifacts
cd contracts && forge init --no-git --no-commit .
```

### Step 2: Add git submodules

```bash
# From the repo root
git submodule add https://github.com/foundry-rs/forge-std contracts/lib/forge-std
git submodule add https://github.com/wormhole-foundation/wormhole-solidity-sdk contracts/lib/wormhole-solidity-sdk
git submodule add https://github.com/OpenZeppelin/openzeppelin-contracts contracts/lib/openzeppelin-contracts
git submodule add https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable contracts/lib/openzeppelin-contracts-upgradeable
```

### Step 3: Write `contracts/foundry.toml`

```toml
[profile.default]
src     = "src"
out     = "out"
libs    = ["lib"]
solc    = "0.8.20"
via_ir  = false
optimizer = true
optimizer_runs = 200

[profile.default.fuzz]
runs = 1000
```

### Step 4: Write `contracts/remappings.txt`

```
forge-std/=lib/forge-std/src/
wormhole-solidity-sdk/=lib/wormhole-solidity-sdk/src/
@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
@openzeppelin/contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/
```

### Step 5: Verify setup

```bash
cd contracts && forge build
```

Expected: builds with zero errors (only empty src/ at this point)

### Step 6: Commit

```bash
git add contracts/
git commit -m "chore: initialize Foundry project for WormDeployer contract suite"
```

---

## Task C2: IWormDeployer Interface

**Files:**
- Create: `contracts/src/interfaces/IWormDeployer.sol`

### Background

Defining the interface first lets Task C3 compile against it and makes ABI generation deterministic. Every external function that the CLI calls must appear here.

### Step 1: Write the interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Message type constants encoded in cross-chain payloads.
uint8 constant MSG_DEPLOY  = 0x01;
uint8 constant MSG_CALL    = 0x02;
uint8 constant MSG_UPGRADE = 0x03;

/// @title IWormDeployer
/// @notice Interface for the WormDeployer cross-chain deployment and call hub.
interface IWormDeployer {

    // ── Events ────────────────────────────────────────────────────────────────

    event ContractDeployed(
        address indexed deployed,
        bytes32 indexed salt,
        address indexed initiator
    );

    event DeploymentSkipped(bytes32 indexed salt, string reason);

    event CrossChainCallExecuted(
        address indexed target,
        bool success,
        bytes returnData
    );

    event ContractUpgraded(
        address indexed proxy,
        address indexed newImpl
    );

    // ── Write: source-chain functions ─────────────────────────────────────────

    /// @notice Deploy bytecode to multiple target chains via Wormhole Standard Relayer.
    /// @param targetChains  Wormhole chain IDs of destination chains.
    /// @param bytecode      Compiled contract bytecode (constructor args appended if any).
    /// @param salt          CREATE2 salt — same contract address on every chain.
    /// @param initCalldata  Called on the deployed contract after CREATE2. Pass "" to skip.
    /// @param deployOnCurrentChain  If true, also deploy on the source chain in this tx.
    function deployAcrossChains(
        uint16[] calldata targetChains,
        bytes calldata bytecode,
        bytes32 salt,
        bytes calldata initCalldata,
        bool deployOnCurrentChain
    ) external payable;

    /// @notice Send an arbitrary cross-chain function call through the WormDeployer hub.
    /// @param targetChains  Wormhole chain IDs to deliver to.
    /// @param target        Contract address on each target chain (must be same address; use deterministic deployment).
    /// @param callData      ABI-encoded function call.
    /// @param gasLimit      Gas allocated for execution on each target chain.
    function callAcrossChains(
        uint16[] calldata targetChains,
        address target,
        bytes calldata callData,
        uint256 gasLimit
    ) external payable;

    /// @notice Upgrade a UUPS proxy to a new implementation across multiple chains.
    /// @param targetChains         Wormhole chain IDs.
    /// @param proxy                Proxy contract address (must be same on all chains via deterministic deploy).
    /// @param newImpl              New implementation address (must be same on all chains).
    /// @param upgradeOnCurrentChain  If true, also upgrade on the source chain in this tx.
    function upgradeAcrossChains(
        uint16[] calldata targetChains,
        address proxy,
        address newImpl,
        bool upgradeOnCurrentChain
    ) external payable;

    // ── View: cost quotes ─────────────────────────────────────────────────────

    /// @notice Total ETH cost to deploy to `chains` (uses fixed DEPLOY_GAS_LIMIT).
    function getDeployCost(uint16[] calldata chains) external view returns (uint256);

    /// @notice Total ETH cost to send a call to `chains` with `gasLimit` per chain.
    function getCallCost(uint16[] calldata chains, uint256 gasLimit) external view returns (uint256);

    /// @notice Total ETH cost to upgrade proxies on `chains` (uses fixed UPGRADE_GAS_LIMIT).
    function getUpgradeCost(uint16[] calldata chains) external view returns (uint256);

    /// @notice Compute the CREATE2 address for a given salt and bytecode.
    function computeAddress(bytes32 salt, bytes calldata bytecode) external view returns (address);

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// @notice Register the WormDeployer address on a peer chain.
    function setTrustedSender(uint16 chainId, bytes32 senderAddress) external;
}
```

### Step 2: Verify compiles

```bash
cd contracts && forge build
```

Expected: no errors

### Step 3: Commit

```bash
git add contracts/src/interfaces/IWormDeployer.sol
git commit -m "feat(contracts): add IWormDeployer interface"
```

---

## Task C3: WormDeployer.sol — Core Implementation

**Files:**
- Create: `contracts/src/WormDeployer.sol`

### Background

This is the central contract. It:
1. Accepts source-chain deployment/call/upgrade requests
2. Quotes and pays Wormhole relayer fees
3. Receives cross-chain payloads and dispatches by message type
4. Is itself UUPS-upgradeable (deployed behind a proxy)

### Step 1: Write failing Foundry test skeleton

Create `contracts/test/WormDeployer.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {WormDeployer} from "../src/WormDeployer.sol";

contract MockRelayer {
    // Tracks sendPayloadToEvm calls for assertions
    struct Call { uint16 chain; address target; bytes payload; uint256 gas; }
    Call[] public calls;
    uint256 public mockCost = 0.001 ether;

    function quoteEVMDeliveryPrice(uint16, uint256, uint256)
        external view returns (uint256, uint256) {
        return (mockCost, 0);
    }

    function sendPayloadToEvm(
        uint16 targetChain, address targetAddress,
        bytes memory payload, uint256, uint256 gasLimit
    ) external payable returns (uint64) {
        calls.push(Call(targetChain, targetAddress, payload, gasLimit));
        return uint64(calls.length);
    }
}

contract WormDeployerTest is Test {
    WormDeployer deployer;
    MockRelayer relayer;
    address owner = address(0xBEEF);

    function setUp() public {
        relayer = new MockRelayer();
        // Deploy impl and proxy for WormDeployer itself
        WormDeployer impl = new WormDeployer();
        // Use ERC1967Proxy to deploy (simplified for tests — just call impl directly)
        deployer = impl;
        vm.prank(owner);
        deployer.initialize(address(relayer));
    }

    function test_deployAcrossChains_sends_correct_payload() public {
        // Register peer chain
        vm.prank(owner);
        deployer.setTrustedSender(10004, bytes32(uint256(uint160(address(deployer)))));

        bytes memory bytecode = hex"6080604052";
        bytes32 salt = keccak256("test-v1");
        uint16[] memory chains = new uint16[](1);
        chains[0] = 10004; // BaseSepolia

        uint256 cost = deployer.getDeployCost(chains);
        deployer.deployAcrossChains{value: cost}(chains, bytecode, salt, "", false);

        assertEq(relayer.calls.length, 1);
        (uint8 msgType,,,, ) = abi.decode(
            relayer.calls[0].payload,
            (uint8, bytes, bytes32, bytes, address)
        );
        assertEq(msgType, 0x01); // MSG_DEPLOY
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

        // Simulate delivery from a trusted peer (chain 10002)
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

        // Second delivery — must NOT revert (idempotent)
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
```

Run: `cd contracts && forge test -vv`
Expected: FAIL (WormDeployer doesn't exist yet)

### Step 2: Implement `WormDeployer.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IWormholeRelayer} from "wormhole-solidity-sdk/interfaces/IWormholeRelayer.sol";
import {IWormholeReceiver} from "wormhole-solidity-sdk/interfaces/IWormholeReceiver.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IWormDeployer, MSG_DEPLOY, MSG_CALL, MSG_UPGRADE} from "./interfaces/IWormDeployer.sol";

contract WormDeployer is IWormDeployer, IWormholeReceiver, OwnableUpgradeable, UUPSUpgradeable {

    // ── Constants ─────────────────────────────────────────────────────────────

    uint256 public constant DEPLOY_GAS_LIMIT  = 3_000_000;
    uint256 public constant UPGRADE_GAS_LIMIT = 200_000;

    // ── Storage ───────────────────────────────────────────────────────────────

    IWormholeRelayer public relayer;

    /// @dev chainId => WormDeployer address on that chain (as bytes32, Wormhole address format).
    mapping(uint16 => bytes32) public trustedSenders;

    // ── Initializer ───────────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address _relayer) external initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        relayer = IWormholeRelayer(_relayer);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setTrustedSender(uint16 chainId, bytes32 senderAddress) external onlyOwner {
        trustedSenders[chainId] = senderAddress;
    }

    // ── Source-chain: Deploy ──────────────────────────────────────────────────

    function deployAcrossChains(
        uint16[] calldata targetChains,
        bytes calldata bytecode,
        bytes32 salt,
        bytes calldata initCalldata,
        bool deployOnCurrentChain
    ) external payable {
        bytes memory payload = abi.encode(
            MSG_DEPLOY, bytecode, salt, initCalldata, msg.sender
        );
        uint256 remaining = msg.value;

        for (uint256 i = 0; i < targetChains.length; i++) {
            (uint256 cost,) = relayer.quoteEVMDeliveryPrice(
                targetChains[i], 0, DEPLOY_GAS_LIMIT
            );
            require(remaining >= cost, "WormDeployer: insufficient fee");
            remaining -= cost;
            relayer.sendPayloadToEvm{value: cost}(
                targetChains[i],
                _trustedSenderAddress(targetChains[i]),
                payload,
                0,
                DEPLOY_GAS_LIMIT
            );
        }

        if (deployOnCurrentChain) {
            _deploy(bytecode, salt, initCalldata, msg.sender);
        }
    }

    // ── Source-chain: Call ────────────────────────────────────────────────────

    function callAcrossChains(
        uint16[] calldata targetChains,
        address target,
        bytes calldata callData,
        uint256 gasLimit
    ) external payable {
        bytes memory payload = abi.encode(MSG_CALL, target, callData);
        uint256 remaining = msg.value;

        for (uint256 i = 0; i < targetChains.length; i++) {
            (uint256 cost,) = relayer.quoteEVMDeliveryPrice(targetChains[i], 0, gasLimit);
            require(remaining >= cost, "WormDeployer: insufficient fee");
            remaining -= cost;
            relayer.sendPayloadToEvm{value: cost}(
                targetChains[i],
                _trustedSenderAddress(targetChains[i]),
                payload,
                0,
                gasLimit
            );
        }
    }

    // ── Source-chain: Upgrade ─────────────────────────────────────────────────

    function upgradeAcrossChains(
        uint16[] calldata targetChains,
        address proxy,
        address newImpl,
        bool upgradeOnCurrentChain
    ) external payable {
        bytes memory payload = abi.encode(MSG_UPGRADE, proxy, newImpl);
        uint256 remaining = msg.value;

        for (uint256 i = 0; i < targetChains.length; i++) {
            (uint256 cost,) = relayer.quoteEVMDeliveryPrice(
                targetChains[i], 0, UPGRADE_GAS_LIMIT
            );
            require(remaining >= cost, "WormDeployer: insufficient fee");
            remaining -= cost;
            relayer.sendPayloadToEvm{value: cost}(
                targetChains[i],
                _trustedSenderAddress(targetChains[i]),
                payload,
                0,
                UPGRADE_GAS_LIMIT
            );
        }

        if (upgradeOnCurrentChain) {
            _upgrade(proxy, newImpl);
        }
    }

    // ── Receive (called by Wormhole relayer on target chain) ──────────────────

    function receiveWormholeMessages(
        bytes memory payload,
        bytes[] memory,
        bytes32 sourceAddress,
        uint16 sourceChain,
        bytes32
    ) external payable override {
        require(msg.sender == address(relayer), "WormDeployer: only relayer");
        require(
            trustedSenders[sourceChain] == sourceAddress,
            "untrusted sender"
        );

        uint8 msgType = abi.decode(payload, (uint8));

        if (msgType == MSG_DEPLOY) {
            (, bytes memory bytecode, bytes32 salt, bytes memory initData, address initiator) =
                abi.decode(payload, (uint8, bytes, bytes32, bytes, address));
            _deploy(bytecode, salt, initData, initiator);

        } else if (msgType == MSG_CALL) {
            (, address target, bytes memory callData) =
                abi.decode(payload, (uint8, address, bytes));
            _call(target, callData);

        } else if (msgType == MSG_UPGRADE) {
            (, address proxy, address newImpl) =
                abi.decode(payload, (uint8, address, address));
            _upgrade(proxy, newImpl);
        }
    }

    // ── View: cost quotes ─────────────────────────────────────────────────────

    function getDeployCost(uint16[] calldata chains) external view returns (uint256 total) {
        for (uint256 i = 0; i < chains.length; i++) {
            (uint256 cost,) = relayer.quoteEVMDeliveryPrice(chains[i], 0, DEPLOY_GAS_LIMIT);
            total += cost;
        }
    }

    function getCallCost(uint16[] calldata chains, uint256 gasLimit) external view returns (uint256 total) {
        for (uint256 i = 0; i < chains.length; i++) {
            (uint256 cost,) = relayer.quoteEVMDeliveryPrice(chains[i], 0, gasLimit);
            total += cost;
        }
    }

    function getUpgradeCost(uint16[] calldata chains) external view returns (uint256 total) {
        for (uint256 i = 0; i < chains.length; i++) {
            (uint256 cost,) = relayer.quoteEVMDeliveryPrice(chains[i], 0, UPGRADE_GAS_LIMIT);
            total += cost;
        }
    }

    function computeAddress(bytes32 salt, bytes calldata bytecode) external view returns (address) {
        return Create2.computeAddress(salt, keccak256(bytecode));
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _deploy(
        bytes memory bytecode,
        bytes32 salt,
        bytes memory initData,
        address initiator
    ) internal {
        address deployed;
        try this._create2(salt, bytecode) returns (address addr) {
            deployed = addr;
        } catch {
            emit DeploymentSkipped(salt, "already deployed");
            return;
        }

        if (initData.length > 0) {
            (bool ok, bytes memory ret) = deployed.call(initData);
            require(ok, string(abi.encodePacked("WormDeployer: init failed: ", ret)));
        }

        emit ContractDeployed(deployed, salt, initiator);
    }

    /// @dev External so it can be wrapped in try/catch (Solidity limitation).
    function _create2(bytes32 salt, bytes memory bytecode) external returns (address) {
        require(msg.sender == address(this), "WormDeployer: internal only");
        return Create2.deploy(0, salt, bytecode);
    }

    function _call(address target, bytes memory callData) internal {
        (bool ok, bytes memory ret) = target.call(callData);
        emit CrossChainCallExecuted(target, ok, ret);
        if (!ok) revert(string(ret));
    }

    function _upgrade(address proxy, address newImpl) internal {
        // Calls upgradeToAndCall on a UUPS proxy.
        // The proxy's _authorizeUpgrade must allow address(this) (see WormOwnableProxy).
        (bool ok, bytes memory ret) = proxy.call(
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", newImpl, bytes(""))
        );
        require(ok, string(abi.encodePacked("WormDeployer: upgrade failed: ", ret)));
        emit ContractUpgraded(proxy, newImpl);
    }

    function _trustedSenderAddress(uint16 chainId) internal view returns (address) {
        bytes32 addr = trustedSenders[chainId];
        require(addr != bytes32(0), "WormDeployer: no trusted sender for chain");
        return address(uint160(uint256(addr)));
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    receive() external payable {}
}
```

### Step 3: Run tests

```bash
cd contracts && forge test -vv
```

Expected: all 6 tests in `WormDeployerTest` pass

### Step 4: Commit

```bash
git add contracts/src/WormDeployer.sol contracts/test/WormDeployer.t.sol
git commit -m "feat(contracts): implement WormDeployer — deploy, call, upgrade hub"
```

---

## Task C4: WormOwnableProxy.sol

**Files:**
- Create: `contracts/src/WormOwnableProxy.sol`
- Create: `contracts/test/WormOwnableProxy.t.sol`

### Background

Users who want upgradeable contracts inherit this base. It implements UUPS `_authorizeUpgrade` so that either the contract's owner OR the local WormDeployer can trigger upgrades. The WormDeployer address is immutable, set once at initialization.

### Step 1: Write failing test

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {WormOwnableProxy} from "../src/WormOwnableProxy.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract MyUpgradeableToken is WormOwnableProxy {
    uint256 public value;

    function initialize(address owner, address wormDeployer) external initializer {
        __WormOwnableProxy_init(owner, wormDeployer);
        value = 42;
    }

    function setValue(uint256 v) external { value = v; }
}

contract MyUpgradeableTokenV2 is WormOwnableProxy {
    uint256 public value;
    string public version;

    function initialize(address owner, address wormDeployer) external initializer {
        __WormOwnableProxy_init(owner, wormDeployer);
    }

    function initV2() external { version = "v2"; }
}

contract WormOwnableProxyTest is Test {
    MyUpgradeableToken token;
    address owner = address(0xABCD);
    address wormDeployer = address(0xD3F);
    address attacker = address(0xBAD);

    function setUp() public {
        MyUpgradeableToken impl = new MyUpgradeableToken();
        bytes memory initData = abi.encodeCall(
            MyUpgradeableToken.initialize, (owner, wormDeployer)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        token = MyUpgradeableToken(address(proxy));
    }

    function test_owner_can_upgrade() public {
        MyUpgradeableTokenV2 newImpl = new MyUpgradeableTokenV2();
        vm.prank(owner);
        token.upgradeToAndCall(address(newImpl), "");
    }

    function test_worm_deployer_can_upgrade() public {
        MyUpgradeableTokenV2 newImpl = new MyUpgradeableTokenV2();
        vm.prank(wormDeployer);
        token.upgradeToAndCall(address(newImpl), "");
    }

    function test_random_address_cannot_upgrade() public {
        MyUpgradeableTokenV2 newImpl = new MyUpgradeableTokenV2();
        vm.prank(attacker);
        vm.expectRevert();
        token.upgradeToAndCall(address(newImpl), "");
    }

    function test_initial_value_preserved() public view {
        assertEq(token.value(), 42);
    }
}
```

Run: `cd contracts && forge test --match-contract WormOwnableProxyTest -vv`
Expected: FAIL (contract doesn't exist)

### Step 2: Implement `WormOwnableProxy.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title WormOwnableProxy
/// @notice Abstract base for user contracts that can be upgraded via `worm deploy upgrade`.
///
/// Inherit this instead of OwnableUpgradeable + UUPSUpgradeable. Call
/// `__WormOwnableProxy_init(owner, wormDeployerAddress)` in your `initialize` function.
///
/// This allows either the contract owner or the local WormDeployer to call
/// `upgradeToAndCall`, enabling cross-chain upgrades via `worm deploy upgrade`.
abstract contract WormOwnableProxy is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    /// @dev Address of the WormDeployer contract on this chain.
    /// Set once in __WormOwnableProxy_init; never changes.
    address private _wormDeployer;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    /// @notice Initialize ownership and WormDeployer authority.
    /// @param initialOwner  Address that owns this contract (typically msg.sender on deployment).
    /// @param wormDeployer  Address of the WormDeployer hub on this chain.
    function __WormOwnableProxy_init(
        address initialOwner,
        address wormDeployer
    ) internal onlyInitializing {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        _wormDeployer = wormDeployer;
    }

    /// @notice The WormDeployer address authorized to upgrade this contract.
    function wormDeployer() external view returns (address) {
        return _wormDeployer;
    }

    /// @dev Allow either owner or WormDeployer to authorize upgrades.
    function _authorizeUpgrade(address) internal override {
        require(
            msg.sender == owner() || msg.sender == _wormDeployer,
            "WormOwnableProxy: not authorized to upgrade"
        );
    }
}
```

### Step 3: Run tests

```bash
cd contracts && forge test --match-contract WormOwnableProxyTest -vv
```

Expected: all 4 tests pass

### Step 4: Commit

```bash
git add contracts/src/WormOwnableProxy.sol contracts/test/WormOwnableProxy.t.sol
git commit -m "feat(contracts): add WormOwnableProxy base for user upgradeable contracts"
```

---

## Task C5: Bootstrap Deployment Script

**Files:**
- Create: `contracts/script/Bootstrap.s.sol`

### Background

WormDeployer needs to be deployed at the same address on every chain. Strategy: deploy the implementation via the deterministic `Create2Deployer` at `0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2` using a fixed salt, then deploy an ERC1967Proxy pointing to it (also via Create2Deployer with a different fixed salt). The result is two deterministic addresses: impl + proxy. The proxy address is the "canonical WormDeployer address" committed to the chain registry.

### Step 1: Write the script

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {WormDeployer} from "../src/WormDeployer.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

interface ICreate2Deployer {
    function deploy(uint256 value, bytes32 salt, bytes memory code) external;
    function computeAddress(bytes32 salt, bytes32 codeHash) external view returns (address);
}

contract Bootstrap is Script {
    // The deterministic Create2Deployer deployed on all EVM chains
    address constant CREATE2_FACTORY = 0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2;

    bytes32 constant IMPL_SALT  = keccak256("worm-deployer-impl-v1");
    bytes32 constant PROXY_SALT = keccak256("worm-deployer-proxy-v1");

    function run(address wormholeRelayer) external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        console.log("Deployer:", deployer);

        ICreate2Deployer factory = ICreate2Deployer(CREATE2_FACTORY);

        // ── Step 1: Deploy implementation ────────────────────────────────────
        bytes memory implBytecode = type(WormDeployer).creationCode;
        address implAddr = factory.computeAddress(IMPL_SALT, keccak256(implBytecode));
        console.log("Expected impl address:", implAddr);

        vm.startBroadcast(deployerKey);

        if (implAddr.code.length == 0) {
            factory.deploy(0, IMPL_SALT, implBytecode);
            console.log("Impl deployed at:", implAddr);
        } else {
            console.log("Impl already deployed at:", implAddr);
        }

        // ── Step 2: Deploy proxy ──────────────────────────────────────────────
        bytes memory initData = abi.encodeCall(WormDeployer.initialize, (wormholeRelayer));
        bytes memory proxyBytecode = abi.encodePacked(
            type(ERC1967Proxy).creationCode,
            abi.encode(implAddr, initData)
        );
        address proxyAddr = factory.computeAddress(PROXY_SALT, keccak256(proxyBytecode));
        console.log("Expected proxy address:", proxyAddr);

        if (proxyAddr.code.length == 0) {
            factory.deploy(0, PROXY_SALT, proxyBytecode);
            console.log("Proxy deployed at:", proxyAddr);
        } else {
            console.log("Proxy already deployed at:", proxyAddr);
        }

        vm.stopBroadcast();

        console.log("=== Bootstrap complete ===");
        console.log("WormDeployer canonical address:", proxyAddr);
        console.log("Add to registry: chain name =>", proxyAddr);
    }
}
```

### Step 2: Verify script compiles

```bash
cd contracts && forge build --force
```

Expected: zero errors

### Step 3: Commit

```bash
git add contracts/script/Bootstrap.s.sol
git commit -m "feat(contracts): add Bootstrap deployment script for WormDeployer"
```

---

## Task C6: Compile and Export ABIs

**Files:**
- Create: `contracts/artifacts/WormDeployer.json`

### Background

The Rust CLI reads contract ABIs from `contracts/artifacts/`. The ABI is the only thing needed at runtime — bytecode is not required (the CLI calls an already-deployed contract). Check the ABI in to avoid requiring Foundry at runtime.

### Step 1: Compile

```bash
cd contracts && forge build
```

### Step 2: Extract and format ABI

```bash
# Extract just the ABI (no bytecode) into the artifacts directory
cd contracts && forge inspect WormDeployer abi > artifacts/WormDeployer.json
```

### Step 3: Verify the file is valid JSON

```bash
cat contracts/artifacts/WormDeployer.json | python3 -m json.tool > /dev/null && echo "valid JSON"
```

Expected: `valid JSON`

### Step 4: Commit

```bash
git add contracts/artifacts/WormDeployer.json
git commit -m "chore(contracts): export WormDeployer ABI to artifacts/"
```

---

## Part B — Rust CLI

---

## Task R1: EVM Transaction Signing

**Files:**
- Modify: `crates/wormhole-sdk/src/chains/evm.rs`
- Modify: `Cargo.toml` (workspace), `crates/wormhole-sdk/Cargo.toml`

### Background

`send_signed` is currently a stub. Everything in Part B that mutates chain state depends on it. This task replaces the stub with a real EIP-155 implementation.

### Step 1: Add `rlp` dependency

`Cargo.toml` (workspace, `[workspace.dependencies]`):
```toml
rlp = "0.5"
```

`crates/wormhole-sdk/Cargo.toml`:
```toml
rlp = { workspace = true }
```

### Step 2: Write failing unit tests

In `crates/wormhole-sdk/src/chains/evm.rs`, add:
```rust
#[test]
fn legacy_tx_rlp_for_signing_has_nine_items() {
    let tx = LegacyTx {
        nonce: 7, gas_price: 2_000_000_000u128, gas_limit: 21_000u64,
        to: Some([0xABu8; 20]), value: 0u128, data: vec![], chain_id: 11155111,
    };
    let encoded = tx.rlp_encode_for_signing();
    // Must be an RLP list with exactly 9 items
    let rlp = rlp::Rlp::new(&encoded);
    assert!(rlp.is_list());
    assert_eq!(rlp.item_count().unwrap(), 9);
}

#[test]
fn ecdsa_sign_produces_valid_recovery_id() {
    let key = "0x0000000000000000000000000000000000000000000000000000000000000001";
    let hash = [0xabu8; 32];
    let (r, s, recid) = ecdsa_sign_hash(&hash, key).unwrap();
    assert_eq!(r.len(), 32);
    assert_eq!(s.len(), 32);
    assert!(recid <= 1);
}

#[test]
fn evm_address_from_key_known_value() {
    // Private key 1 → known Ethereum address
    let key = "0x0000000000000000000000000000000000000000000000000000000000000001";
    let addr = evm_address_from_key(key).unwrap();
    assert_eq!(
        addr.to_lowercase(),
        "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf"
    );
}
```

Run: `cargo test -p wormhole-sdk chains::evm`
Expected: FAIL

### Step 3: Implement signing infrastructure

Add to `crates/wormhole-sdk/src/chains/evm.rs`:

```rust
use rlp::RlpStream;
use k256::ecdsa::{SigningKey, signature::hazmat::PrehashSigner, RecoveryId};

pub struct LegacyTx {
    pub nonce: u64,
    pub gas_price: u128,
    pub gas_limit: u64,
    pub to: Option<[u8; 20]>,
    pub value: u128,
    pub data: Vec<u8>,
    pub chain_id: u64,
}

impl LegacyTx {
    pub fn rlp_encode_for_signing(&self) -> Vec<u8> {
        let mut s = RlpStream::new_list(9);
        s.append(&self.nonce);
        s.append(&self.gas_price);
        s.append(&self.gas_limit);
        match &self.to {
            Some(addr) => s.append(&addr.as_ref()),
            None => s.append_empty_data(),
        };
        s.append(&self.value);
        s.append(&self.data.as_slice());
        s.append(&self.chain_id);
        s.append(&0u8);
        s.append(&0u8);
        s.out().into()
    }

    pub fn rlp_encode_signed(&self, v: u64, r: [u8; 32], sig_s: [u8; 32]) -> Vec<u8> {
        let mut stream = RlpStream::new_list(9);
        stream.append(&self.nonce);
        stream.append(&self.gas_price);
        stream.append(&self.gas_limit);
        match &self.to {
            Some(addr) => stream.append(&addr.as_ref()),
            None => stream.append_empty_data(),
        };
        stream.append(&self.value);
        stream.append(&self.data.as_slice());
        stream.append(&v);
        stream.append(&r.as_ref());
        stream.append(&sig_s.as_ref());
        stream.out().into()
    }
}

pub fn ecdsa_sign_hash(hash: &[u8; 32], key_hex: &str) -> Result<([u8; 32], [u8; 32], u8), WormholeError> {
    let key_bytes = hex::decode(key_hex.strip_prefix("0x").unwrap_or(key_hex))
        .map_err(|e| WormholeError::Signing(e.to_string()))?;
    let signing_key = SigningKey::from_bytes(key_bytes.as_slice().into())
        .map_err(|e| WormholeError::Signing(e.to_string()))?;
    let (sig, recid): (k256::ecdsa::Signature, RecoveryId) = signing_key
        .sign_prehash(hash)
        .map_err(|e| WormholeError::Signing(e.to_string()))?;
    let sig_bytes = sig.to_bytes();
    let r: [u8; 32] = sig_bytes[..32].try_into().unwrap();
    let s: [u8; 32] = sig_bytes[32..].try_into().unwrap();
    Ok((r, s, recid.to_byte()))
}

pub fn evm_address_from_key(key_hex: &str) -> Result<String, WormholeError> {
    let key_bytes = hex::decode(key_hex.strip_prefix("0x").unwrap_or(key_hex))
        .map_err(|e| WormholeError::Signing(e.to_string()))?;
    let signing_key = SigningKey::from_bytes(key_bytes.as_slice().into())
        .map_err(|e| WormholeError::Signing(e.to_string()))?;
    let pubkey = signing_key.verifying_key().to_encoded_point(false);
    let hash = sha3::Keccak256::digest(&pubkey.as_bytes()[1..]);
    Ok(format!("0x{}", hex::encode(&hash[12..])))
}
```

Replace the stub `send_signed` with:

```rust
pub async fn send_signed(
    rpc_url: &str,
    to: &str,
    value_wei: u128,
    data: &[u8],
    key_hex: &str,
) -> Result<String, WormholeError> {
    let from = evm_address_from_key(key_hex)?;
    let (nonce, gas_price, chain_id) = tokio::try_join!(
        eth_get_transaction_count(rpc_url, &from),
        eth_gas_price(rpc_url),
        eth_chain_id(rpc_url),
    )?;
    let gas_price = gas_price * 12 / 10; // 20% buffer
    let to_bytes = parse_address_bytes(to)?;
    let gas_limit = eth_estimate_gas(rpc_url, &from, to, value_wei, data)
        .await
        .unwrap_or(500_000) * 12 / 10;

    let tx = LegacyTx { nonce, gas_price, gas_limit, to: Some(to_bytes), value: value_wei,
        data: data.to_vec(), chain_id };
    let rlp = tx.rlp_encode_for_signing();
    let hash: [u8; 32] = sha3::Keccak256::digest(&rlp).into();
    let (r, s, recid) = ecdsa_sign_hash(&hash, key_hex)?;
    let v = chain_id * 2 + 35 + recid as u64; // EIP-155
    let raw = tx.rlp_encode_signed(v, r, s);

    let body = serde_json::json!({
        "jsonrpc":"2.0","method":"eth_sendRawTransaction",
        "params":[format!("0x{}", hex::encode(&raw))],"id":1
    });
    let response = json_rpc_call(rpc_url, body).await?;
    extract_result_string(response)
}
```

Add required JSON-RPC helpers (`eth_get_transaction_count`, `eth_gas_price`, `eth_chain_id`, `eth_estimate_gas`, `parse_address_bytes`) — see full implementations in the existing `eth_call` pattern.

Also expose `eth_call` and `json_rpc_call` as `pub(crate)` so the deploy module can call them.

### Step 4: Run tests and build

```bash
cargo test -p wormhole-sdk chains::evm -- --nocapture
cargo build --all
```

### Step 5: Commit

```bash
git add crates/wormhole-sdk/src/chains/evm.rs Cargo.toml crates/wormhole-sdk/Cargo.toml
git commit -m "feat: implement EIP-155 transaction signing in wormhole-sdk"
```

---

## Task R2: ABI Encoding for New WormDeployer

**Files:**
- Create: `crates/wormhole-sdk/src/deploy/mod.rs`
- Create: `crates/wormhole-sdk/src/deploy/abi.rs`
- Modify: `Cargo.toml` (workspace), `crates/wormhole-sdk/Cargo.toml`

### Background

The new WormDeployer has a different ABI than the hackathon contract. This task encodes all four source-chain write functions and the three cost-quote view functions.

### Step 1: Add alloy-core

`Cargo.toml` (workspace):
```toml
alloy-core = { version = "0.8", features = ["abi", "sol-types"] }
```

`crates/wormhole-sdk/Cargo.toml`:
```toml
alloy-core = { workspace = true }
```

### Step 2: Write failing tests

```rust
// tests in crates/wormhole-sdk/src/deploy/abi.rs

#[test]
fn deploy_across_chains_selector_matches_interface() {
    let encoded = encode_deploy_across_chains(
        &[10004u16], &[0x60u8, 0x80], &[0u8; 32], &[], false,
    );
    let expected = selector(b"deployAcrossChains(uint16[],bytes,bytes32,bytes,bool)");
    assert_eq!(&encoded[..4], &expected);
}

#[test]
fn call_across_chains_selector_correct() {
    let encoded = encode_call_across_chains(&[10004u16], [0u8; 20], &[], 300_000u64);
    let expected = selector(b"callAcrossChains(uint16[],address,bytes,uint256)");
    assert_eq!(&encoded[..4], &expected);
}

#[test]
fn upgrade_across_chains_selector_correct() {
    let encoded = encode_upgrade_across_chains(&[10004u16], [0u8; 20], [0u8; 20], false);
    let expected = selector(b"upgradeAcrossChains(uint16[],address,address,bool)");
    assert_eq!(&encoded[..4], &expected);
}

#[test]
fn get_deploy_cost_selector_correct() {
    let encoded = encode_get_deploy_cost(&[10004u16]);
    let expected = selector(b"getDeployCost(uint16[])");
    assert_eq!(&encoded[..4], &expected);
}

fn selector(sig: &[u8]) -> [u8; 4] {
    use sha3::Digest;
    let hash = sha3::Keccak256::digest(sig);
    [hash[0], hash[1], hash[2], hash[3]]
}
```

Run: `cargo test -p wormhole-sdk deploy::abi`
Expected: FAIL

### Step 3: Implement using alloy-core `sol!` macro

```rust
use alloy_core::sol;

sol! {
    interface WormDeployer {
        function deployAcrossChains(
            uint16[] calldata targetChains,
            bytes calldata bytecode,
            bytes32 salt,
            bytes calldata initCalldata,
            bool deployOnCurrentChain
        ) external payable;

        function callAcrossChains(
            uint16[] calldata targetChains,
            address target,
            bytes calldata callData,
            uint256 gasLimit
        ) external payable;

        function upgradeAcrossChains(
            uint16[] calldata targetChains,
            address proxy,
            address newImpl,
            bool upgradeOnCurrentChain
        ) external payable;

        function getDeployCost(uint16[] calldata chains) external view returns (uint256);
        function getCallCost(uint16[] calldata chains, uint256 gasLimit) external view returns (uint256);
        function getUpgradeCost(uint16[] calldata chains) external view returns (uint256);
        function computeAddress(bytes32 salt, bytes calldata bytecode) external view returns (address);
    }
}

pub fn encode_deploy_across_chains(
    chain_ids: &[u16], bytecode: &[u8], salt: &[u8; 32],
    init_calldata: &[u8], deploy_on_source: bool,
) -> Vec<u8> {
    use WormDeployer::deployAcrossChainsCalls;
    use alloy_core::primitives::{Bytes, FixedBytes};
    deployAcrossChainsCalls {
        targetChains: chain_ids.to_vec(),
        bytecode: Bytes::copy_from_slice(bytecode),
        salt: FixedBytes::from(salt),
        initCalldata: Bytes::copy_from_slice(init_calldata),
        deployOnCurrentChain: deploy_on_source,
    }.abi_encode()
}

pub fn encode_call_across_chains(
    chain_ids: &[u16], target: [u8; 20], call_data: &[u8], gas_limit: u64,
) -> Vec<u8> {
    use WormDeployer::callAcrossChainsCalls;
    use alloy_core::primitives::{Address, Bytes, U256};
    callAcrossChainsCalls {
        targetChains: chain_ids.to_vec(),
        target: Address::from(target),
        callData: Bytes::copy_from_slice(call_data),
        gasLimit: U256::from(gas_limit),
    }.abi_encode()
}

pub fn encode_upgrade_across_chains(
    chain_ids: &[u16], proxy: [u8; 20], new_impl: [u8; 20], upgrade_on_source: bool,
) -> Vec<u8> {
    use WormDeployer::upgradeAcrossChainsCalls;
    use alloy_core::primitives::Address;
    upgradeAcrossChainsCalls {
        targetChains: chain_ids.to_vec(),
        proxy: Address::from(proxy),
        newImpl: Address::from(new_impl),
        upgradeOnCurrentChain: upgrade_on_source,
    }.abi_encode()
}

pub fn encode_get_deploy_cost(chain_ids: &[u16]) -> Vec<u8> {
    use WormDeployer::getDeployCostCalls;
    getDeployCostCalls { chains: chain_ids.to_vec() }.abi_encode()
}

pub fn encode_get_call_cost(chain_ids: &[u16], gas_limit: u64) -> Vec<u8> {
    use WormDeployer::getCallCostCalls;
    use alloy_core::primitives::U256;
    getCallCostCalls { chains: chain_ids.to_vec(), gasLimit: U256::from(gas_limit) }.abi_encode()
}

pub fn encode_get_upgrade_cost(chain_ids: &[u16]) -> Vec<u8> {
    use WormDeployer::getUpgradeCostCalls;
    getUpgradeCostCalls { chains: chain_ids.to_vec() }.abi_encode()
}

/// Decode a uint256 eth_call result to u128 (sufficient for any relayer fee).
pub fn decode_u256_result(hex_result: &str) -> Result<u128, crate::WormholeError> {
    let s = hex_result.strip_prefix("0x").unwrap_or(hex_result);
    if s.len() < 32 {
        return Err(crate::WormholeError::Network("result too short".into()));
    }
    u128::from_str_radix(&s[s.len().saturating_sub(32)..], 16)
        .map_err(|e| crate::WormholeError::Network(e.to_string()))
}
```

### Step 4: Run tests

```bash
cargo test -p wormhole-sdk deploy -- --nocapture
cargo build --all
```

### Step 5: Commit

```bash
git add crates/wormhole-sdk/src/deploy/ Cargo.toml crates/wormhole-sdk/Cargo.toml crates/wormhole-sdk/src/lib.rs
git commit -m "feat: ABI encoding for new WormDeployer contract suite"
```

---

## Task R3: Chain Registry

**Files:**
- Create: `crates/wormhole-sdk/src/deploy/registry.rs`

### Background

Maps CLI chain names to Wormhole IDs, RPC URLs, and the WormDeployer address (set after running Bootstrap.s.sol once per chain). The registry is a compile-time static table — no config files.

> **Important:** The `worm_deployer` addresses are populated after running the Bootstrap script (Task C5). Until then, use `"0x0000000000000000000000000000000000000000"` as a placeholder. After bootstrap, commit the real addresses.

```rust
pub struct ChainEntry {
    pub name: &'static str,
    pub wormhole_id: u16,
    pub evm_chain_id: u64,
    pub default_rpc: &'static str,
    /// WormDeployer proxy address on this chain.
    /// This IS also the CREATE2 deployer address (WormDeployer calls Create2.deploy on itself).
    pub worm_deployer: &'static str,
    /// Wormhole Standard Relayer address on this chain (for gas quoting in the CLI).
    pub wormhole_relayer: &'static str,
}
```

Include known relayer addresses for each chain (from Wormhole docs):

| Chain | Wormhole ID | EVM ID | Relayer Address |
|---|---|---|---|
| sepolia | 10002 | 11155111 | `0x7B1bD7a6b4E61c2a123AC6BC2cbfC614437D0470` |
| base-sepolia | 10004 | 84532 | `0x93BAD53DDfB6132b0aC8E37f6029163E17396f70` |
| op-sepolia | 10005 | 11155420 | `0x93BAD53DDfB6132b0aC8E37f6029163E17396f70` |
| arb-sepolia | 10003 | 421614 | `0x7B1bD7a6b4E61c2a123AC6BC2cbfC614437D0470` |
| celo-alfajores | 14 | 44787 | `0x306B68267Deb7c5DfCDa3619E22E9Ca39C374f84` |
| avax-fuji | 6 | 43113 | `0xA3cF45939bD6260bcFe3D66bc73d60f19e49a8BB` |
| bsc-testnet | 4 | 97 | `0x80aC94316391752A193C1c47E27D382b507c93F3` |

### Tests required

```rust
#[test]
fn get_sepolia_returns_correct_wormhole_id() {
    assert_eq!(ChainRegistry::get("sepolia").unwrap().wormhole_id, 10002);
}
#[test]
fn unknown_chain_returns_none() {
    assert!(ChainRegistry::get("mainnet").is_none());
}
#[test]
fn names_lists_all_seven_chains() {
    assert_eq!(ChainRegistry::names().len(), 7);
}
```

### Step: Run tests and commit

```bash
cargo test -p wormhole-sdk deploy::registry -- --nocapture
git add crates/wormhole-sdk/src/deploy/registry.rs
git commit -m "feat: chain registry for 7 testnet chains with Wormhole relayer addresses"
```

---

## Task R4: CREATE2 Address Computation

**Files:**
- Create: `crates/wormhole-sdk/src/deploy/create2.rs`

### Background

`compute_create2_address(deployer, salt, bytecode)` is a pure function. The `deployer` is always the WormDeployer proxy address (from the registry) — the contract calls `Create2.deploy()` on itself.

### Tests required

```rust
#[test]
fn same_inputs_same_output()
#[test]
fn different_salt_different_address()
#[test]
fn salt_from_str_keccak_of_utf8()
#[test]
fn salt_from_hex_passthrough_for_0x_prefix_64_chars()
```

### Implementation

```rust
pub fn compute_create2_address(deployer: [u8; 20], salt: [u8; 32], bytecode: &[u8]) -> [u8; 20] {
    use sha3::Digest;
    let bytecode_hash: [u8; 32] = sha3::Keccak256::digest(bytecode).into();
    let mut preimage = Vec::with_capacity(85);
    preimage.push(0xff);
    preimage.extend_from_slice(&deployer);
    preimage.extend_from_slice(&salt);
    preimage.extend_from_slice(&bytecode_hash);
    sha3::Keccak256::digest(&preimage)[12..].try_into().unwrap()
}

pub fn salt_from_str(s: &str) -> [u8; 32] {
    if s.starts_with("0x") && s.len() == 66 {
        if let Ok(b) = hex::decode(&s[2..]) {
            if let Ok(arr) = b.try_into() { return arr; }
        }
    }
    sha3::Keccak256::digest(s.as_bytes()).into()
}
```

### Step: Run tests and commit

```bash
cargo test -p wormhole-sdk deploy::create2 -- --nocapture
git commit -m "feat: CREATE2 address computation and salt normalization"
```

---

## Task R5: Artifact Loading

**Files:**
- Create: `crates/wormhole-sdk/src/deploy/artifact.rs`

### Background

Parses Hardhat (`"bytecode": "0x..."`) and Foundry (`"bytecode": {"object": "..."}`) artifact JSON into raw bytecode bytes. Also supports `--init-hex` passthrough.

### Tests required

```rust
#[test] fn parse_hardhat_artifact()
#[test] fn parse_foundry_artifact()
#[test] fn parse_raw_bytecode_hex()
#[test] fn rejects_empty_bytecode()
#[test] fn rejects_artifact_without_bytecode_field()
```

### Implementation

```rust
pub fn parse_artifact_json(json: &str) -> Result<Vec<u8>, crate::WormholeError> {
    let v: serde_json::Value = serde_json::from_str(json)
        .map_err(|e| crate::WormholeError::InvalidEncoding(e.to_string()))?;
    let hex_str = if let Some(s) = v["bytecode"].as_str() {
        s.to_string()
    } else if let Some(s) = v["bytecode"]["object"].as_str() {
        s.to_string()
    } else {
        return Err(crate::WormholeError::InvalidEncoding(
            "missing 'bytecode' or 'bytecode.object'".into()
        ));
    };
    parse_bytecode_hex(&hex_str)
}

pub fn parse_bytecode_hex(hex: &str) -> Result<Vec<u8>, crate::WormholeError> {
    let s = hex.strip_prefix("0x").unwrap_or(hex);
    if s.is_empty() {
        return Err(crate::WormholeError::InvalidEncoding("bytecode empty".into()));
    }
    hex::decode(s).map_err(|e| crate::WormholeError::InvalidEncoding(e.to_string()))
}
```

### Step: Run tests and commit

```bash
cargo test -p wormhole-sdk deploy::artifact -- --nocapture
git commit -m "feat: parse Hardhat and Foundry artifact JSON for bytecode extraction"
```

---

## Task R6: SDK Core — deploy, call, upgrade

**Files:**
- Modify: `crates/wormhole-sdk/src/deploy/mod.rs`
- Modify: `crates/wormhole-sdk/src/lib.rs`

### Step 1: Define param structs and write tests

```rust
// Tests
#[test]
fn deploy_params_rejects_empty_bytecode() { ... }
#[test]
fn deploy_params_rejects_unknown_chain() { ... }
#[test]
fn call_params_rejects_zero_gas_limit() { ... }
```

### Step 2: Implement

```rust
pub struct DeployParams<'a> {
    pub source_chain: &'a str,
    pub target_chains: Vec<&'a str>,
    pub bytecode: Vec<u8>,
    pub salt: &'a str,
    pub init_calldata: Vec<u8>,   // empty if not needed
    pub deploy_on_source: bool,
    pub evm_key: &'a str,
    pub source_rpc: Option<&'a str>,
}

pub struct CallParams<'a> {
    pub source_chain: &'a str,
    pub target_chains: Vec<&'a str>,
    pub target_contract: &'a str, // same address on all chains (deterministic)
    pub call_data: Vec<u8>,       // ABI-encoded; use `cast calldata` to generate
    pub gas_limit: u64,
    pub evm_key: &'a str,
    pub source_rpc: Option<&'a str>,
}

pub struct UpgradeParams<'a> {
    pub source_chain: &'a str,
    pub target_chains: Vec<&'a str>,
    pub proxy: &'a str,     // same address on all chains
    pub new_impl: &'a str,  // same address on all chains (deployed via deploy multi first)
    pub upgrade_on_source: bool,
    pub evm_key: &'a str,
    pub source_rpc: Option<&'a str>,
}

pub struct DeployResult {
    pub tx_hash: String,
    pub expected_address: String,
    pub salt_bytes32: [u8; 32],
    pub source_chain: &'static str,
    pub target_chains: Vec<&'static str>,
    pub cost_wei: u128,
}
```

The three async functions (`deploy_across_chains`, `call_across_chains`, `upgrade_across_chains`) follow the same pattern:
1. Validate params
2. Look up source chain from registry
3. Call cost-quote function via `eth_call`
4. ABI-encode the write call
5. Call `send_signed` with the calldata and ETH value

### Step 3: Run tests and build

```bash
cargo test -p wormhole-sdk deploy -- --nocapture
cargo build --all
```

### Step 4: Commit

```bash
git commit -m "feat: wormhole-sdk deploy SDK core — deploy, call, upgrade"
```

---

## Task R7: `worm deploy` CLI Command

**Files:**
- Create: `crates/wormhole-cli/src/commands/deploy.rs`
- Modify: `crates/wormhole-cli/src/commands/mod.rs`
- Modify: `crates/wormhole-cli/src/main.rs`

### Subcommand tree

```
worm deploy
  address    Compute CREATE2 address offline (no tx, no key)
  multi      Deploy bytecode to multiple chains in one source tx
  call       Send a cross-chain function call through WormDeployer
  upgrade    Upgrade a UUPS proxy across chains
  status     Check per-chain deployment status
```

### All subcommands support `--output json` (env `WORM_OUTPUT=json`) for CI scripting.

### `address` args

```rust
#[derive(Debug, Args)]
pub struct AddressArgs {
    #[arg(long, conflicts_with = "bytecode")]
    pub artifact: Option<String>,
    #[arg(long, conflicts_with = "artifact")]
    pub bytecode: Option<String>,
    #[arg(long)]
    pub salt: String,
    #[arg(long, default_value = "sepolia")]
    pub source: String,
}
```

### `multi` args

```rust
#[derive(Debug, Args)]
pub struct MultiArgs {
    #[arg(long, conflicts_with = "bytecode")]
    pub artifact: Option<String>,
    #[arg(long, conflicts_with = "artifact")]
    pub bytecode: Option<String>,
    #[arg(long)]
    pub salt: String,
    #[arg(long)]
    pub source: String,
    #[arg(long)]
    pub targets: String,          // comma-separated
    #[arg(long)]
    pub init_hex: Option<String>, // 0x-prefixed ABI calldata; use `cast calldata` to generate
    #[arg(long)]
    pub include_source: bool,
    #[arg(long)]
    pub yes: bool,
    #[arg(long)]
    pub rpc: Option<String>,
    #[arg(long, env = "WORMHOLE_EVM_KEY", hide_env_values = true)]
    pub key: String,
}
```

### `call` args

```rust
#[derive(Debug, Args)]
pub struct CallArgs {
    #[arg(long)] pub source: String,
    #[arg(long)] pub targets: String,
    #[arg(long)] pub contract: String,
    /// ABI-encoded calldata. Generate with: cast calldata "fn(type)" arg
    #[arg(long)] pub calldata: String,
    #[arg(long, default_value = "300000")] pub gas_limit: u64,
    #[arg(long)] pub yes: bool,
    #[arg(long)] pub rpc: Option<String>,
    #[arg(long, env = "WORMHOLE_EVM_KEY", hide_env_values = true)] pub key: String,
}
```

### `upgrade` args

```rust
#[derive(Debug, Args)]
pub struct UpgradeArgs {
    #[arg(long)] pub source: String,
    #[arg(long)] pub targets: String,
    #[arg(long)] pub proxy: String,
    #[arg(long)] pub new_impl: String,
    #[arg(long)] pub include_source: bool,
    #[arg(long)] pub yes: bool,
    #[arg(long)] pub rpc: Option<String>,
    #[arg(long, env = "WORMHOLE_EVM_KEY", hide_env_values = true)] pub key: String,
}
```

### CLI test

```rust
#[test]
fn parse_multi_subcommand_all_flags() {
    let cli = TestCli::try_parse_from([
        "worm", "multi",
        "--artifact", "out/Token.json",
        "--salt", "v1.0.0",
        "--source", "sepolia",
        "--targets", "base-sepolia,op-sepolia",
        "--init-hex", "0xabcd",
        "--yes",
        "--key", "0x01",
    ]).unwrap();
    // assert variant and field values
}
```

### Step: Build and smoke test

```bash
cargo build --all
./target/debug/worm deploy --help
./target/debug/worm deploy multi --help
./target/debug/worm deploy call --help
./target/debug/worm deploy upgrade --help
```

### Step: Commit

```bash
git commit -m "feat: add worm deploy multi/address/call/upgrade/status CLI subcommands"
```

---

## Task R8: Status Polling + Quality Gate

**Files:**
- Create: `crates/wormhole-sdk/src/deploy/status.rs`

### Implementation

`check_contract_deployed(rpc, address)` calls `eth_getCode` and returns `Pending`/`Deployed`/`Failed`.

### Final quality gate

```bash
cd contracts && forge test -vv          # all Solidity tests pass
cargo fmt --all -- --check              # no formatting drift
cargo clippy --all-targets -- -D warnings  # zero warnings
cargo test --all                        # all Rust tests pass
```

### Commit

```bash
git commit -m "chore: quality gate — fmt, clippy, forge tests all green"
```

---

## Dependency Summary

| Crate | New Dependency | Purpose |
|---|---|---|
| `wormhole-sdk` | `alloy-core = "0.8"` (abi, sol-types) | ABI encoding for dynamic types |
| `wormhole-sdk` | `rlp = "0.5"` | EIP-155 RLP transaction encoding |
| Foundry project | `forge-std` (submodule) | Testing |
| Foundry project | `wormhole-solidity-sdk` (submodule) | IWormholeRelayer, IWormholeReceiver |
| Foundry project | `openzeppelin-contracts` (submodule) | Create2, ERC1967Proxy |
| Foundry project | `openzeppelin-contracts-upgradeable` (submodule) | OwnableUpgradeable, UUPSUpgradeable |

---

## CLI UX Reference

```bash
# See what address your contract will get (no key, no tx)
worm deploy address \
  --artifact ./out/MyToken.sol/MyToken.json \
  --salt "v1.0.0" --source sepolia

# Deploy to 3 chains in one tx
WORMHOLE_EVM_KEY=0xdeadbeef...
worm deploy multi \
  --artifact ./out/MyToken.sol/MyToken.json \
  --salt "v1.0.0" \
  --source sepolia \
  --targets base-sepolia,op-sepolia,arb-sepolia \
  --init-hex $(cast calldata "initialize(address)" 0xYOUR_ADDR) \
  --yes

# Machine-readable output for CI
worm deploy multi ... --output json | jq .address

# Send a cross-chain call (contract must be at same address on all chains)
worm deploy call \
  --source sepolia \
  --targets base-sepolia,op-sepolia \
  --contract 0xYourContractAddr \
  --calldata $(cast calldata "setConfig(uint256)" 42) \
  --gas-limit 200000

# Upgrade a UUPS proxy (deploy new impl first, get its address, then:)
worm deploy upgrade \
  --source sepolia \
  --targets base-sepolia,op-sepolia \
  --proxy 0xProxyAddr \
  --new-impl 0xNewImplAddr \
  --include-source

# Check deployment status
worm deploy status --tx 0xabc... --source sepolia
```

---

## Known Limitations

1. **WormDeployer must be bootstrapped first.** Until `Bootstrap.s.sol` is run on a chain and its address committed to the registry, that chain is unsupported.
2. **Testnet only** until mainnet bootstrap is verified and audited.
3. **EVM chains only.** Solana/Aptos/Sui have different messaging models.
4. **`worm deploy call` requires same contract address on all targets.** Use deterministic deployment to ensure this.
5. **Upgrade requires WormOwnableProxy.** The proxy's `_authorizeUpgrade` must allow the local WormDeployer. Standard OpenZeppelin proxies will reject the upgrade call.
6. **EIP-155 legacy txs only** (not EIP-1559) in v1.
