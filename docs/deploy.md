# worm-tool Deploy Guide

Cross-chain deployment with deterministic addresses via `WormToolDeployer`.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Address Determinism](#address-determinism)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
  - [deploy address](#deploy-address)
  - [deploy multi](#deploy-multi)
  - [deploy call](#deploy-call)
  - [deploy upgrade](#deploy-upgrade)
  - [deploy status](#deploy-status)
- [Upgradeable Contracts](#upgradeable-contracts)
  - [Writing an Upgradeable Contract](#writing-an-upgradeable-contract)
  - [Initial Deployment](#initial-deployment)
  - [Upgrading via CLI](#upgrading-via-cli)
- [Bootstrapping WormToolDeployer](#bootstrapping-wormtooldeployer)
- [Known Addresses](#known-addresses)

---

## How It Works

`WormToolDeployer` is a smart contract hub deployed at the **same address on every chain**. It:

1. Receives a deployment request on the **source chain** with the target bytecode, CREATE2 salt, and a list of **target Wormhole chain IDs**.
2. Deploys the contract locally using CREATE2 (if `deployOnCurrentChain = true`).
3. Sends a Wormhole Standard Relayer message to each target chain.
4. The `WormToolDeployer` on each target chain receives the message and mirrors the same CREATE2 deployment.

Because the deployer address, salt, and init-bytecode are all identical across chains, the resulting contract address is the same everywhere.

```
Your wallet
    │
    ▼  deployAcrossChains(targets=[Arb, Base], bytecode, salt)
WormToolDeployer (Sepolia)          ← source chain: deploys locally
    │
    ├──[Wormhole]──▶ WormToolDeployer (Arb Sepolia) ← mirrors CREATE2
    └──[Wormhole]──▶ WormToolDeployer (Base Sepolia) ← mirrors CREATE2

Result: same contract address on Sepolia, Arb Sepolia, Base Sepolia
```

---

## Address Determinism

CREATE2 address = `keccak256(0xff ++ factory ++ salt ++ keccak256(initcode))[12:]`

For the **same address on every chain**, all three inputs must be identical:

| Input | How it stays the same |
|-------|----------------------|
| `factory` | WormToolDeployer is deployed at the same address on every chain (see [Bootstrapping](#bootstrapping-wormtooldeployer)) |
| `salt` | You choose; pass the same string to every chain |
| `keccak256(initcode)` | The compiled bytecode is identical; constructor args (if any) must also be identical |

> **Note on constructor args:** If your contract takes constructor arguments, those are ABI-encoded and appended to the initcode. Any chain-specific arg breaks determinism. Use an `initialize()` function instead (see [Upgradeable Contracts](#upgradeable-contracts)).

---

## Quick Start

```bash
# 1. Pre-compute the address before spending gas
worm-tool deploy address \
  --artifact contracts/out/MyContract.sol/MyContract.json \
  --salt "my-project-v1"

# 2. Deploy on source chain only (local, no cross-chain fee)
worm-tool deploy multi \
  --artifact contracts/out/MyContract.sol/MyContract.json \
  --salt "my-project-v1" \
  --source sepolia

# 3. Deploy on source + propagate to Arb Sepolia and Base Sepolia via Wormhole
worm-tool deploy multi \
  --artifact contracts/out/MyContract.sol/MyContract.json \
  --salt "my-project-v1" \
  --source sepolia \
  --targets arbitrum-sepolia,base-sepolia \
  --value 33000000000000000   # ETH for Wormhole relayer fees (quote first)

# 4. Verify
worm-tool deploy status \
  --address 0xABCD... \
  --chains sepolia,arbitrum-sepolia,base-sepolia
```

> **Quoting relayer fees:** Use `cast call <relayer> "quoteEVMDeliveryPrice(uint16,uint256,uint256)(uint256,uint256)" <targetChainId> 0 <gasLimit>` for each target chain, then sum.

---

## CLI Reference

### `deploy address`

Compute the CREATE2 deployment address offline — no transaction, no gas.

```bash
worm-tool deploy address \
  [--artifact <path> | --bytecode <hex>] \
  --salt <salt> \
  --deployer <address>
```

| Option | Description |
|--------|-------------|
| `--artifact <path>` | Path to a Hardhat or Foundry artifact JSON |
| `--bytecode <hex>` | Raw init bytecode (`0x`-prefixed) |
| `--salt <salt>` | CREATE2 salt — 32-byte hex or an arbitrary string (keccak256'd) |
| `--deployer <address>` | WormToolDeployer address (CREATE2 factory) |

**Example:**

```bash
worm-tool deploy address \
  --artifact contracts/out/Counter.sol/Counter.json \
  --salt "my-counter-v1" \
  --deployer 0x0aA4B5899bAF7326397b1041db9c854056126F57
```

```json
{
  "address": "0x8a7a833a...",
  "salt": "0x4c3a9...",
  "initCodeHash": "0xb257e9...",
  "deployer": "0x0aA4B5899..."
}
```

---

### `deploy multi`

Deploy bytecode on the source chain and optionally propagate to cross-chain targets via Wormhole.

```bash
worm-tool deploy multi \
  [--artifact <path> | --bytecode <hex>] \
  --salt <salt> \
  --source <chain> \
  [--targets <chains>] \
  [--init-hex <hex>] \
  [--value <wei>] \
  [--deployer <address>]
```

| Option | Description |
|--------|-------------|
| `--artifact <path>` | Path to Hardhat/Foundry artifact JSON |
| `--bytecode <hex>` | Raw init bytecode (`0x`-prefixed) |
| `--salt <salt>` | CREATE2 salt |
| `--source <chain>` | Chain where the transaction is sent |
| `--targets <chains>` | Comma-separated cross-chain target chain names (omit for local-only) |
| `--init-hex <hex>` | ABI-encoded initializer calldata (called on the contract after CREATE2) |
| `--value <wei>` | ETH in wei for Wormhole relayer fees; required when `--targets` is used |
| `--deployer <address>` | Override WormToolDeployer address |

**Local-only (no fee):**

```bash
worm-tool deploy multi \
  --artifact contracts/out/Counter.sol/Counter.json \
  --salt "counter-v1" \
  --source sepolia
```

**Cross-chain (with Wormhole):**

```bash
worm-tool deploy multi \
  --artifact contracts/out/Counter.sol/Counter.json \
  --salt "counter-v1" \
  --source sepolia \
  --targets arbitrum-sepolia,base-sepolia \
  --value 33000000000000000
```

**Output:**

```json
[{ "chain": "evm-10002", "chainId": "10002", "txHash": "0x...", "success": true }]
```

> The source chain result appears immediately. Cross-chain deployments are delivered asynchronously by the Wormhole relayer — poll with `deploy status` to confirm.

---

### `deploy call`

Send an arbitrary function call to a contract on multiple chains through WormToolDeployer.

```bash
worm-tool deploy call \
  --target <address> \
  --calldata <hex> \
  --chains <chains> \
  [--value <wei>] \
  [--deployer <address>]
```

| Option | Description |
|--------|-------------|
| `--target <address>` | Target contract address (must exist at the same address on all chains) |
| `--calldata <hex>` | ABI-encoded calldata (`0x`-prefixed) |
| `--chains <chains>` | Comma-separated chain names; first is the source |
| `--value <wei>` | ETH for Wormhole relayer fees |
| `--deployer <address>` | Override WormToolDeployer address |

**Example:**

```bash
worm-tool deploy call \
  --target 0x8a7a833a0ffb9947102be06a6ebf9f8447bb6823 \
  --calldata $(cast calldata "increment()") \
  --chains sepolia,arbitrum-sepolia,base-sepolia \
  --value 33000000000000000
```

---

### `deploy upgrade`

Upgrade a UUPS proxy to a new implementation across chains.

```bash
worm-tool deploy upgrade \
  --proxy <address> \
  --new-impl <address> \
  --chains <chains> \
  [--value <wei>] \
  [--deployer <address>]
```

| Option | Description |
|--------|-------------|
| `--proxy <address>` | Proxy contract address (must be same on all chains via deterministic deployment) |
| `--new-impl <address>` | New implementation address (must be same on all chains) |
| `--chains <chains>` | Comma-separated chain names; first is the source, upgraded locally + relayed cross-chain |
| `--value <wei>` | ETH for Wormhole relayer fees when upgrading cross-chain |
| `--deployer <address>` | Override WormToolDeployer address |

**Full cross-chain upgrade example:**

```bash
# Step 1: Deploy v2 implementation on every chain (same address via CREATE2)
worm-tool deploy multi --artifact out/MyContractV2.json --salt "my-contract-v2-impl" --source sepolia
worm-tool deploy multi --artifact out/MyContractV2.json --salt "my-contract-v2-impl" --source arbitrum-sepolia
worm-tool deploy multi --artifact out/MyContractV2.json --salt "my-contract-v2-impl" --source base-sepolia

# Step 2: Upgrade proxy on source chain + send Wormhole messages to targets
worm-tool deploy upgrade \
  --proxy 0xPROXY_ADDRESS \
  --new-impl 0xV2_IMPL_ADDRESS \
  --chains sepolia,arbitrum-sepolia,base-sepolia \
  --value 33000000000000000
```

> The proxy must be authorized to accept upgrades from WormToolDeployer. Use `WormToolProxy` as your base contract (see [Upgradeable Contracts](#upgradeable-contracts)).

---

### `deploy status`

Check whether a contract is deployed at an address on one or more chains.

```bash
worm-tool deploy status \
  --address <address> \
  --chains <chains>
```

**Example:**

```bash
worm-tool deploy status \
  --address 0x8a7a833a0ffb9947102be06a6ebf9f8447bb6823 \
  --chains sepolia,arbitrum-sepolia,base-sepolia
```

```json
[
  { "chain": "sepolia",          "address": "0x8a7a...", "deployed": true },
  { "chain": "arbitrum-sepolia", "address": "0x8a7a...", "deployed": true },
  { "chain": "base-sepolia",     "address": "0x8a7a...", "deployed": true }
]
```

---

## Upgradeable Contracts

`WormToolProxy` is an abstract base contract that adds cross-chain upgrade authority to any UUPS proxy.

### Writing an Upgradeable Contract

```solidity
// contracts/src/MyContractV1.sol
import {WormToolProxy} from "@worm-tool/contracts/WormToolProxy.sol";

contract MyContractV1 is WormToolProxy {
    uint256 public value;

    function initialize(address owner, address wormToolDeployer_) external initializer {
        __WormToolProxy_init(owner, wormToolDeployer_);
    }

    function setValue(uint256 v) external {
        value = v;
    }

    function version() external pure returns (string memory) { return "v1"; }
}
```

Key rules:
- Inherit `WormToolProxy` (not `Ownable` + `UUPSUpgradeable` directly).
- Call `__WormToolProxy_init(owner, wormToolDeployerAddress)` in your initializer.
- Pass `address(0)` constructor args are avoided — use `initializer` functions only.
- V2+ uses `reinitializer(N)` for new storage initialization; omit if no new state.

### Initial Deployment

Initial proxy deployment requires two steps (bootstrap once with `forge script`, upgrade forever via CLI):

```bash
# 1. Compile
forge build

# 2. Deploy implementation + proxy on Sepolia
forge script script/DeployProxy.s.sol \
  --rpc-url $SEPOLIA_RPC \
  --broadcast \
  --sig "run(address)" 0x0aA4B5899bAF7326397b1041db9c854056126F57

# 3. Repeat for each chain (same script → same addresses)
forge script script/DeployProxy.s.sol \
  --rpc-url $ARB_SEP_RPC \
  --broadcast \
  --sig "run(address)" 0x0aA4B5899bAF7326397b1041db9c854056126F57
```

The script from `contracts/script/DeployProxy.s.sol`:
- Uses `new CounterV1{salt: IMPL_SALT}()` → impl at a deterministic address
- Uses `new ERC1967Proxy{salt: PROXY_SALT}(impl, initData)` → proxy at a deterministic address
- Since `owner` and `wormToolDeployer` are the same on every chain, the proxy address matches everywhere

### Upgrading via CLI

Once the proxy exists, all future upgrades are purely CLI:

```bash
# 1. Deploy the new implementation on each chain (same address everywhere via CREATE2)
worm-tool deploy multi \
  --artifact contracts/out/MyContractV2.sol/MyContractV2.json \
  --salt "my-contract-v2-impl" \
  --source sepolia

worm-tool deploy multi \
  --artifact contracts/out/MyContractV2.sol/MyContractV2.json \
  --salt "my-contract-v2-impl" \
  --source arbitrum-sepolia

worm-tool deploy multi \
  --artifact contracts/out/MyContractV2.sol/MyContractV2.json \
  --salt "my-contract-v2-impl" \
  --source base-sepolia

# 2. Confirm impl is at the same address everywhere
worm-tool deploy status \
  --address $(worm-tool deploy address \
    --artifact contracts/out/MyContractV2.sol/MyContractV2.json \
    --salt "my-contract-v2-impl" \
    --deployer 0x0aA4B5899bAF7326397b1041db9c854056126F57 | jq -r .address) \
  --chains sepolia,arbitrum-sepolia,base-sepolia

# 3. Upgrade: one CLI call upgrades all chains
worm-tool deploy upgrade \
  --proxy 0xPROXY_ADDRESS \
  --new-impl 0xV2_IMPL_ADDRESS \
  --chains sepolia,arbitrum-sepolia,base-sepolia \
  --value 33000000000000000   # Wormhole fees for 2 cross-chain targets
```

**What happens:**

1. `deploy upgrade` sends one transaction to `WormToolDeployer` on Sepolia (source).
2. WormToolDeployer calls `proxy.upgradeToAndCall(newImpl, "")` locally — Sepolia upgrades immediately.
3. WormToolDeployer sends Wormhole messages to Arbitrum Sepolia and Base Sepolia.
4. The Wormhole relayer delivers messages to `WormToolDeployer` on each chain, which also calls `upgradeToAndCall`.

All three proxies end up pointing to the same implementation.

---

## Bootstrapping WormToolDeployer

`WormToolDeployer` achieves address determinism by:
- Using `new WormToolDeployer{salt: keccak256("worm-tool-deployer-v1")}(owner)` in `Bootstrap.s.sol`
- The CREATE2 factory is the **broadcaster wallet** (same key = same address on every chain)
- The `owner` constructor arg is the broadcaster's address (same on every chain)
- Therefore `keccak256(initcode)` is identical → same CREATE2 address everywhere

```bash
# Deploy on Sepolia (Wormhole relayer: 0x7B1bD7...)
forge script script/Bootstrap.s.sol \
  --rpc-url $SEPOLIA_RPC \
  --broadcast \
  --sig "run(address)" 0x7B1bD7a6b4E61c2a123AC6BC2cbfC614437D0470

# Deploy on Arbitrum Sepolia (same relayer)
forge script script/Bootstrap.s.sol \
  --rpc-url $ARB_SEP_RPC \
  --broadcast \
  --sig "run(address)" 0x7B1bD7a6b4E61c2a123AC6BC2cbfC614437D0470

# Deploy on Base Sepolia (different relayer: 0x93BAD5...)
forge script script/Bootstrap.s.sol \
  --rpc-url $BASE_SEP_RPC \
  --broadcast \
  --sig "run(address)" 0x93BAD53DDfB6132b0aC8E37f6029163E63372cEE

# Wire trusted senders (each chain must know its peers)
forge script script/Wire.s.sol --rpc-url $SEPOLIA_RPC --broadcast \
  --sig "run(uint16,uint16)" 10003 10004
forge script script/Wire.s.sol --rpc-url $ARB_SEP_RPC --broadcast \
  --sig "run(uint16,uint16)" 10002 10004
forge script script/Wire.s.sol --rpc-url $BASE_SEP_RPC --broadcast \
  --sig "run(uint16,uint16)" 10002 10003
```

---

## Known Addresses

### WormToolDeployer (testnet)

`WormToolDeployer` is deployed at the **same address** on all three testnets:

| Chain | Address |
|-------|---------|
| Sepolia (10002) | `0x0aA4B5899bAF7326397b1041db9c854056126F57` |
| Arbitrum Sepolia (10003) | `0x0aA4B5899bAF7326397b1041db9c854056126F57` |
| Base Sepolia (10004) | `0x0aA4B5899bAF7326397b1041db9c854056126F57` |

### Wormhole Standard Relayer (testnet)

| Chain | Relayer Address |
|-------|----------------|
| Sepolia | `0x7B1bD7a6b4E61c2a123AC6BC2cbfC614437D0470` |
| Arbitrum Sepolia | `0x7B1bD7a6b4E61c2a123AC6BC2cbfC614437D0470` |
| Base Sepolia | `0x93BAD53DDfB6132b0aC8E37f6029163E63372cEE` |

### Sample Contracts (testnet)

| Contract | Address |
|----------|---------|
| Counter (salt: `worm-tool-counter-v2`) | `0x8a7a833a0ffb9947102be06a6ebf9f8447bb6823` |
| CounterV1 implementation | `0x394128e83EE6B68233Adc3c3EEB0a2dBcC2221a6` |
| CounterV2 implementation | `0x397084d783edc0bef0cb5ad967d201ef8d0f8d13` |
| Counter proxy (upgraded to v2) | `0x5Bd3208D9004316e264E37176Ce85408Cb93C4eB` |
