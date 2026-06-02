# NEAR Chain Integration Plan

**Goal:** Implement a production-grade `NearChain` adapter for the `@wormcraft/sdk` and full `wormcraft near` CLI commands, focused on the specific pain points of Wormhole bridge developers on NEAR: NEP-141 storage registration, token balance/metadata, VAA submission, and bridge transfer workflows.

**Feature Branch:** `feat/near-integration`

**Wormhole Chain ID:** 15

---

## Developer Pain Points This Solves

| Pain point | What goes wrong today | What this plan delivers |
|---|---|---|
| Incoming bridge transfers silently bounce | NEP-141 requires `storage_deposit` before you can receive tokens — most users skip it | `wormcraft near storage-balance` to diagnose + `wormcraft near storage-deposit` to fix |
| Checking bridged token balance | NEP-141 `ft_balance_of` is a different RPC call from NEAR balance | `wormcraft near ft-balance <contract> <account>` |
| Finding what token contract a bridged asset lives at | NEAR token bridge creates sub-accounts with a hash-based naming scheme | `wormcraft near bridge wrapped <chain> <addr>` |
| Knowing the exact message format for `ft_transfer_call` | Token bridge requires a specific JSON message string in the `msg` field | `wormcraft near bridge transfer` handles encoding |
| Avoiding gas waste on already-processed VAAs | No easy way to check if a VAA was already submitted | `wormcraft near wormhole vaa-consumed <chain> <emitter> <seq>` |
| Knowing how much deposit to attach to a Wormhole message | `message_fee` changes and must be queried from the core bridge | `wormcraft near wormhole fee` |
| Getting token name/symbol/decimals for a bridged coin | Must call `ft_metadata` manually with JSON-RPC | `wormcraft near ft-metadata <contract>` |
| Completing an inbound transfer | Must base64-encode VAA and call `submit_vaa` on the correct contract | `wormcraft near bridge redeem <vaa>` |

---

## Wormhole Contract Account IDs

### Mainnet

| Contract | Account ID |
|---|---|
| Core bridge | `contract.wormhole_core.near` |
| Token bridge | `contract.portalbridge.near` |

### Testnet

| Contract | Account ID |
|---|---|
| Core bridge | `wormhole.wormhole.testnet` |
| Token bridge | `token.wormhole.testnet` |

---

## Architecture Decisions

### EVM interface mapping

| `WormcraftChain` method | NEAR mapping |
|---|---|
| `getBalance(accountId)` | `view_account` query → `amount` (liquid yoctoNEAR) |
| `call(contractId, data)` | `call_function` view query; data is JSON-over-hex `{ method, args }` |
| `sendTransaction(contractId, data, value)` | `functionCall` action; `value` = attached deposit in yoctoNEAR |
| `waitForTransaction(hash)` | `provider.txStatus(hash, sender, 'EXECUTED')` — requires sender ID |
| `getCode(accountId)` | `view_code` query → hex of WASM, or `0x` |

### Call encoding

```
data = 0x + hex(JSON.stringify({ method, args, attachedGasTGas? }))
```

`to` = NEAR account ID. Helpers `encodeNearCall()` / `decodeNearCallData()` exported from SDK.

---

## Phase 0 — Branch & Dependencies

### Task 0.1: Create feature branch

```bash
git checkout main && git pull && git checkout -b feat/near-integration
```

### Task 0.2: Install dependencies

```bash
npm install near-api-js --workspace=packages/sdk
npm install near-api-js --workspace=packages/cli
```

### Task 0.3: Update `packages/sdk/package.json`

```json
"near-api-js": "^5.x.x"
```

### Task 0.4: Update `packages/sdk/src/deploy/registry.ts`

```typescript
{ wormholeChainId: 15, name: 'near',         defaultRpc: 'https://rpc.mainnet.near.org' },
{ wormholeChainId: 15, name: 'near-testnet',  isTestnet: true, defaultRpc: 'https://rpc.testnet.near.org' },
```

---

## Phase 1 — SDK: `NearChain` Class

### Task 1.1: Create `packages/sdk/src/chains/near.ts`

Core `WormcraftChain` interface implementation (getBalance, call, sendTransaction, waitForTransaction, getCode) plus the following NEAR-specific extension methods:

```typescript
export interface NearFtMetadata {
  spec: string;        // e.g. "ft-1.0.0"
  name: string;        // e.g. "USD Coin"
  symbol: string;      // e.g. "USDC"
  decimals: number;    // e.g. 6
  icon?: string | null;
}

export interface NearStorageBalance {
  total: bigint;       // yoctoNEAR
  available: bigint;   // yoctoNEAR
}

export interface NearAccountState {
  accountId: string;
  balanceYocto: bigint;
  lockedYocto: bigint;  // staked
  storageUsageBytes: number;
  codeHash: string;     // "11111…" means no contract deployed
}

// ─── Extension methods on NearChain ────────────────────────────────────────────

/**
 * Get the NEP-141 fungible token balance for an account.
 * This is how you check if bridged tokens arrived — they live in an NEP-141 contract,
 * not as NEAR balance.
 * Calls: ft_balance_of({ account_id })
 * Returns raw balance as bigint (apply decimals from ft_metadata for human display).
 */
async getFtBalance(tokenContractId: string, accountId: string): Promise<bigint>

/**
 * Get NEP-141 token metadata: name, symbol, decimals, spec version.
 * Call this to humanize any bridged token contract.
 * Calls: ft_metadata()
 */
async getFtMetadata(tokenContractId: string): Promise<NearFtMetadata>

/**
 * Check if an account has registered storage on a NEP-141 token contract.
 * THE most common cause of failed bridge transfers on NEAR:
 * if storage is not registered, incoming ft_transfer calls are silently refunded.
 * Calls: storage_balance_of({ account_id })
 * Returns null if the account has NO storage registered (transfers will bounce).
 */
async getStorageBalance(tokenContractId: string, accountId: string): Promise<NearStorageBalance | null>

/**
 * Pay storage deposit for an account on a token contract.
 * Fixes the most common NEAR bridge failure: unregistered storage.
 * Default deposit is 0.00125 NEAR (the standard NEP-145 minimum).
 * Calls: storage_deposit({ account_id, registration_only: true })
 * Requires privateKey + accountId in config.
 */
async payStorageDeposit(
  tokenContractId: string,
  beneficiaryAccountId: string,
  depositYocto?: bigint,
): Promise<TransactionReceipt>

/**
 * Query the current Wormhole message fee on NEAR.
 * You must attach at least this amount of yoctoNEAR when calling the core bridge.
 * Calls: message_fee() on the core bridge contract.
 */
async getWormholeMessageFee(coreBridgeId?: string): Promise<bigint>

/**
 * Check if a specific VAA has already been consumed by the NEAR core bridge.
 * Prevents submitting duplicate VAAs and wasting gas.
 * Calls: is_used({ chain_id, sequence, emitter_address }) on the core bridge.
 */
async isVaaConsumed(
  emitterChain: number,
  emitterAddress: string,
  sequence: bigint,
  coreBridgeId?: string,
): Promise<boolean>

/**
 * Find the NEAR token contract for a token bridged from another chain.
 * The NEAR token bridge generates sub-accounts of the form `<hash>.token.wormhole.near`.
 * Calls: get_wrapped_asset({ chain_id, address }) on the token bridge contract.
 * Returns the NEAR account ID of the wrapped token, or null if not yet registered.
 */
async getWrappedTokenContract(
  foreignChain: number,
  foreignAddress: string,
  tokenBridgeId?: string,
): Promise<string | null>

/**
 * Complete an inbound Wormhole token bridge transfer on NEAR.
 * Calls: submit_vaa({ vaa: base64EncodedVAA }) on the token bridge contract.
 * Returns the transaction receipt.
 * NOTE: Before calling this, verify the recipient has storage registered on the token contract
 * using getStorageBalance — otherwise the transfer will succeed on-chain but tokens will bounce back.
 */
async redeemTokenBridgeTransfer(vaaHex: string, tokenBridgeId?: string): Promise<TransactionReceipt>

/**
 * Initiate a token bridge transfer from NEAR to another chain.
 * Uses ft_transfer_call — the NEP-141 cross-contract transfer mechanism.
 * The `msg` field must contain a specific JSON payload that encodes the recipient chain and address.
 * This method handles the msg encoding automatically.
 * msg format: { "receiver_id": tokenBridgeId, "amount": amount, "msg": JSON.stringify({ chain, recipient, fee, nonce }) }
 */
async initiateTokenBridgeTransfer(params: NearTransferParams): Promise<{ receipt: TransactionReceipt; sequence: bigint }>

/**
 * Attest a NEAR NEP-141 token on the token bridge so it can be bridged out.
 * Must be done once per token before it can be transferred cross-chain.
 * Calls: attest_token({ token_account }) on the token bridge.
 */
async attestToken(tokenContractId: string, tokenBridgeId?: string): Promise<TransactionReceipt>
```

### Task 1.2: Create `packages/sdk/src/chains/near-utils.ts`

```typescript
export interface NearCallPayload {
  method: string;
  args?: Record<string, unknown>;
  attachedGasTGas?: number;
}

export interface NearTransferParams {
  tokenContractId: string;
  amount: bigint;              // raw units (no decimals)
  targetChain: number;
  /** 32-byte recipient address as 0x-prefixed hex */
  targetAddress: `0x${string}`;
  relayerFee?: bigint;
  nonce?: number;
  tokenBridgeId?: string;
}

export function encodeNearCall(payload: NearCallPayload): `0x${string}`
export function decodeNearCallData(data: `0x${string}`): NearCallPayload

/** Encode the token bridge transfer msg field */
export function encodeNearTokenBridgeMsg(params: {
  targetChain: number;
  targetAddress: `0x${string}`;
  relayerFee?: bigint;
  nonce?: number;
}): string
```

### Task 1.3: Export from `packages/sdk/src/chains/index.ts`

```typescript
export { NearChain } from './near.js';
export type { NearChainConfig, NearFtMetadata, NearStorageBalance, NearAccountState, NearTransferParams } from './near.js';
export { encodeNearCall, decodeNearCallData, encodeNearTokenBridgeMsg } from './near-utils.js';
export type { NearCallPayload } from './near-utils.js';
```

---

## Phase 2 — CLI: `wormcraft near` Commands

### Task 2.1: Create `packages/cli/src/commands/near.ts`

**`wormcraft near info`**
Print chain info, Wormhole contract account IDs, and RPC URL.

**`wormcraft near balance <account-id>`**
Get NEAR account balance (liquid yoctoNEAR + formatted NEAR).

**`wormcraft near tx <tx-hash>`**
Get status of a transaction. Requires `--sender <accountId>` because NEAR RPC takes `(hash, sender)`.

**`wormcraft near ft-balance <token-contract> <account-id>`**
Get NEP-141 token balance. Fetches `ft_metadata` automatically to show `uiBalance` alongside the raw amount.
```
wormcraft near ft-balance usdc.token.wormhole.near alice.near
# Output: { contract: "usdc.token.wormhole.near", account: "alice.near",
#           balanceRaw: "1000000", decimals: 6, uiBalance: "1.000000" }
```

**`wormcraft near ft-metadata <token-contract>`**
Show name, symbol, decimals, and spec for any NEP-141 token contract.
```
wormcraft near ft-metadata wrap.near
```

**`wormcraft near storage-balance <token-contract> <account-id>`**
Check storage registration status for an account on a token contract.
This is the first diagnostic to run when bridge transfers are not arriving.
Returns `{ registered: true/false, total, available }`.
If `registered: false`, run `storage-deposit` before attempting any bridge transfer to that account.
```
wormcraft near storage-balance usdc.token.wormhole.near alice.near
```

**`wormcraft near storage-deposit <token-contract> <account-id>`**
Pay the storage registration deposit for an account on a token contract.
Default amount is 1.25 milliNEAR (standard NEP-145 minimum); override with `--amount <yocto>`.
Requires `WORMCRAFT_NEAR_PRIVATE_KEY` + `WORMCRAFT_NEAR_ACCOUNT_ID`.
```
WORMCRAFT_NEAR_PRIVATE_KEY=ed25519:... WORMCRAFT_NEAR_ACCOUNT_ID=alice.near \
  wormcraft near storage-deposit usdc.token.wormhole.near bob.near
```

**`wormcraft near wormhole fee`**
Query the current Wormhole message fee from the core bridge contract.
```
wormcraft near wormhole fee
wormcraft near wormhole fee --network testnet
# Output: { feeyoctoNear: "1250000000000000000000", feeNear: "0.00125" }
```

**`wormcraft near wormhole vaa-consumed <emitter-chain> <emitter-address> <sequence>`**
Check if a specific VAA has already been processed by the NEAR core bridge.
Prevents wasted gas on duplicate submissions.
```
wormcraft near wormhole vaa-consumed 2 0x0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585 42
```

**`wormcraft near bridge wrapped <foreign-chain-id> <foreign-address>`**
Find the NEAR token contract for a token originally from another chain.
```
wormcraft near bridge wrapped 2 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
# Output: { foreignChain: 2, foreignAddress: "0xA0b...", nearContract: "3edt7tl5de5e1l1.token.wormhole.near" }
```

**`wormcraft near bridge redeem <vaa-hex>`**
Complete an inbound token bridge transfer.
Automatically base64-encodes the VAA and calls `submit_vaa` on `contract.portalbridge.near`.
WARNING: prints a diagnostic if recipient storage is not registered.
```
WORMCRAFT_NEAR_PRIVATE_KEY=ed25519:... WORMCRAFT_NEAR_ACCOUNT_ID=alice.near \
  wormcraft near bridge redeem 01000000...
```

**`wormcraft near bridge transfer <token-contract> <amount>`**
Initiate an outbound token bridge transfer from NEAR.
Options: `--to-chain <id>`, `--to-addr <0x32bytehex>`, `--fee <yocto>`.
Handles the `ft_transfer_call` encoding automatically.
```
WORMCRAFT_NEAR_PRIVATE_KEY=ed25519:... WORMCRAFT_NEAR_ACCOUNT_ID=alice.near \
  wormcraft near bridge transfer usdc.token.wormhole.near 1000000 \
    --to-chain 2 \
    --to-addr 0x000000000000000000000000ab5801a7d398351b8be11c439e05c5b3259aec9b
```

**`wormcraft near bridge attest <token-contract>`**
Attest a NEAR NEP-141 token on the token bridge for the first time.
Required once before any transfers of that token can be initiated.
```
WORMCRAFT_NEAR_PRIVATE_KEY=ed25519:... WORMCRAFT_NEAR_ACCOUNT_ID=alice.near \
  wormcraft near bridge attest wrap.near
```

### Task 2.2: Register in `packages/cli/src/main.ts`

```typescript
import { registerNearCommand } from './commands/near.js';
registerNearCommand(program);
```

### Task 2.3: Update `packages/cli/src/commands/completion.ts`

```typescript
cmds=(parse info generate status latency deploy transfer tokens submit redeem evm solana near completion)
```

---

## Phase 3 — Environment Variables

| Variable | Purpose |
|---|---|
| `WORMCRAFT_NEAR_RPC` | NEAR RPC URL |
| `WORMCRAFT_NEAR_ACCOUNT_ID` | Signer account ID |
| `WORMCRAFT_NEAR_PRIVATE_KEY` | Ed25519 key (`ed25519:<base58>`) |
| `WORMCRAFT_NEAR_GAS_TGAS` | Default gas in TGas (default 100) |
| `WORMCRAFT_NEAR_NETWORK` | `mainnet` or `testnet` |

---

## Phase 4 — Tests

### Task 4.1: Unit tests — `packages/sdk/tests/chains/near.test.ts`

Mock `near-api-js`. Cover:

- `getBalance('alice.near')` → `BigInt(state.amount)`, RPC error → `RpcError`
- `getFtBalance(contract, account)` — mock `viewFunction('ft_balance_of')` returning `"1000000"` → `1000000n`
- `getFtMetadata(contract)` — mock `viewFunction('ft_metadata')` returning metadata object, assert shape
- `getStorageBalance(contract, account)` — registered: returns `{ total, available }`; unregistered: returns `null`
- `payStorageDeposit` without key → `RpcError('near', 'accountId and privateKey required…')`
- `payStorageDeposit` success — mock `functionCall`, assert called with `registration_only: true`
- `getWormholeMessageFee` — mock `viewFunction('message_fee')` returning `"1250000000000000000000"` → `1250000000000000000000n`
- `isVaaConsumed` returns false → `false`; returns true → `true`
- `getWrappedTokenContract` returning a NEAR account ID → string; returning null → `null`
- `sendTransaction` without key/accountId → `RpcError`
- `waitForTransaction` without accountId → `RpcError`
- `redeemTokenBridgeTransfer` — verify calls `submit_vaa` with base64-encoded VAA

### Task 4.2: Unit tests — `packages/sdk/tests/chains/near-utils.test.ts`

- `encodeNearCall` / `decodeNearCallData` round-trip
- `encodeNearTokenBridgeMsg` produces valid JSON with correct fields

### Task 4.3: Integration smoke — `packages/sdk/tests/integration/near.smoke.ts`

Skip unless `WORMCRAFT_NEAR_RPC` set (testnet):
- `getBalance('near')` — system account has balance > 0
- `getFtMetadata('wrap.testnet')` → `{ symbol: 'wNEAR' }`
- `getStorageBalance('wrap.testnet', 'near')` → non-null
- `getWormholeMessageFee` on testnet core bridge
- `isVaaConsumed` on a known historical VAA sequence → `true`

---

## Phase 5 — Known Quirks & Gotchas

1. **Storage registration is mandatory before receiving NEP-141 tokens.** This is the #1 cause of failed bridge transfers on NEAR. The `redeemTokenBridgeTransfer` implementation should proactively call `getStorageBalance` before submitting and either warn or auto-deposit.

2. **Transaction identification requires sender account ID.** NEAR's RPC `tx` endpoint takes `(hash, sender_account_id)`. `waitForTransaction` will throw without `accountId` in config. Document this prominently.

3. **NEAR token bridge sub-account naming.** Wrapped token contracts are named `<hex-hash>.token.wormhole.near`. The hash is derived from the foreign chain ID + foreign address using a specific algorithm. `getWrappedTokenContract` should query the bridge directly rather than computing the hash client-side.

4. **ft_transfer_call message encoding.** The `msg` field in `ft_transfer_call` must contain a specific JSON string expected by the token bridge. Any deviation causes a silent failure where tokens are transferred but not locked. Test this exact encoding against testnet.

5. **Gas on NEAR is cheap but fixed.** Each function call action must specify gas. 100 TGas is enough for most operations. Some token bridge operations (VAA verification) need up to 300 TGas — the `attachedGasTGas` override in the payload exists exactly for this.

---

## Phase 6 — Quality Gate

```bash
npm run build --workspaces
npm run typecheck --workspaces
npm test --workspaces
npm run lint --workspaces

# Testnet smoke (no key needed for read-only)
WORMCRAFT_NEAR_RPC=https://rpc.testnet.near.org wormcraft near wormhole fee --network testnet
wormcraft near ft-metadata wrap.testnet --network testnet
wormcraft near bridge wrapped 2 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --network testnet
```
