# Sui Chain Integration Plan

**Goal:** Implement a production-grade `SuiChain` adapter for the `@wormcraft/sdk` and full `wormcraft sui` CLI commands, focused on the specific pain points of Wormhole bridge developers on Sui: coin type discovery, VAA consumption checks, EmitterCap sequences, token bridge transfers, and object inspection.

**Feature Branch:** `feat/sui-integration`

**Wormhole Chain ID:** 21

---

## Developer Pain Points This Solves

| Pain point | What goes wrong today | What this plan delivers |
|---|---|---|
| Checking if bridged tokens arrived | Must know the exact coin type string (e.g. `0x5d4b302...::coin::COIN`) to query balance | `wormcraft sui coin-balance <addr>` lists all coins, `--coin-type` filters |
| Finding the wrapped coin type | No tool to map ETH USDC address → Sui coin type | `wormcraft sui bridge wrapped 2 0xA0b...` |
| Knowing if a VAA was already consumed | Must read token bridge state dynamic fields manually | `wormcraft sui wormhole vaa-consumed <vaa>` |
| Tracking emitter sequence for VAA polling | EmitterCap is an owned object — hard to read without knowing the object ID | `wormcraft sui wormhole emitter-sequence <cap-id>` |
| Checking the current bridge fee and guardian set | Core bridge state is a shared object with nested fields | `wormcraft sui wormhole state` |
| Initiating a token bridge transfer | PTB requires: split coin → transfer_tokens → publish_message in one block | `wormcraft sui bridge transfer <type> <amount> --to-chain --to-addr` |
| Completing an inbound transfer | PTB requires: parse_and_verify → authorize_transfer → redeem_coin hot-potato chain | `wormcraft sui bridge redeem <vaa>` |
| Getting coin name/symbol/decimals | Coin type string alone is not human-readable | `wormcraft sui coin-metadata <coin-type>` |
| Inspecting bridge state objects | Shared objects like core bridge state and token bridge state are opaque | `wormcraft sui object <object-id>` |

---

## Wormhole Object IDs

### Mainnet

| Object | ID |
|---|---|
| Core bridge state | `0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c` |
| Token bridge state | `0xc57508ee0d4595e5a8728974a4972b6a7c10a6f5d7bbe09029c2e882d6f3c1f4` |
| Wormhole package | `0x5306f64e312b581766351c07af79c72fcb1cd25147157fdc2f8ad76de9a3fb6a` |
| Token bridge package | `0x26efee2b51c911237888e5dc6702868abca3c7ac12c53f76ef8eba0697695e3d` |
| Clock (system) | `0x6` |

### Testnet

| Object | ID |
|---|---|
| Core bridge state | `0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790` |
| Token bridge state | `0xa6a3da85bbe05da5bfd953708d56f1a3a023e7fb58e5a824a3d4de3791e8f690` |

---

## Architecture Decisions

### EVM interface mapping

| `WormcraftChain` method | Sui mapping |
|---|---|
| `getBalance(address)` | `SuiClient.getBalance({ coinType: '0x2::sui::SUI' })` → MIST |
| `call(packageId, data)` | `devInspectTransactionBlock` with a Move call PTB; data is JSON-over-hex payload |
| `sendTransaction(packageId, data, value)` | Build PTB, sign with Ed25519Keypair, `signAndExecuteTransaction` |
| `waitForTransaction(digest)` | `SuiClient.waitForTransaction` |
| `getCode(address)` | `getNormalizedMoveModulesByPackage` → `0x` if not a package |

### Call encoding

Move calls require named module + function + type args + value args — there is no raw calldata equivalent. Encode as JSON-over-hex in the `data` field:

```
data = 0x + hex(JSON.stringify({ module, function, typeArgs, args }))
```

`to` = package object ID. Helpers `encodeSuiCall()` / `decodeSuiCallData()` are exported from the SDK.

---

## Phase 0 — Branch & Dependencies

### Task 0.1: Create feature branch

```bash
git checkout main && git pull && git checkout -b feat/sui-integration
```

### Task 0.2: Install `@mysten/sui`

```bash
npm install @mysten/sui --workspace=packages/sdk
npm install @mysten/sui --workspace=packages/cli
```

### Task 0.3: Update `packages/sdk/package.json`

```json
"@mysten/sui": "^1.x.x"
```

### Task 0.4: Update `packages/sdk/src/deploy/registry.ts`

```typescript
{ wormholeChainId: 21, name: 'sui',         defaultRpc: 'https://fullnode.mainnet.sui.io:443' },
{ wormholeChainId: 21, name: 'sui-testnet', isTestnet: true, defaultRpc: 'https://fullnode.testnet.sui.io:443' },
```

---

## Phase 1 — SDK: `SuiChain` Class

### Task 1.1: Create `packages/sdk/src/chains/sui.ts`

Core `WormcraftChain` interface implementation (same as original plan — `getBalance`, `call`, `sendTransaction`, `waitForTransaction`, `getCode`) plus the following Sui-specific extension methods:

```typescript
export interface SuiCoinBalance {
  coinType: string;
  coinObjectCount: number;
  totalBalance: bigint;
}

export interface SuiCoinMetadata {
  coinType: string;
  name: string;
  symbol: string;
  description: string;
  decimals: number;
  iconUrl: string | null;
}

export interface SuiWormholeState {
  guardianSetIndex: number;
  messageFee: bigint;
  chainId: number;
}

export interface SuiObjectContent {
  objectId: string;
  type: string;
  version: string;
  digest: string;
  content: unknown; // raw parsed fields from the chain
}

// ─── Extension methods on SuiChain ────────────────────────────────────────────

/**
 * Get balances for all coins owned by an address.
 * If coinType is provided, returns only that coin.
 * This is the primary way to check if bridged tokens arrived.
 */
async getAllCoinBalances(address: string, coinType?: string): Promise<SuiCoinBalance[]>

/**
 * Get human-readable metadata for a Sui coin type.
 * Use this to map a coin type string like
 * `0x5d4b302506645c37ff133b98c4b50a4ae1af26b272d2d24e015a1e1f7a4bb47c::coin::COIN`
 * to { name: "USD Coin", symbol: "USDC", decimals: 6 }.
 */
async getCoinMetadata(coinType: string): Promise<SuiCoinMetadata | null>

/**
 * Fetch the full content of any Sui object.
 * Essential for inspecting token bridge state, EmitterCap objects,
 * or any shared/owned object involved in the Wormhole flow.
 */
async getObject(objectId: string): Promise<SuiObjectContent | null>

/**
 * Read the Wormhole core bridge state object to get the current guardian set index,
 * message fee, and chain ID.
 * Reads: 0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c
 */
async getWormholeState(coreBridgeStateId?: string): Promise<SuiWormholeState>

/**
 * Check if a VAA has already been consumed by the token bridge.
 * The token bridge stores consumed VAAs in a `ConsumedVAAs` table inside its state object.
 * Uses devInspect to call token_bridge::complete_transfer::is_transfer_complete.
 * Returns true if the VAA has been redeemed, false if it is still pending.
 */
async isVaaConsumed(vaaHex: string, tokenBridgeStateId?: string): Promise<boolean>

/**
 * Get the current sequence number from an EmitterCap object.
 * EmitterCaps are owned objects in Sui Wormhole — each program that sends messages owns one.
 * The sequence number determines the VAA sequence for tracking on Wormholescan.
 * Returns { objectId, sequence, moduleAddress }.
 */
async getEmitterCapSequence(emitterCapObjectId: string): Promise<{ objectId: string; sequence: bigint; moduleAddress: string }>

/**
 * Find the Sui coin type for a token that was bridged from another chain.
 * The token bridge creates a WrappedAsset entry in its state for each registered token.
 * Uses devInspect to call token_bridge::state::verified_asset.
 *
 * Example: getWrappedCoinType(2, '0xA0b869...') returns
 * '0x5d4b302506645c37ff133b98c4b50a4ae1af26b272d2d24e015a1e1f7a4bb47c::coin::COIN'
 * for USDC bridged from Ethereum.
 */
async getWrappedCoinType(foreignChain: number, foreignAddress: `0x${string}`, tokenBridgeStateId?: string): Promise<string | null>

/**
 * Initiate a token bridge transfer from Sui to another chain.
 * Builds the full PTB in one call:
 *   1. split coins to exact amount
 *   2. token_bridge::transfer_tokens::transfer_tokens<CoinType>  → MessageTicket
 *   3. wormhole::publish_message::publish_message(state, MessageTicket, fee_coin, clock)
 * Returns the transaction digest and the sequence number (read from the WormholeMessage event).
 */
async initiateTokenBridgeTransfer(params: SuiTransferParams): Promise<{ digest: string; sequence: bigint; emitterAddress: string }>

/**
 * Complete an inbound token bridge transfer on Sui.
 * Builds the full PTB:
 *   1. wormhole::vaa::parse_and_verify(state, vaaBytes, clock)  → VAA hot potato
 *   2. token_bridge::complete_transfer::authorize_transfer<CoinType>(bridge_state, VAA)  → Receipt hot potato
 *   3. token_bridge::complete_transfer::redeem_coin<CoinType>(Receipt)  → Coin<T> sent to recipient
 * Requires knowing the coin type — use getWrappedCoinType first.
 */
async redeemTokenBridgeTransfer(vaaHex: string, coinType: string): Promise<TransactionReceipt>
```

### Task 1.2: Create `packages/sdk/src/chains/sui-utils.ts`

```typescript
export interface SuiCallPayload {
  module: string;
  function: string;
  typeArgs?: string[];
  args: string[];
}

export interface SuiTransferParams {
  /** Full coin type string e.g. "0x2::sui::SUI" or "0x5d4b...::coin::COIN" */
  coinType: string;
  /** Amount in the coin's base units (no decimals) */
  amount: bigint;
  /** Wormhole destination chain ID */
  targetChain: number;
  /** Recipient address as 32-byte 0x-prefixed hex */
  targetAddress: `0x${string}`;
  /** Relayer fee in base coin units. Default 0. */
  relayerFee?: bigint;
  /** Nonce for VAA dedup. Default 0. */
  nonce?: number;
  coreBridgeStateId?: string;
  tokenBridgeStateId?: string;
}

export function encodeSuiCall(payload: SuiCallPayload): `0x${string}`
export function decodeSuiCallData(data: `0x${string}`): SuiCallPayload
```

### Task 1.3: Export from `packages/sdk/src/chains/index.ts`

```typescript
export { SuiChain } from './sui.js';
export type { SuiChainConfig, SuiCoinBalance, SuiCoinMetadata, SuiWormholeState, SuiObjectContent, SuiTransferParams } from './sui.js';
export { encodeSuiCall, decodeSuiCallData } from './sui-utils.js';
export type { SuiCallPayload } from './sui-utils.js';
```

---

## Phase 2 — CLI: `wormcraft sui` Commands

### Task 2.1: Create `packages/cli/src/commands/sui.ts`

The CLI exposes the following subcommands:

**`wormcraft sui info`**
Prints chain info and all known object IDs for mainnet/testnet.

**`wormcraft sui balance <address>`**
Get native SUI balance in MIST + formatted SUI.
```
wormcraft sui balance 0x02a2...
```

**`wormcraft sui coin-balance <address>`**
List all coin balances for an address. After bridging, the new coin appears here.
Use `--coin-type` to filter to a specific coin type.
```
wormcraft sui coin-balance 0x02a2...
wormcraft sui coin-balance 0x02a2... --coin-type "0x5d4b3025...::coin::COIN"
```
Output includes `coinType`, `totalBalance`, `decimals` (from metadata), `uiBalance`.

**`wormcraft sui coin-metadata <coin-type>`**
Fetch name, symbol, description, decimals, and icon URL for any Sui coin type.
```
wormcraft sui coin-metadata "0x5d4b302506645c37ff133b98c4b50a4ae1af26b272d2d24e015a1e1f7a4bb47c::coin::COIN"
```

**`wormcraft sui object <object-id>`**
Inspect any Sui object — shows type, version, digest, and parsed Move fields.
Essential for debugging token bridge state objects and EmitterCaps.
```
wormcraft sui object 0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c
```

**`wormcraft sui tx <digest>`**
Get status of a transaction by digest (success, checkpoint, gas used).

**`wormcraft sui wormhole state`**
Read the Wormhole core bridge state object. Shows current guardian set index, message fee in MIST, and chain ID.
```
wormcraft sui wormhole state
wormcraft sui wormhole state --network testnet
```

**`wormcraft sui wormhole vaa-consumed <vaa-hex>`**
Check if a VAA has already been consumed by the Sui token bridge.
Returns `{ consumed: true/false, emitterChain, emitterAddress, sequence }`.
Saves gas — always call this before attempting a bridge redeem.
```
wormcraft sui wormhole vaa-consumed 01000000...
```

**`wormcraft sui wormhole emitter-sequence <emitter-cap-id>`**
Read the current sequence number from an EmitterCap object ID.
Returns `{ objectId, sequence, nextSequence }`.
Use this to predict the sequence number of an in-flight message for Wormholescan polling.
```
wormcraft sui wormhole emitter-sequence 0xabc123...
```

**`wormcraft sui bridge wrapped <foreign-chain-id> <foreign-address>`**
Find the Sui coin type string for a token bridged from another chain.
```
wormcraft sui bridge wrapped 2 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
```
Output: `{ foreignChain: 2, foreignAddress: "0xA0b...", suiCoinType: "0x5d4b...::coin::COIN" }`

**`wormcraft sui bridge transfer <coin-type> <amount>`**
Initiate a Wormhole token bridge transfer from Sui to another chain.
Options: `--to-chain <id>`, `--to-addr <0x32bytehex>`, `--fee <mist>`, `--gas-budget <mist>`.
Builds the full PTB (split → transfer_tokens → publish_message) in one transaction.
Returns `{ digest, sequence, emitterAddress }` for tracking on Wormholescan.
```
WORMCRAFT_SUI_PRIVATE_KEY=suiprivkey1q... \
  wormcraft sui bridge transfer "0x5d4b...::coin::COIN" 1000000 \
    --to-chain 2 \
    --to-addr 0x000000000000000000000000ab5801a7d398351b8be11c439e05c5b3259aec9b
```

**`wormcraft sui bridge redeem <vaa-hex>`**
Complete an inbound token bridge transfer. Requires knowing the coin type — run
`wormcraft sui bridge wrapped` first.
Options: `--coin-type <type>` (required).
Builds the full PTB (parse_and_verify → authorize_transfer → redeem_coin).
```
WORMCRAFT_SUI_PRIVATE_KEY=suiprivkey1q... \
  wormcraft sui bridge redeem 01000000... \
    --coin-type "0x5d4b...::coin::COIN"
```

### Task 2.2: Register in `packages/cli/src/main.ts`

```typescript
import { registerSuiCommand } from './commands/sui.js';
registerSuiCommand(program);
```

### Task 2.3: Update `packages/cli/src/commands/completion.ts`

```typescript
cmds=(parse info generate status latency deploy transfer tokens submit redeem evm solana sui completion)
```

---

## Phase 3 — Environment Variables

| Variable | Purpose |
|---|---|
| `WORMCRAFT_SUI_RPC` | Full-node RPC URL |
| `WORMCRAFT_SUI_PRIVATE_KEY` | Ed25519 key (bech32 `suiprivkey1q…` or base64) |
| `WORMCRAFT_SUI_GAS_BUDGET` | Default gas budget in MIST |
| `WORMCRAFT_SUI_NETWORK` | `mainnet` or `testnet` (selects default object IDs) |

---

## Phase 4 — Tests

### Task 4.1: Unit tests — `packages/sdk/tests/chains/sui.test.ts`

Mock `SuiClient`. Cover:

- `getBalance` — mock returns `{ totalBalance: "2000000000" }` → `2000000000n`
- `getBalance` RPC error → `RpcError('sui', …)`
- `getAllCoinBalances(address)` — mock `client.getAllBalances()` returning multiple coin types, assert array shape
- `getAllCoinBalances(address, coinType)` — mock `client.getBalance({ coinType })`, assert single entry
- `getCoinMetadata(coinType)` — mock `client.getCoinMetadata()`, assert `{ name, symbol, decimals }`
- `getCoinMetadata` for unknown type → returns `null`
- `getObject(objectId)` — mock `client.getObject({ showContent: true })`, assert content returned
- `getObject` for non-existent ID → returns `null`
- `getWormholeState` — mock `getObject` returning core bridge state with nested fields, assert `{ guardianSetIndex, messageFee, chainId }`
- `isVaaConsumed` — mock `devInspect` returning `[[["bool", "true"]]]` → `true`; `[[["bool", "false"]]]` → `false`
- `getEmitterCapSequence` — mock `getObject` returning EmitterCap with `sequence` field, assert `bigint`
- `sendTransaction` without `privateKey` → `RpcError('sui', 'privateKey required…')`
- `waitForTransaction(digest)` — mock `client.waitForTransaction` with effects, assert receipt fields

### Task 4.2: Unit tests — `packages/sdk/tests/chains/sui-utils.test.ts`

- `encodeSuiCall` / `decodeSuiCallData` round-trip
- Round-trip with optional fields omitted
- `decodeSuiCallData` with non-JSON hex → throws

### Task 4.3: Integration smoke — `packages/sdk/tests/integration/sui.smoke.ts`

Skip unless `WORMCRAFT_SUI_RPC` set:
- `getBalance` on a known testnet address
- `getCoinMetadata('0x2::sui::SUI')` → `{ symbol: 'SUI', decimals: 9 }`
- `getWormholeState()` → assert `guardianSetIndex >= 0`
- `getWrappedCoinType(2, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')` on testnet

---

## Phase 5 — Known Quirks & Gotchas

1. **Hot-potato PTBs.** `authorize_transfer` returns a `Receipt` hot potato that must be consumed in the same PTB. The `redeemTokenBridgeTransfer` method must build a single atomic PTB for the full three-step redemption — these cannot be split into separate transactions.

2. **Clock object.** Several Wormhole operations require passing Sui's system clock object (`0x6`) as an argument. The implementation must include it where required — most errors about "missing shared objects" in testnet are caused by forgetting the clock.

3. **Coin type normalization.** Sui coin type strings are case-sensitive and sometimes appear with or without leading zeros in the package address. Always normalize to lowercase with full 64-character hex address before using as a type argument.

4. **Message fee.** The `publish_message` call requires a `Coin<SUI>` split from gas to cover the message fee. Read the core bridge state's `message_fee` field before building the transfer PTB and split the exact required amount.

5. **EmitterCap ownership.** An `EmitterCap` is an owned object. To read its sequence, you need the specific object ID — it is not derivable from the program address alone. Users must provide it, or the CLI can query the program's published packages to find it.

---

## Phase 6 — Quality Gate

```bash
npm run build --workspaces
npm run typecheck --workspaces
npm test --workspaces
npm run lint --workspaces

# Mainnet smoke (no key needed)
wormcraft sui wormhole state
wormcraft sui bridge wrapped 2 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
wormcraft sui coin-metadata "0x2::sui::SUI"
wormcraft sui object 0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c
```
