# Aptos Chain Integration Plan

**Goal:** Implement a production-grade `AptosChain` adapter for the `@wormcraft/sdk` and full `wormcraft aptos` CLI commands, focused on the specific pain points of Wormhole bridge developers on Aptos: coin type registration, balance/metadata for arbitrary coins, VAA consumed checks, wrapped asset discovery, and token bridge transfer workflows.

**Feature Branch:** `feat/aptos-integration`

**Wormhole Chain ID:** 22

---

## Developer Pain Points This Solves

| Pain point | What goes wrong today | What this plan delivers |
|---|---|---|
| Incoming bridge transfers fail silently | Receiving any Aptos coin requires `coin::register<T>` first — easy to miss | `wormcraft aptos coin-registered <addr> <type>` to diagnose + `wormcraft aptos coin-register <type>` to fix |
| Checking bridged token balance | Wrapped coins have long type strings; must know the exact `CoinStore<T>` address | `wormcraft aptos coin-balance <addr> <coin-type>` |
| Finding the coin type string for a bridged token | The wrapped coin type is a generated Move type — non-obvious to find | `wormcraft aptos bridge wrapped <chain> <addr>` |
| Getting token name/symbol/decimals | `CoinInfo<T>` resource must be read from the token bridge account | `wormcraft aptos coin-info <coin-type>` |
| Knowing if a VAA was already consumed | `consumed_vaas` table must be queried with correct key encoding | `wormcraft aptos wormhole vaa-consumed <chain> <emitter> <seq>` |
| Finding next emitter sequence for VAA tracking | `EmitterCap` resource is at the token bridge address; not obvious to locate | `wormcraft aptos wormhole emitter-sequence` |
| Initiating a bridge transfer with coin type args | `transfer_tokens::transfer_tokens<CoinType>` needs exact type string as generic arg | `wormcraft aptos bridge transfer <coin-type> <amount> --to-chain --to-addr` |
| Completing an inbound transfer | `complete_transfer::submit_vaa<CoinType>` — must find coin type first | `wormcraft aptos bridge redeem <vaa>` (runs wrapped lookup automatically) |
| Attesting a new Aptos token | `attest_token::attest_token<CoinType>` sequence non-obvious | `wormcraft aptos bridge attest <coin-type>` |

---

## Wormhole Module Addresses

### Mainnet

| Module | Address |
|---|---|
| Core bridge | `0x5bc11445584a763c1e11cc2a8c0e27bcf1b76f1543b0d64c32e3c57898c1d29` |
| Token bridge | `0x576410486a2da45eee6c949c995670112ddf2fbeedab20350d506328eefc9d4f` |
| NFT bridge | `0x1bdedcfad1e865f5c2d9fdae5a25c4ecf4b1f634d130a3de50ede3eebe3f33d5` |

### Testnet

| Module | Address |
|---|---|
| Core bridge | `0x7e0d19f51a1bde3a54dd6cccf5e10b42fb7c6dfd99a8da83da0ab4e71c5f6e4f` |
| Token bridge | `0x57a7c4cb5f0c0bf34d1dfd26a6825b9849f9898c92c0f5e20f48a0c6ba028f58` |

---

## Architecture Decisions

### EVM interface mapping

| `WormcraftChain` method | Aptos mapping |
|---|---|
| `getBalance(address)` | `aptos.getAccountAPTAmount({ accountAddress })` → octas |
| `call(address, data)` | `aptos.view({ payload: { function, typeArguments, functionArguments } })` |
| `sendTransaction(address, data)` | `build.simple` → `sign` → `submit.simple` → `waitForTransaction` |
| `waitForTransaction(hash)` | `aptos.waitForTransaction({ transactionHash })` → `UserTransactionResponse` |
| `getCode(address)` | `aptos.getAccountModules({ accountAddress })` → hex of JSON or `0x` |

### Call encoding

```
data = 0x + hex(JSON.stringify({ module, function, typeArguments, functionArguments }))
```

`to` = Aptos account address owning the module. Helpers `encodeAptosCall()` / `decodeAptosCallData()` exported from SDK.

### Address normalization

Aptos addresses have leading-zero ambiguity (`0x1` ≡ `0x000...001`). Always normalize through `AccountAddress.fromString()` before display.

---

## Phase 0 — Branch & Dependencies

### Task 0.1: Create feature branch

```bash
git checkout main && git pull && git checkout -b feat/aptos-integration
```

### Task 0.2: Install `@aptos-labs/ts-sdk`

```bash
npm install @aptos-labs/ts-sdk --workspace=packages/sdk
npm install @aptos-labs/ts-sdk --workspace=packages/cli
```

### Task 0.3: Update `packages/sdk/package.json`

```json
"@aptos-labs/ts-sdk": "^1.x.x"
```

### Task 0.4: Update `packages/sdk/src/deploy/registry.ts`

```typescript
{ wormholeChainId: 22, name: 'aptos',         defaultRpc: 'https://fullnode.mainnet.aptoslabs.com/v1' },
{ wormholeChainId: 22, name: 'aptos-testnet',  isTestnet: true, defaultRpc: 'https://fullnode.testnet.aptoslabs.com/v1' },
```

---

## Phase 1 — SDK: `AptosChain` Class

### Task 1.1: Create `packages/sdk/src/chains/aptos.ts`

Core `WormcraftChain` interface implementation plus the following Aptos-specific extension methods:

```typescript
export interface AptosCoinInfo {
  coinType: string;
  name: string;
  symbol: string;
  decimals: number;
  supply: bigint | null;   // null if supply tracking is disabled
}

// ─── Extension methods on AptosChain ──────────────────────────────────────────

/**
 * Get the balance of any Aptos coin type for an address.
 * After bridging, the received token is a wrapped coin type like
 * `0x576410...::coin::T` — use this to check if it arrived.
 * Reads: `0x1::coin::CoinStore<CoinType>` resource from the account.
 * Throws RpcError if the coin store is not registered (use coinIsRegistered first).
 */
async getCoinBalance(address: string, coinType: string): Promise<bigint>

/**
 * Get name, symbol, decimals, and supply for any Aptos coin type.
 * Reads the `0x1::coin::CoinInfo<CoinType>` resource from the coin's defining address.
 * Essential for working with wrapped tokens whose type string is auto-generated.
 */
async getCoinInfo(coinType: string): Promise<AptosCoinInfo>

/**
 * Check if an account has registered to receive a specific coin type.
 * On Aptos, `coin::register<T>()` must be called before any transfer of T can arrive.
 * Returns false if `CoinStore<CoinType>` resource does not exist at the address.
 */
async coinIsRegistered(address: string, coinType: string): Promise<boolean>

/**
 * Register an account to receive a specific coin type.
 * Calls `0x1::coin::register<CoinType>()`.
 * Must be done before redeeming a bridge transfer for that coin type.
 * Requires privateKey in config.
 */
async registerCoin(coinType: string): Promise<TransactionReceipt>

/**
 * Check if a specific VAA has already been consumed by the Aptos token bridge.
 * Queries `consumed_vaas::is_used` view function.
 * Prevents wasted gas on double-submit.
 */
async isVaaConsumed(
  emitterChain: number,
  emitterAddress: string,
  sequence: bigint,
  tokenBridgeAddress?: string,
): Promise<boolean>

/**
 * Get the next sequence number for the token bridge emitter.
 * Reads the `EmitterCap` resource stored at the token bridge address.
 * Returns the sequence that will be used by the next outbound message —
 * use this to build the Wormholescan URL before sending.
 */
async getTokenBridgeEmitterSequence(tokenBridgeAddress?: string): Promise<bigint>

/**
 * Find the Aptos coin type for a token bridged from another chain.
 * Queries the token bridge's wrapped asset registry:
 * `token_bridge::wrapped_asset::asset_meta<CoinType>` cannot be enumerated directly,
 * so this function calls the token bridge's `get_wrapped_asset_address` view function.
 * Returns the full coin type string (e.g. `0x576410...::coin::T`) or null if not registered.
 */
async getWrappedCoinType(
  foreignChain: number,
  foreignAddress: string,
  tokenBridgeAddress?: string,
): Promise<string | null>

/**
 * Initiate a Wormhole token bridge transfer from Aptos to another chain.
 * Calls: `token_bridge::transfer_tokens::transfer_tokens<CoinType>`
 * The coin type must be specified — use getWrappedCoinType or getCoinInfo to find it.
 * Returns the receipt and the emitter sequence number for VAA tracking.
 */
async initiateTokenBridgeTransfer(params: AptosTransferParams): Promise<{ receipt: TransactionReceipt; sequence: bigint }>

/**
 * Complete an inbound Wormhole token bridge transfer.
 * Calls: `token_bridge::complete_transfer::submit_vaa<CoinType>`
 * The coin type can be found with getWrappedCoinType(emitterChain, emitterAddress).
 * Before calling, verify coinIsRegistered — otherwise this will fail.
 */
async redeemTokenBridgeTransfer(vaaHex: string, coinType: string, tokenBridgeAddress?: string): Promise<TransactionReceipt>

/**
 * Attest an Aptos coin on the token bridge for the first time.
 * Required once before any transfers of that coin type can be initiated.
 * Calls: `token_bridge::attest_token::attest_token<CoinType>`
 */
async attestToken(coinType: string, tokenBridgeAddress?: string): Promise<TransactionReceipt>
```

### Task 1.2: Create `packages/sdk/src/chains/aptos-utils.ts`

```typescript
export interface AptosCallPayload {
  module: string;
  function: string;
  typeArguments?: string[];
  functionArguments?: unknown[];
}

export interface AptosTransferParams {
  coinType: string;
  amount: bigint;              // raw octas (or smallest unit for the coin)
  targetChain: number;
  targetAddress: `0x${string}`;
  relayerFee?: bigint;
  nonce?: number;
  tokenBridgeAddress?: string;
}

export function encodeAptosCall(payload: AptosCallPayload): `0x${string}`
export function decodeAptosCallData(data: `0x${string}`): AptosCallPayload

/** Normalize an Aptos address to lowercase 64-char hex with 0x prefix */
export function normalizeAptosAddress(address: string): string
```

### Task 1.3: Export from `packages/sdk/src/chains/index.ts`

```typescript
export { AptosChain } from './aptos.js';
export type { AptosChainConfig, AptosCoinInfo, AptosTransferParams } from './aptos.js';
export { encodeAptosCall, decodeAptosCallData, normalizeAptosAddress } from './aptos-utils.js';
export type { AptosCallPayload } from './aptos-utils.js';
```

---

## Phase 2 — CLI: `wormcraft aptos` Commands

### Task 2.1: Create `packages/cli/src/commands/aptos.ts`

**`wormcraft aptos info`**
Print chain info, Wormhole module addresses, and current RPC URL.

**`wormcraft aptos balance <address>`**
Get APT balance in octas + formatted APT.

**`wormcraft aptos tx <tx-hash>`**
Get transaction status. `blockNumber` is the Aptos transaction version (monotonic u64).

**`wormcraft aptos coin-balance <address> <coin-type>`**
Get the balance of a specific Aptos coin for an address.
Used after bridging to check if the wrapped token arrived.
```
wormcraft aptos coin-balance 0xabc... "0x576410...::coin::T"
# Output: { address, coinType, balanceRaw: "1000000", decimals: 6, uiBalance: "1.000000" }
```
If the coin store is not registered, prints a clear error: "coin not registered — run `wormcraft aptos coin-register <type>` first".

**`wormcraft aptos coin-info <coin-type>`**
Get metadata for any Aptos coin: name, symbol, decimals, supply.
```
wormcraft aptos coin-info "0x1::aptos_coin::AptosCoin"
wormcraft aptos coin-info "0x576410...::coin::T"
```

**`wormcraft aptos coin-registered <address> <coin-type>`**
Check if an address has registered to receive a coin type.
This is the first diagnostic to run before attempting a bridge redemption.
```
wormcraft aptos coin-registered 0xabc... "0x576410...::coin::T"
# Output: { address, coinType, registered: false }
```

**`wormcraft aptos coin-register <coin-type>`**
Register the configured account to receive a specific coin type.
Required before redeeming any bridge transfer for that coin.
```
WORMCRAFT_APTOS_PRIVATE_KEY=0x... \
  wormcraft aptos coin-register "0x576410...::coin::T"
```

**`wormcraft aptos wormhole vaa-consumed <emitter-chain> <emitter-address> <sequence>`**
Check if a specific VAA has been processed by the Aptos token bridge.
```
wormcraft aptos wormhole vaa-consumed 2 0x000...3ee18b2214aff97 42
# Output: { emitterChain: 2, sequence: "42", consumed: false }
```

**`wormcraft aptos wormhole emitter-sequence`**
Get the current sequence number for the Aptos token bridge emitter.
Returns the sequence the next outbound message will use — pass to Wormholescan to pre-build tracking URL.
```
wormcraft aptos wormhole emitter-sequence
# Output: { tokenBridgeAddress: "0x576...", nextSequence: "157" }
```

**`wormcraft aptos bridge wrapped <foreign-chain-id> <foreign-address>`**
Find the Aptos coin type for a token from another chain.
```
wormcraft aptos bridge wrapped 2 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
# Output: { foreignChain: 2, foreignAddress: "0xA0b...", aptosCoinType: "0x576410...::coin::T" }
```

**`wormcraft aptos bridge transfer <coin-type> <amount>`**
Initiate a token bridge transfer from Aptos to another chain.
Options: `--to-chain <id>`, `--to-addr <0x32bytehex>`, `--fee <octas>`.
```
WORMCRAFT_APTOS_PRIVATE_KEY=0x... \
  wormcraft aptos bridge transfer "0x1::aptos_coin::AptosCoin" 100000000 \
    --to-chain 2 \
    --to-addr 0x000000000000000000000000ab5801a7d398351b8be11c439e05c5b3259aec9b
```
Output includes sequence number for Wormholescan tracking.

**`wormcraft aptos bridge redeem <vaa-hex>`**
Complete an inbound token bridge transfer.
Options: `--coin-type <type>` — if omitted, the CLI runs `bridge wrapped` automatically
using the VAA's emitter chain and address.
Pre-checks `coinIsRegistered` and prints a fix command if not registered.
```
WORMCRAFT_APTOS_PRIVATE_KEY=0x... \
  wormcraft aptos bridge redeem 01000000...
# If coin type found automatically: prints resolved type and proceeds
# If not registered: "run `wormcraft aptos coin-register 0x576...::coin::T` first"
```

**`wormcraft aptos bridge attest <coin-type>`**
Attest an Aptos coin so it can be bridged out for the first time.
```
WORMCRAFT_APTOS_PRIVATE_KEY=0x... \
  wormcraft aptos bridge attest "0x1::aptos_coin::AptosCoin"
```

### Task 2.2: Register in `packages/cli/src/main.ts`

```typescript
import { registerAptosCommand } from './commands/aptos.js';
registerAptosCommand(program);
```

### Task 2.3: Update `packages/cli/src/commands/completion.ts`

```typescript
cmds=(parse info generate status latency deploy transfer tokens submit redeem evm solana aptos completion)
```

---

## Phase 3 — Environment Variables

| Variable | Purpose |
|---|---|
| `WORMCRAFT_APTOS_RPC` | Full-node URL |
| `WORMCRAFT_APTOS_PRIVATE_KEY` | Ed25519 private key (0x-prefixed 32-byte hex) |
| `WORMCRAFT_APTOS_MAX_GAS` | Max gas amount (default 200000) |
| `WORMCRAFT_APTOS_GAS_PRICE` | Gas unit price in octas (default 100) |
| `WORMCRAFT_APTOS_NETWORK` | `mainnet` / `testnet` / `devnet` |

---

## Phase 4 — Tests

### Task 4.1: Unit tests — `packages/sdk/tests/chains/aptos.test.ts`

Mock `@aptos-labs/ts-sdk`. Cover:

- `getBalance(address)` → `BigInt(octas)`, RPC error → `RpcError`
- `getCoinBalance(address, coinType)` — mock `getAccountResource('0x1::coin::CoinStore<T>')` returning `{ coin: { value: "1000000" } }` → `1000000n`
- `getCoinBalance` when coin not registered → `RpcError` with helpful message
- `getCoinInfo(coinType)` — mock `getAccountResource('0x1::coin::CoinInfo<T>')` returning info object, assert shape
- `coinIsRegistered(address, coinType)` — resource exists → `true`; resource not found → `false`
- `registerCoin(coinType)` without key → `RpcError('aptos', 'privateKey required…')`
- `registerCoin` success — mock build/sign/submit/wait, assert called with `0x1::coin::register<CoinType>`
- `isVaaConsumed` — mock `aptos.view()` returning `[true]` → `true`, `[false]` → `false`
- `getTokenBridgeEmitterSequence` — mock view function, assert returns bigint
- `getWrappedCoinType(2, '0xA0b...')` — mock view function returning coin type string, assert string
- `getWrappedCoinType` for unknown asset → `null`
- `sendTransaction` without key → `RpcError`
- `waitForTransaction` success → `{ success: true, blockNumber: BigInt(version) }`
- `waitForTransaction` failure → `{ success: false }`

### Task 4.2: Unit tests — `packages/sdk/tests/chains/aptos-utils.test.ts`

- `encodeAptosCall` / `decodeAptosCallData` round-trip with all fields
- `normalizeAptosAddress('0x1')` → `'0x0000000000000000000000000000000000000000000000000000000000000001'`
- `normalizeAptosAddress` already-full address → unchanged
- `decodeAptosCallData` with non-JSON hex → throws

### Task 4.3: Integration smoke — `packages/sdk/tests/integration/aptos.smoke.ts`

Skip unless `WORMCRAFT_APTOS_RPC` set (testnet):
- `getBalance('0x1')` → large number
- `getCoinInfo('0x1::aptos_coin::AptosCoin')` → `{ symbol: 'APT', decimals: 8 }`
- `coinIsRegistered('0x1', '0x1::aptos_coin::AptosCoin')` → `true`
- `getTokenBridgeEmitterSequence()` → positive bigint
- `getWrappedCoinType(2, '0xA0b86991...')` on testnet (may be null if not attested yet)

---

## Phase 5 — Known Quirks & Gotchas

1. **Coin registration is mandatory.** `coin::register<T>()` must be called for every coin type before it can be received. This is the #1 cause of failed bridge redemptions on Aptos. The `redeemTokenBridgeTransfer` method should call `coinIsRegistered` before submitting and return a clear error with the fix command if not registered.

2. **Transaction version vs. block number.** Aptos uses a global monotonic version number (not block heights). Maps cleanly to `TransactionReceipt.blockNumber`.

3. **Type argument exact matching.** Move type arguments are case-sensitive and must be the fully-qualified, normalized form. `0x1::aptos_coin::AptosCoin` ≠ `0x0000...0001::aptos_coin::AptosCoin`. Always run through `normalizeAptosAddress` on the address portion.

4. **View functions vs. entry functions.** Only functions annotated `#[view]` can be called via the `/view` endpoint. The `call()` method targets these. Entry functions need `sendTransaction`. Attempting to call a non-view function via `/view` returns an error — catch it and suggest using `send` instead.

5. **Sequence prediction.** `getTokenBridgeEmitterSequence` reads the current sequence. The actual sequence used by the next transaction is this value — Aptos increments it after use. Since Aptos has fast finality and sequential account numbers, this is reliable for pre-building tracking URLs.

---

## Phase 6 — Quality Gate

```bash
npm run build --workspaces
npm run typecheck --workspaces
npm test --workspaces
npm run lint --workspaces

# Testnet smoke (no key needed for read-only)
WORMCRAFT_APTOS_RPC=https://fullnode.testnet.aptoslabs.com/v1 wormcraft aptos coin-info "0x1::aptos_coin::AptosCoin"
wormcraft aptos wormhole emitter-sequence --network testnet
wormcraft aptos bridge wrapped 2 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --network testnet
```
