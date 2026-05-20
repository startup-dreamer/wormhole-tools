# Wormcraft Example — Counter

A complete walkthrough of deploying and managing a cross-chain contract using **wormcraft**.

The example uses two contracts:
- `Counter.sol` — a minimal non-upgradeable counter (simplest possible case)
- `CounterV1` / `CounterV2` — an upgradeable counter that demonstrates cross-chain upgrade via `worm deploy upgrade`

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20 | https://nodejs.org |
| Foundry | latest | `curl -L https://foundry.paradigm.xyz \| bash` |
| wormcraft | latest | `npm install -g wormcraft` |

### Environment

Create `~/.wormcraft/.env` (or export the vars directly):

```bash
# Required — funded testnet private key (no 0x prefix)
WORMCRAFT_PRIVATE_KEY=your_private_key_here

# RPC endpoints for each chain you want to use
WORMCRAFT_ETH_SEPOLIA_RPC=https://rpc.sepolia.org
WORMCRAFT_BASE_SEPOLIA_RPC=https://sepolia.base.org
WORMCRAFT_ARB_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc

# Also used by the Foundry scripts
DEPLOYER_PRIVATE_KEY=your_private_key_here
```

---

## Part 1 — Simple Counter (no upgrade)

`Counter.sol` is a plain contract with no dependencies. Deploy it to a single chain using
`wormcraft deploy multi`, or to multiple chains simultaneously.

### Build

```bash
cd example
forge build
```

### Compute the deployment address (no wallet needed)

```bash
wormcraft deploy address \
  --artifact out/Counter.sol/Counter.json \
  --salt     counter-v1 \
  --deployer 0x0aA4B5899bAF7326397b1041db9c854056126F57
```

Output:
```json
{
  "address": "0x...",
  "salt": "0x...",
  "initCodeHash": "0x..."
}
```

### Deploy to one chain

```bash
wormcraft deploy multi \
  --artifact out/Counter.sol/Counter.json \
  --salt     counter-v1 \
  --source   sepolia
```

### Deploy to multiple chains at once

```bash
wormcraft deploy multi \
  --artifact out/Counter.sol/Counter.json \
  --salt     counter-v1 \
  --source   sepolia \
  --targets  base-sepolia,arbitrum-sepolia \
  --value    1000000000000000   # ETH in wei for Wormhole relayer fees
```

### Check deployment status

```bash
wormcraft deploy status \
  --address 0x<counter_address> \
  --chains  sepolia,base-sepolia,arbitrum-sepolia
```

---

## Part 2 — Upgradeable Counter (CounterV1 → CounterV2)

This path uses the full Wormcraft infrastructure:

```
WormcraftDeployer  ←── orchestrates cross-chain deploy / upgrade
WormcraftProxy     ←── base class for your upgradeable contract
CounterV1          ←── your v1 implementation
CounterV2          ←── your v2 implementation (adds decrement)
```

### Step 1 — Bootstrap WormcraftDeployer

Run this **once per chain** to deploy the hub at a deterministic CREATE2 address.
The address will be identical on every chain as long as you use the same wallet.

Find the Wormhole Standard Relayer address for your chain at
https://docs.wormhole.com/wormhole/reference/contract-addresses.

```bash
# Ethereum Sepolia
forge script script/Bootstrap.s.sol \
  --rpc-url  $WORMCRAFT_ETH_SEPOLIA_RPC \
  --broadcast \
  --sig "run(address)" 0x7B1bD7a6b4E61c2a123AC6BC2cbfC614437D0470

# Base Sepolia
forge script script/Bootstrap.s.sol \
  --rpc-url  $WORMCRAFT_BASE_SEPOLIA_RPC \
  --broadcast \
  --sig "run(address)" 0x93BAD53DDfB6132b0aC8E37f6029163E17imge7c

# Arbitrum Sepolia
forge script script/Bootstrap.s.sol \
  --rpc-url  $WORMCRAFT_ARB_SEPOLIA_RPC \
  --broadcast \
  --sig "run(address)" 0x7B1bD7a6b4E61c2a123AC6BC2cbfC614437D0470
```

Note the printed `WormcraftDeployer deployed at:` address — it will be the same on all chains.

### Step 2 — Wire trusted senders

Each WormcraftDeployer needs to know which peer addresses to accept cross-chain messages from.
Run this **once per chain**, passing the Wormhole chain IDs of your two other peers.

```bash
# Common Wormhole testnet chain IDs:
#   Ethereum Sepolia  = 10002
#   Base Sepolia      = 10004
#   Arbitrum Sepolia  = 10003

# Run on Ethereum Sepolia — trust Base Sepolia (10004) and Arbitrum Sepolia (10003)
forge script script/Wire.s.sol \
  --rpc-url  $WORMCRAFT_ETH_SEPOLIA_RPC \
  --broadcast \
  --sig "run(uint16,uint16)" 10004 10003

# Run on Base Sepolia — trust Ethereum Sepolia (10002) and Arbitrum Sepolia (10003)
forge script script/Wire.s.sol \
  --rpc-url  $WORMCRAFT_BASE_SEPOLIA_RPC \
  --broadcast \
  --sig "run(uint16,uint16)" 10002 10003

# Run on Arbitrum Sepolia — trust Ethereum Sepolia (10002) and Base Sepolia (10004)
forge script script/Wire.s.sol \
  --rpc-url  $WORMCRAFT_ARB_SEPOLIA_RPC \
  --broadcast \
  --sig "run(uint16,uint16)" 10002 10004
```

### Step 3 — Deploy CounterV1 proxy

Run this **once per chain** to deploy the UUPS proxy at a deterministic address.

```bash
WORMCRAFT_DEPLOYER=0x<address_from_bootstrap>

# Ethereum Sepolia
forge script script/DeployProxy.s.sol \
  --rpc-url  $WORMCRAFT_ETH_SEPOLIA_RPC \
  --broadcast \
  --sig "run(address)" $WORMCRAFT_DEPLOYER

# Base Sepolia
forge script script/DeployProxy.s.sol \
  --rpc-url  $WORMCRAFT_BASE_SEPOLIA_RPC \
  --broadcast \
  --sig "run(address)" $WORMCRAFT_DEPLOYER

# Arbitrum Sepolia
forge script script/DeployProxy.s.sol \
  --rpc-url  $WORMCRAFT_ARB_SEPOLIA_RPC \
  --broadcast \
  --sig "run(address)" $WORMCRAFT_DEPLOYER
```

The script prints the proxy address. Because all inputs are deterministic, it will be the
same address on every chain.

### Step 4 — Call increment across chains

```bash
PROXY=0x<proxy_address>
INCREMENT_CALLDATA=$(cast calldata "increment()")

wormcraft deploy call \
  --target    $PROXY \
  --calldata  $INCREMENT_CALLDATA \
  --chains    sepolia,base-sepolia,arbitrum-sepolia \
  --deployer  $WORMCRAFT_DEPLOYER \
  --value     2000000000000000   # fees for 2 cross-chain deliveries
```

### Step 5 — Upgrade to CounterV2

First build and deploy the new implementation to every chain:

```bash
forge build

IMPL_V2_SALT="wormcraft-counter-v2-impl"

wormcraft deploy multi \
  --artifact out/CounterV2.sol/CounterV2.json \
  --salt     $IMPL_V2_SALT \
  --source   sepolia \
  --targets  base-sepolia,arbitrum-sepolia \
  --value    2000000000000000
```

Compute the new implementation address:

```bash
wormcraft deploy address \
  --artifact out/CounterV2.sol/CounterV2.json \
  --salt     $IMPL_V2_SALT \
  --deployer $WORMCRAFT_DEPLOYER
# → prints {"address": "0x<impl_v2>", ...}
```

Then upgrade the proxy on all chains simultaneously:

```bash
NEW_IMPL=0x<impl_v2_address>

wormcraft deploy upgrade \
  --proxy    $PROXY \
  --new-impl $NEW_IMPL \
  --chains   sepolia,base-sepolia,arbitrum-sepolia \
  --deployer $WORMCRAFT_DEPLOYER \
  --value    2000000000000000
```

Verify the upgrade by reading `version()` on any chain:

```bash
cast call $PROXY "version()(string)" --rpc-url $WORMCRAFT_ETH_SEPOLIA_RPC
# → "v2"
```

CounterV2 now supports `decrement()` in addition to `increment()`.

---

## Using wormcraft deploy run (manifest-based)

For projects with multiple contracts, you can describe the whole deployment in
`wormcraft.deploy.yaml` and run everything with one command.

### Generate a starter manifest

```bash
cd example
wormcraft deploy init
```

This scans the compiled artifacts and writes `wormcraft.deploy.yaml`.  Edit it to fill in
constructor args and target networks, then:

```bash
# Preview what would happen — no transactions sent
wormcraft deploy plan

# Execute
wormcraft deploy run

# Check diff between manifest and what is actually deployed
wormcraft deploy diff
```

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

# Ethereum Sepolia
forge script script/BootstrapModule.s.sol \
  --rpc-url  $WORMCRAFT_ETH_SEPOLIA_RPC \
  --broadcast \
  --sig "run(address,address)" $WORMHOLE_RELAYER $WORMCRAFT_DEPLOYER

# Base Sepolia
forge script script/BootstrapModule.s.sol \
  --rpc-url  $WORMCRAFT_BASE_SEPOLIA_RPC \
  --broadcast \
  --sig "run(address,address)" $WORMHOLE_RELAYER $WORMCRAFT_DEPLOYER

# Arbitrum Sepolia
forge script script/BootstrapModule.s.sol \
  --rpc-url  $WORMCRAFT_ARB_SEPOLIA_RPC \
  --broadcast \
  --sig "run(address,address)" $WORMHOLE_RELAYER $WORMCRAFT_DEPLOYER
```

The printed address is the same on every chain (same salt + same deployer key).

### Step 2 — One-time Safe setup (each chain, via Safe UI)

Generate the Safe transaction JSON for each chain:

```bash
WORMCRAFT_MODULE=0x<address_from_bootstrap_module>
YOUR_SAFE=0x<safe_address>
YOUR_WALLET=0x<wallet_that_runs_wormcraft_cli>

wormcraft module setup \
  --safe         $YOUR_SAFE \
  --module       $WORMCRAFT_MODULE \
  --source-chain 10002 \
  --authorized   $YOUR_WALLET
```

This outputs a JSON batch you import into **Safe > Transaction Builder > Load JSON**.
The batch does two things atomically:
1. `Safe.enableModule(wormcraftModuleAddress)` — lets WormcraftModule act on the Safe
2. `WormcraftModule.authorize(sourceChainId, yourWallet)` — called as a Safe tx so `msg.sender = Safe`

Repeat on each chain (changing `--source-chain` as needed).

### Step 3 — Deploy your proxy (no Wormcraft inheritance needed)

Your contract can be any standard UUPS or Transparent proxy. No Wormcraft imports required.
The only requirement: the Safe is the upgrade authority (set as the initial owner/admin).

```bash
# Example: plain UUPS proxy where the Safe is owner
forge script script/DeployProxy.s.sol \
  --rpc-url $WORMCRAFT_ETH_SEPOLIA_RPC --broadcast \
  --sig "run(address)" $YOUR_SAFE
```

### Step 4 — Cross-chain upgrade (one command)

```bash
PROXY=0x<proxy_address>
NEW_IMPL=0x<new_implementation_address>

wormcraft deploy upgrade \
  --proxy    $PROXY \
  --new-impl $NEW_IMPL \
  --safe     $YOUR_SAFE \
  --module   $WORMCRAFT_MODULE \
  --chains   sepolia,base-sepolia,arbitrum-sepolia \
  --value    2000000000000000
```

This triggers `Safe.execTransactionFromModule(proxy, upgradeToAndCall(...))` on every chain
in a single source transaction. The Safe's own modules (Zodiac Delay, OZ TimelockController,
Guard contracts) apply normally — Wormcraft never bypasses them.

### Trust model

| Actor | Role | Can be changed by |
|-------|------|-------------------|
| Your Safe | Upgrade authority | Safe N/M threshold |
| WormcraftModule | Cross-chain relay | No one (ownerless) |
| WormcraftDeployer | Message bus | No one (ownerless after Bootstrap) |
| `--authorized` wallet | Initiates upgrades | Safe tx to `WormcraftModule.authorize()` |

---

## Part 4 — No-inheritance path with WormcraftAdminModule + Safe + Timelock (production governance)

Use this path when your protocol already has its own admin system, or when you need
a governance delay before upgrades take effect. Zero Wormcraft imports in your contract.

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

### Step 1 — Deploy WormcraftAdminModule (each chain)

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

| Proxy standard | Governance model | Wormcraft imports in your contract |
|----------------|------------------|------------------------------------|
| UUPS + WormcraftProxy (Part 2) | WormcraftDeployer direct | Inherit `WormcraftProxy` |
| UUPS + WormcraftModule (Part 3) | Gnosis Safe N/M threshold | None — Safe is upgrade authority |
| UUPS + AdminModule (Part 4) | AdminModule + Timelock + Safe canceller | One address check in `_authorizeUpgrade` |
| Transparent + AdminModule (Part 4) | AdminModule + Timelock + Safe canceller | None |

---

## Contract overview

| Contract | Purpose |
|----------|---------|
| `Counter.sol` | Minimal non-upgradeable counter. Good starting point for simple deploys. |
| `CounterV1.sol` | Upgradeable counter (v1) — inherits `WormcraftProxy`, supports `increment()`. |
| `CounterV2.sol` | Upgradeable counter (v2) — adds `decrement()`. Storage-layout compatible with v1. |
| `CounterNoInheritance.sol` | UUPS upgradeable counter with no Wormcraft imports. Upgrade authorized by owner or `adminModule` address. |

| Script | Purpose |
|--------|---------|
| `Bootstrap.s.sol` | Deploys `WormcraftDeployer` at a deterministic address, sets relayer, renounces ownership. |
| `BootstrapModule.s.sol` | Deploys `WormcraftModule` at a deterministic address (ownerless Safe module). |
| `Wire.s.sol` | Registers peer `WormcraftDeployer` addresses as trusted Wormhole senders. |
| `DeployProxy.s.sol` | Deploys `CounterV1` implementation + ERC1967 proxy at deterministic addresses. |
| `DeployWithAdminModule.s.sol` | Deploys `CounterNoInheritance` implementation + ERC1967 proxy via CREATE2. |
