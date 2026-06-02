# Solana Chain Integration Plan

**Goal:** Replace the removed `SolanaChain` stub with a production-grade adapter that covers the real pain points of Wormhole developers on Solana: SPL token balances, VAA submission, bridge redemption, emitter PDA derivation, guardian set queries, and initiated transfer tracking — all usable from both the SDK and the CLI.

**Feature Branch:** `feat/solana-integration`

**Wormhole Chain ID:** 1

---

## Developer Pain Points This Solves

The previous implementation gave users exactly one working feature: raw SOL balance in lamports. That is not useful for anyone doing cross-chain work. Here is what actually causes friction:

| Pain point | What goes wrong today | What this plan delivers |
|---|---|---|
| Completing an inbound transfer | 20+ lines of PDA math, multiple program calls, easy to get account ordering wrong | `wormcraft solana bridge redeem <vaa>` |
| Checking if a VAA was already redeemed | Must know the claim PDA derivation for each program | `wormcraft solana bridge redeemed <vaa>` |
| Finding the wrapped token mint after bridging | `findWrappedAsset` PDA derivation is not documented clearly | `wormcraft solana bridge wrapped <chain> <addr>` |
| Initiating a transfer out of Solana | Approve + transferTokens + approve authority PDAs — fragile | `wormcraft solana bridge transfer <mint> <amount> --to-chain --to-addr` |
| Attesting a new token | Requires Wormhole core + token bridge instructions in sequence | `wormcraft solana bridge attest <mint>` |
| Getting an emitter's sequence number | Must decode the `EmitterSequence` account manually | `wormcraft solana wormhole sequence <program>` |
| Knowing a guardian set on-chain | Must deserialize the `GuardianSet` Borsh account | `wormcraft solana wormhole guardian-set` |
| Checking SPL token balances after a bridge | Must derive the ATA and decode `TokenAccount` | `wormcraft solana balance <addr> --token <mint>` |

---

## Architecture

### SDK layer

`SolanaChain` implements `WormcraftChain` with a natural Solana mapping:

| `WormcraftChain` method | Solana mapping |
|---|---|
| `getBalance(address)` | `connection.getBalance(pubkey)` → SOL lamports |
| `call(programId, data)` | `connection.simulateTransaction(...)` — data is the instruction data |
| `sendTransaction(programId, data, lamports)` | Build a `Transaction` with one instruction, sign with keypair, send |
| `waitForTransaction(signature)` | `connection.confirmTransaction(signature, 'confirmed')` |
| `getCode(address)` | `connection.getAccountInfo(pubkey)` → `0x` if null, `0x01` if executable, hex of data if data account |

On top of this base, `SolanaChain` adds Solana-native and Wormhole-specific methods as an extension of the interface — callers that know they have a `SolanaChain` can use the full surface.

### Wormhole PDA utilities

A standalone `packages/sdk/src/chains/solana-wormhole.ts` module exports pure functions for all account derivations so they can be used independently of the `SolanaChain` class (useful for scripts and testing):

```
derivations (pure, no RPC):
  getEmitterPda(programId, coreBridgeId)
  getPostedVaaPda(vaaHash, coreBridgeId)
  getClaimPda(emitterAddress, emitterChain, sequence, programId)
  getWrappedMintPda(foreignChain, foreignAddress, tokenBridgeId)
  getCustodyPda(mint, tokenBridgeId)
  getTokenBridgeEmitterPda(tokenBridgeId, coreBridgeId)
  getMintAuthorityPda(tokenBridgeId)
```

---

## Wormhole Program Addresses

### Mainnet

| Program | Address |
|---|---|
| Core bridge | `worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth` |
| Token bridge | `wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb` |
| NFT bridge | `WnFt12ZrnzZrFZkt2xsNsaNWoQribnuQ5B5FrDbwDhD` |

### Testnet

| Program | Address |
|---|---|
| Core bridge | `3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5` |
| Token bridge | `DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe` |
| NFT bridge | `2rHhojZ7hpu1zA91nvZmT8TqWWvMcKmmNBCr2mKTtMq4` |

These go into `packages/sdk/src/deploy/registry.ts` as `wormholeCore` and new `tokenBridge` / `nftBridge` fields on the `ChainEntry` type.

---

## Phase 0 — Branch & Dependencies

### Task 0.1: Create feature branch

```bash
git checkout main
git pull
git checkout -b feat/solana-integration
```

### Task 0.2: Install dependencies

```bash
# SPL token library — ATA derivation, token account decoding, transfer instructions
npm install @solana/spl-token --workspace=packages/sdk
npm install @solana/spl-token --workspace=packages/cli

# Borsh — deserialize on-chain Wormhole account data (GuardianSet, PostedVAA, etc.)
npm install @coral-xyz/borsh --workspace=packages/sdk
```

`@solana/web3.js` is already installed. Verify:
```bash
node -e "import('@solana/web3.js').then(m => console.log(m.VERSION))"
node -e "import('@solana/spl-token').then(m => console.log(Object.keys(m).slice(0,5)))"
```

### Task 0.3: Update `packages/sdk/package.json`

```json
{
  "dependencies": {
    "@solana/web3.js": "^1.x.x",
    "@solana/spl-token": "^0.4.x",
    "@coral-xyz/borsh": "^0.x.x"
  }
}
```

### Task 0.4: Extend `ChainEntry` in `registry.ts`

```typescript
export interface ChainEntry {
  wormholeChainId: number;
  name: string;
  evmChainId?: number;
  defaultRpc?: string;
  wormholeCore?: string;        // was `0x${string}`, now plain string to support non-EVM addresses
  tokenBridge?: string;         // NEW
  nftBridge?: string;           // NEW
  wormToolDeployer?: `0x${string}`;
  isTestnet?: boolean;
}
```

Update the Solana entries:

```typescript
{
  wormholeChainId: 1,
  name: 'solana',
  defaultRpc: 'https://api.mainnet-beta.solana.com',
  wormholeCore: 'worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth',
  tokenBridge: 'wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb',
  nftBridge: 'WnFt12ZrnzZrFZkt2xsNsaNWoQribnuQ5B5FrDbwDhD',
},
{
  wormholeChainId: 1,
  name: 'solana-devnet',
  isTestnet: true,
  defaultRpc: 'https://api.devnet.solana.com',
  wormholeCore: '3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5',
  tokenBridge: 'DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe',
  nftBridge: '2rHhojZ7hpu1zA91nvZmT8TqWWvMcKmmNBCr2mKTtMq4',
},
```

---

## Phase 1 — SDK: Wormhole PDA Utilities

### Task 1.1: Create `packages/sdk/src/chains/solana-wormhole.ts`

This module is pure functions — no RPC, no classes. Everything is deterministic from the inputs.

```typescript
import { PublicKey } from '@solana/web3.js';

// ─── Mainnet defaults ───────────────────────────────────────────────────────
export const SOLANA_CORE_BRIDGE_MAINNET = 'worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth';
export const SOLANA_TOKEN_BRIDGE_MAINNET = 'wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb';
export const SOLANA_NFT_BRIDGE_MAINNET   = 'WnFt12ZrnzZrFZkt2xsNsaNWoQribnuQ5B5FrDbwDhD';

export const SOLANA_CORE_BRIDGE_DEVNET   = '3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5';
export const SOLANA_TOKEN_BRIDGE_DEVNET  = 'DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe';
export const SOLANA_NFT_BRIDGE_DEVNET    = '2rHhojZ7hpu1zA91nvZmT8TqWWvMcKmmNBCr2mKTtMq4';

// ─── Emitter PDA ─────────────────────────────────────────────────────────────
/**
 * Derive the Wormhole emitter PDA for a program.
 * The emitter address is the 32-byte public key that appears in the VAA's
 * emitterAddress field when that program calls post_message.
 *
 * Seeds: ["emitter"]
 */
export function getEmitterPda(
  programId: string,
  coreBridgeId: string = SOLANA_CORE_BRIDGE_MAINNET,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('emitter')],
    new PublicKey(programId),
  );
  void coreBridgeId; // included for API clarity / future use
  return pda;
}

/**
 * Convert a program's emitter PDA to the 32-byte hex string used in VAAs.
 */
export function getEmitterAddress(programId: string): `0x${string}` {
  const pda = getEmitterPda(programId);
  return ('0x' + Buffer.from(pda.toBytes()).toString('hex')) as `0x${string}`;
}

// ─── Posted VAA PDA ───────────────────────────────────────────────────────────
/**
 * Derive the account where the Wormhole core bridge stores a verified VAA.
 *
 * Seeds: ["PostedVAA", vaaHash (32 bytes)]
 */
export function getPostedVaaPda(
  vaaHash: Uint8Array,
  coreBridgeId: string = SOLANA_CORE_BRIDGE_MAINNET,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('PostedVAA'), Buffer.from(vaaHash)],
    new PublicKey(coreBridgeId),
  );
  return pda;
}

// ─── Claim PDA (token bridge / NFT bridge redemption) ────────────────────────
/**
 * Derive the claim account used to prevent double-redemption.
 * This account is created when a VAA is redeemed via the token or NFT bridge.
 * If it exists, the VAA has already been redeemed.
 *
 * Seeds: [emitterAddress (32 bytes), emitterChain (u16 LE), sequence (u64 LE)]
 */
export function getClaimPda(
  emitterAddress: `0x${string}`,
  emitterChain: number,
  sequence: bigint,
  bridgeProgramId: string = SOLANA_TOKEN_BRIDGE_MAINNET,
): PublicKey {
  const emitterBytes = Buffer.from(emitterAddress.slice(2), 'hex');
  const chainBuf = Buffer.alloc(2);
  chainBuf.writeUInt16BE(emitterChain, 0);
  const seqBuf = Buffer.alloc(8);
  seqBuf.writeBigUInt64BE(sequence, 0);

  const [pda] = PublicKey.findProgramAddressSync(
    [emitterBytes, chainBuf, seqBuf],
    new PublicKey(bridgeProgramId),
  );
  return pda;
}

// ─── Wrapped mint PDA ─────────────────────────────────────────────────────────
/**
 * Derive the SPL mint address for a bridged-in token.
 * This is the mint you hold after completing a transfer from another chain.
 *
 * Seeds: ["wrapped", foreignChain (u16 BE), foreignAddress (32 bytes)]
 */
export function getWrappedMintPda(
  foreignChain: number,
  /** 32-byte foreign token address as 0x-prefixed hex */
  foreignAddress: `0x${string}`,
  tokenBridgeId: string = SOLANA_TOKEN_BRIDGE_MAINNET,
): PublicKey {
  const chainBuf = Buffer.alloc(2);
  chainBuf.writeUInt16BE(foreignChain, 0);
  const addrBytes = Buffer.from(foreignAddress.slice(2), 'hex');

  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('wrapped'), chainBuf, addrBytes],
    new PublicKey(tokenBridgeId),
  );
  return pda;
}

// ─── Custody PDA (native token escrow) ────────────────────────────────────────
/**
 * Derive the custody token account where native SPL tokens are held
 * while they are locked on Solana and their wrapped equivalents live on other chains.
 *
 * Seeds: [mint pubkey bytes]
 */
export function getCustodyPda(
  mint: string,
  tokenBridgeId: string = SOLANA_TOKEN_BRIDGE_MAINNET,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [new PublicKey(mint).toBytes()],
    new PublicKey(tokenBridgeId),
  );
  return pda;
}

// ─── Mint authority PDA ────────────────────────────────────────────────────────
/**
 * Derive the PDA that acts as the mint authority for all wrapped tokens.
 * When you receive a wrapped token, this PDA is what minted it.
 *
 * Seeds: ["mint_signer"]
 */
export function getMintAuthorityPda(
  tokenBridgeId: string = SOLANA_TOKEN_BRIDGE_MAINNET,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('mint_signer')],
    new PublicKey(tokenBridgeId),
  );
  return pda;
}

// ─── Sequence account PDA ─────────────────────────────────────────────────────
/**
 * Derive the account that holds the next sequence number for an emitter.
 * Read this to predict what sequence number a not-yet-sent message will have.
 *
 * Seeds: ["Sequence", emitter pubkey bytes]
 */
export function getSequenceAccountPda(
  emitter: string,
  coreBridgeId: string = SOLANA_CORE_BRIDGE_MAINNET,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('Sequence'), new PublicKey(emitter).toBytes()],
    new PublicKey(coreBridgeId),
  );
  return pda;
}

// ─── Fee collector PDA ────────────────────────────────────────────────────────
/**
 * Derive the fee collector account. You must transfer the bridge fee
 * (queryable from the config account) to this address before posting a message.
 *
 * Seeds: ["fee_collector"]
 */
export function getFeeCollectorPda(
  coreBridgeId: string = SOLANA_CORE_BRIDGE_MAINNET,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('fee_collector')],
    new PublicKey(coreBridgeId),
  );
  return pda;
}
```

---

## Phase 2 — SDK: `SolanaChain` Class

### Task 2.1: Create `packages/sdk/src/chains/solana.ts`

```typescript
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  getAccount,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import type { WormcraftChain, TransactionReceipt } from '../chain.js';
import { RpcError } from '../error.js';
import {
  getEmitterAddress,
  getPostedVaaPda,
  getClaimPda,
  getWrappedMintPda,
  getCustodyPda,
  getSequenceAccountPda,
  getFeeCollectorPda,
  SOLANA_CORE_BRIDGE_MAINNET,
  SOLANA_TOKEN_BRIDGE_MAINNET,
} from './solana-wormhole.js';
import { parseVaa } from '../vaa/index.js';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface SolanaChainConfig {
  rpcUrl?: string;
  /**
   * 64-byte private key as a Uint8Array, base58 string, or JSON number array.
   * Required for sendTransaction, airdrop on mainnet is not possible anyway.
   */
  privateKey?: Uint8Array | number[] | string;
  coreBridgeId?: string;
  tokenBridgeId?: string;
  /** RPC commitment level. Default "confirmed". */
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

// ─── Extra return types ───────────────────────────────────────────────────────

export interface SplTokenBalance {
  mint: string;
  owner: string;
  /** Raw amount (no decimals applied). */
  amount: bigint;
  decimals: number;
  /** Human-readable amount with decimals. */
  uiAmount: number;
}

export interface GuardianSet {
  index: number;
  keys: string[];   // base58 pubkeys of guardian wallets
  creationTime: number;
  expirationTime: number;
}

export interface SolanaSequence {
  emitter: string;
  /** Next sequence number that will be assigned to the next message. */
  nextSequence: bigint;
}

export interface SolanaTransferParams {
  /** SPL token mint to transfer. */
  mint: string;
  /** Amount in the token's raw units (no decimals). */
  amount: bigint;
  /** Wormhole chain ID of the destination chain. */
  targetChain: number;
  /** 32-byte target address on the destination chain as 0x-prefixed hex. */
  targetAddress: `0x${string}`;
  /** Relayer fee in raw units. 0 for manual redemption. Default 0. */
  relayerFee?: bigint;
  /** Nonce for VAA dedup. Default 0. */
  nonce?: number;
}

export interface SolanaTransferResult {
  receipt: TransactionReceipt;
  sequence: bigint;
  emitterAddress: `0x${string}`;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class SolanaChain implements WormcraftChain {
  readonly chainId = 1n;
  readonly chainName = 'solana';

  readonly connection: Connection;
  private readonly keypair: Keypair | undefined;
  readonly coreBridgeId: string;
  readonly tokenBridgeId: string;

  constructor(config: SolanaChainConfig = {}) {
    const commitment = config.commitment ?? 'confirmed';
    this.connection = new Connection(
      config.rpcUrl ?? 'https://api.mainnet-beta.solana.com',
      commitment,
    );
    this.coreBridgeId = config.coreBridgeId ?? SOLANA_CORE_BRIDGE_MAINNET;
    this.tokenBridgeId = config.tokenBridgeId ?? SOLANA_TOKEN_BRIDGE_MAINNET;

    if (config.privateKey !== undefined) {
      if (typeof config.privateKey === 'string') {
        // base58 encoded secret key
        const { bs58 } = await import('bs58').catch(() => { throw new Error('Install bs58 for base58 key support'); });
        this.keypair = Keypair.fromSecretKey(bs58.decode(config.privateKey));
      } else {
        this.keypair = Keypair.fromSecretKey(Uint8Array.from(config.privateKey));
      }
    }
  }

  // ── WormcraftChain interface ─────────────────────────────────────────────────

  async getBalance(address: string): Promise<bigint> {
    try {
      const lamports = await this.connection.getBalance(new PublicKey(address));
      return BigInt(lamports);
    } catch (e) {
      throw new RpcError('solana', `getBalance failed for ${address}: ${String(e)}`, e);
    }
  }

  /**
   * Simulate a transaction. `to` = program ID, `data` = instruction data hex.
   * Returns the simulation logs as 0x-prefixed hex of their JSON array.
   */
  async call(to: string, data: `0x${string}`): Promise<`0x${string}`> {
    try {
      const instruction: TransactionInstruction = {
        programId: new PublicKey(to),
        keys: [],
        data: Buffer.from(data.slice(2), 'hex'),
      };
      const tx = new Transaction().add(instruction);
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      tx.feePayer = this.keypair?.publicKey ?? new PublicKey(to);

      const result = await this.connection.simulateTransaction(tx);
      const logs = result.value.logs ?? [];
      return ('0x' + Buffer.from(JSON.stringify(logs)).toString('hex')) as `0x${string}`;
    } catch (e) {
      throw new RpcError('solana', `simulate failed: ${String(e)}`, e);
    }
  }

  /**
   * Send a transaction with one instruction.
   * `to` = program ID, `data` = instruction data hex, `value` = lamports to transfer to program.
   */
  async sendTransaction(
    to: string,
    data: `0x${string}`,
    value?: bigint,
  ): Promise<TransactionReceipt> {
    if (!this.keypair) throw new RpcError('solana', 'privateKey required for sendTransaction');
    try {
      const instructions: TransactionInstruction[] = [];

      if (value && value > 0n) {
        instructions.push(
          SystemProgram.transfer({
            fromPubkey: this.keypair.publicKey,
            toPubkey: new PublicKey(to),
            lamports: Number(value),
          }),
        );
      }

      instructions.push({
        programId: new PublicKey(to),
        keys: [],
        data: Buffer.from(data.slice(2), 'hex'),
      });

      const tx = new Transaction().add(...instructions);
      const signature = await this.connection.sendTransaction(tx, [this.keypair]);
      return this.waitForTransaction(signature);
    } catch (e) {
      throw new RpcError('solana', `sendTransaction failed: ${String(e)}`, e);
    }
  }

  async waitForTransaction(signature: string): Promise<TransactionReceipt> {
    try {
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      await this.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      const tx = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      return {
        txHash: signature,
        blockNumber: BigInt(tx?.slot ?? 0),
        success: tx?.meta?.err === null,
        gasUsed: BigInt(tx?.meta?.fee ?? 0),
      };
    } catch (e) {
      throw new RpcError('solana', `waitForTransaction failed for ${signature}: ${String(e)}`, e);
    }
  }

  /**
   * Returns `0x` if account does not exist.
   * Returns `0x01` (single byte) if it is an executable program with no data.
   * Returns hex of the raw account data otherwise.
   */
  async getCode(address: string): Promise<`0x${string}`> {
    try {
      const info = await this.connection.getAccountInfo(new PublicKey(address));
      if (!info) return '0x';
      if (info.executable && info.data.length === 0) return '0x01';
      return ('0x' + Buffer.from(info.data).toString('hex')) as `0x${string}`;
    } catch {
      return '0x';
    }
  }

  // ── Solana-native extensions ─────────────────────────────────────────────────

  /** SPL token balance for an owner + mint pair. Uses the canonical ATA. */
  async getTokenBalance(owner: string, mint: string): Promise<SplTokenBalance> {
    try {
      const ata = getAssociatedTokenAddressSync(
        new PublicKey(mint),
        new PublicKey(owner),
        true, // allow off-curve (PDAs)
      );
      const account = await getAccount(this.connection, ata);
      const mintInfo = await this.connection.getParsedAccountInfo(new PublicKey(mint));
      const decimals = (mintInfo.value?.data as { parsed: { info: { decimals: number } } })?.parsed?.info?.decimals ?? 0;
      const amount = account.amount;
      return {
        mint,
        owner,
        amount,
        decimals,
        uiAmount: Number(amount) / 10 ** decimals,
      };
    } catch (e) {
      throw new RpcError('solana', `getTokenBalance failed (owner=${owner}, mint=${mint}): ${String(e)}`, e);
    }
  }

  /** Transfer SOL from the configured keypair to a recipient. */
  async transferSol(to: string, lamports: bigint): Promise<TransactionReceipt> {
    if (!this.keypair) throw new RpcError('solana', 'privateKey required for transferSol');
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.keypair.publicKey,
          toPubkey: new PublicKey(to),
          lamports: Number(lamports),
        }),
      );
      const sig = await this.connection.sendTransaction(tx, [this.keypair]);
      return this.waitForTransaction(sig);
    } catch (e) {
      throw new RpcError('solana', `transferSol failed: ${String(e)}`, e);
    }
  }

  // ── Wormhole-specific ────────────────────────────────────────────────────────

  /** Emitter address for a program as 32-byte hex (what appears in VAAs). */
  getEmitterAddress(programId: string): `0x${string}` {
    return getEmitterAddress(programId);
  }

  /**
   * Get the next sequence number an emitter will use for its next message.
   * Useful for predicting the sequence before sending so you can start polling.
   */
  async getNextSequence(emitterOrProgram: string): Promise<SolanaSequence> {
    const emitterPk = new PublicKey(emitterOrProgram);
    const seqAccount = getSequenceAccountPda(emitterPk.toBase58(), this.coreBridgeId);
    try {
      const info = await this.connection.getAccountInfo(seqAccount);
      if (!info || info.data.length < 8) {
        return { emitter: emitterOrProgram, nextSequence: 0n };
      }
      // First 8 bytes = u64 LE sequence value
      const seq = info.data.readBigUInt64LE(0);
      return { emitter: emitterOrProgram, nextSequence: seq };
    } catch (e) {
      throw new RpcError('solana', `getNextSequence failed for ${emitterOrProgram}: ${String(e)}`, e);
    }
  }

  /**
   * Check if a VAA has been posted to the Wormhole core bridge on Solana.
   * The posted VAA account is created by post_vaa and is required before redemption.
   */
  async isVaaPosted(vaaHex: string): Promise<boolean> {
    const { hash } = parseVaa(vaaHex);
    const hashBytes = Buffer.from(hash.slice(2), 'hex');
    const postedAccount = getPostedVaaPda(hashBytes, this.coreBridgeId);
    const info = await this.connection.getAccountInfo(postedAccount);
    return info !== null;
  }

  /**
   * Check if a VAA has already been redeemed through the token bridge.
   * The claim account is created on first redemption; its existence = already redeemed.
   */
  async isVaaRedeemed(vaaHex: string): Promise<boolean> {
    const vaa = parseVaa(vaaHex);
    const claimPda = getClaimPda(
      vaa.emitterAddress,
      vaa.emitterChain,
      vaa.sequence,
      this.tokenBridgeId,
    );
    const info = await this.connection.getAccountInfo(claimPda);
    return info !== null;
  }

  /**
   * Find the wrapped SPL mint address for a token that originated on another chain.
   * This is what you hold after redeeming a transfer from Ethereum, BSC, etc.
   */
  getWrappedMint(foreignChain: number, foreignAddress: `0x${string}`): string {
    return getWrappedMintPda(foreignChain, foreignAddress, this.tokenBridgeId).toBase58();
  }

  /**
   * Read the on-chain guardian set.
   * @param index Which guardian set to read. Defaults to the current one
   *              (reads the config account first to find the active index).
   */
  async getGuardianSet(index?: number): Promise<GuardianSet> {
    let setIndex = index;
    if (setIndex === undefined) {
      // Read core bridge config to get current guardian set index
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('Bridge')],
        new PublicKey(this.coreBridgeId),
      );
      const configInfo = await this.connection.getAccountInfo(configPda);
      if (!configInfo) throw new RpcError('solana', 'core bridge config account not found');
      // Bytes 0–3: guardian_set_index (u32 LE)
      setIndex = configInfo.data.readUInt32LE(0);
    }

    const indexBuf = Buffer.alloc(4);
    indexBuf.writeUInt32BE(setIndex, 0);
    const [guardianSetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('GuardianSet'), indexBuf],
      new PublicKey(this.coreBridgeId),
    );
    const info = await this.connection.getAccountInfo(guardianSetPda);
    if (!info) throw new RpcError('solana', `guardian set ${setIndex} not found`);

    // Deserialize: u32 index | u32 keys_len | [20-byte keys...] | u32 creation_time | u32 expiration_time
    let offset = 0;
    const idx = info.data.readUInt32LE(offset); offset += 4;
    const keysLen = info.data.readUInt32LE(offset); offset += 4;
    const keys: string[] = [];
    for (let i = 0; i < keysLen; i++) {
      keys.push('0x' + info.data.slice(offset, offset + 20).toString('hex'));
      offset += 20;
    }
    const creationTime = info.data.readUInt32LE(offset); offset += 4;
    const expirationTime = info.data.readUInt32LE(offset);

    return { index: idx, keys, creationTime, expirationTime };
  }

  /**
   * Initiate a token bridge transfer from Solana to another chain.
   * Handles approval, creates the custody account if needed, and posts the message.
   * Returns the receipt and the sequence number to track the VAA.
   */
  async initiateTokenBridgeTransfer(params: SolanaTransferParams): Promise<SolanaTransferResult> {
    if (!this.keypair) throw new RpcError('solana', 'privateKey required for initiateTokenBridgeTransfer');

    // Implementation note: this method must build the complete instruction sequence:
    // 1. Approve token bridge as delegate for `amount` tokens
    // 2. transfer_tokens (or transfer_tokens_with_payload)
    // 3. Read the sequence from the emitter sequence account to return it
    //
    // The full instruction data format is defined by the token bridge IDL.
    // Use @wormhole-foundation/sdk-solana if available, or build instructions manually
    // by following the token bridge program's layout.
    //
    // Full implementation requires the token bridge IDL. Sketch:

    const emitterPda = getEmitterAddress(this.tokenBridgeId);
    const sequenceBefore = await this.getNextSequence(
      getEmitterAddress(this.tokenBridgeId).slice(2), // emitter as base58 is needed
    );

    // ... build and send transaction (see Phase 2.2 note) ...

    throw new RpcError('solana', 'initiateTokenBridgeTransfer: full instruction building not yet implemented — see Phase 2.2 in the plan');

    return {
      receipt: { txHash: '', blockNumber: 0n, success: false },
      sequence: sequenceBefore.nextSequence,
      emitterAddress: emitterPda,
    };
  }

  /**
   * Complete (redeem) an inbound token bridge transfer.
   * Accepts a VAA hex string, derives all required PDAs, and calls complete_transfer.
   * After this succeeds, the recipient's ATA will contain the bridged tokens.
   */
  async redeemTokenBridgeTransfer(vaaHex: string): Promise<TransactionReceipt> {
    if (!this.keypair) throw new RpcError('solana', 'privateKey required for redeemTokenBridgeTransfer');

    const vaa = parseVaa(vaaHex);

    const alreadyRedeemed = await this.isVaaRedeemed(vaaHex);
    if (alreadyRedeemed) {
      throw new RpcError('solana', `VAA seq ${vaa.sequence} from chain ${vaa.emitterChain} has already been redeemed`);
    }

    const alreadyPosted = await this.isVaaPosted(vaaHex);
    if (!alreadyPosted) {
      // Must post_vaa first
      await this._postVaa(vaaHex);
    }

    // Derive accounts
    const hashBytes = Buffer.from(vaa.hash.slice(2), 'hex');
    const postedVaaPda = getPostedVaaPda(hashBytes, this.coreBridgeId);
    const claimPda = getClaimPda(vaa.emitterAddress, vaa.emitterChain, vaa.sequence, this.tokenBridgeId);

    // The payload encodes whether this is a native (custody) or wrapped (mint) transfer.
    // Payload type 1 = transfer, payload type 3 = transfer with payload.
    // Parse payload type from first byte of vaa.payload to route to the right instruction.
    const payloadType = parseInt(vaa.payload.slice(2, 4), 16);
    if (payloadType !== 1 && payloadType !== 3) {
      throw new RpcError('solana', `unexpected token bridge payload type: ${payloadType}`);
    }

    // Full instruction layout: see token bridge complete_transfer_wrapped / complete_transfer_native
    // This requires the token bridge program IDL for correct account ordering.
    // Implementation note for Phase 2.2: reference wormhole-foundation/wormhole repo
    // contracts/solana/token_bridge/src/instructions/complete_transfer.rs

    throw new RpcError('solana', 'redeemTokenBridgeTransfer: full account derivation not yet implemented — see Phase 2.2 in the plan');
  }

  /** Internal: post a VAA to the core bridge (requires guardian signatures). */
  private async _postVaa(vaaHex: string): Promise<void> {
    // post_vaa verifies guardian signatures on-chain.
    // Requires submitting 2/3 threshold signatures as instruction data.
    // In practice, use the Wormhole SDK's post_vaa helper or submit the full VAA.
    throw new RpcError('solana', 'post_vaa not yet implemented — see Phase 2.2 in the plan');
  }
}
```

> **Note on Phase 2.2:** The `initiateTokenBridgeTransfer` and `redeemTokenBridgeTransfer` methods need the full Wormhole token bridge IDL to correctly order accounts. The recommended implementation approach is:
> 1. Pull in `@wormhole-foundation/sdk-solana` (official Wormhole TS SDK for Solana) for the instruction builders.
> 2. If avoiding that dependency, reference the program source at `wormhole-foundation/wormhole/tree/main/solana/modules/token_bridge`.

### Task 2.2: Export from `packages/sdk/src/chains/index.ts`

```typescript
export { SolanaChain } from './solana.js';
export type {
  SolanaChainConfig,
  SplTokenBalance,
  GuardianSet,
  SolanaSequence,
  SolanaTransferParams,
  SolanaTransferResult,
} from './solana.js';
export {
  getEmitterAddress,
  getEmitterPda,
  getPostedVaaPda,
  getClaimPda,
  getWrappedMintPda,
  getCustodyPda,
  getMintAuthorityPda,
  getSequenceAccountPda,
  getFeeCollectorPda,
  SOLANA_CORE_BRIDGE_MAINNET,
  SOLANA_TOKEN_BRIDGE_MAINNET,
  SOLANA_CORE_BRIDGE_DEVNET,
  SOLANA_TOKEN_BRIDGE_DEVNET,
} from './solana-wormhole.js';
```

---

## Phase 3 — CLI: `wormcraft solana` Commands

### Task 3.1: Create `packages/cli/src/commands/solana.ts`

```typescript
import type { Command } from 'commander';
import { SolanaChain, parseVaa, getWrappedMintPda, getClaimPda, getEmitterAddress } from '@wormcraft/sdk';
import { printJson, printError } from '../output.js';
import { getRequiredEnv } from '../config.js';
import {
  SOLANA_CORE_BRIDGE_MAINNET,
  SOLANA_TOKEN_BRIDGE_MAINNET,
  SOLANA_CORE_BRIDGE_DEVNET,
  SOLANA_TOKEN_BRIDGE_DEVNET,
} from '@wormcraft/sdk';

function makeChain(opts: { rpc?: string; network?: string; key?: string }): SolanaChain {
  const isDevnet = opts.network === 'devnet';
  return new SolanaChain({
    rpcUrl: opts.rpc ?? process.env['WORMCRAFT_SOLANA_RPC'] ?? (
      isDevnet ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com'
    ),
    coreBridgeId: isDevnet ? SOLANA_CORE_BRIDGE_DEVNET : SOLANA_CORE_BRIDGE_MAINNET,
    tokenBridgeId: isDevnet ? SOLANA_TOKEN_BRIDGE_DEVNET : SOLANA_TOKEN_BRIDGE_MAINNET,
    privateKey: opts.key
      ? Uint8Array.from(JSON.parse(opts.key) as number[])
      : process.env['WORMCRAFT_SOLANA_KEY']
        ? Uint8Array.from(JSON.parse(process.env['WORMCRAFT_SOLANA_KEY']) as number[])
        : undefined,
  });
}

export function registerSolanaCommand(program: Command): void {
  const solana = program
    .command('solana')
    .description('Interact with Wormhole contracts on Solana')
    .option('--rpc <url>', 'Solana RPC URL (overrides WORMCRAFT_SOLANA_RPC)')
    .option('--network <n>', 'mainnet | devnet (default: mainnet)')
    .option('--key <json-array>', 'Keypair as JSON number array (overrides WORMCRAFT_SOLANA_KEY)');

  // ── wormcraft solana info ──────────────────────────────────────────────────
  solana
    .command('info')
    .description('Print chain info and Wormhole program addresses')
    .action((_opts, cmd: Command) => {
      const parent = cmd.parent!.opts<{ network?: string }>();
      const devnet = parent.network === 'devnet';
      printJson({
        chain: 'solana',
        wormholeChainId: 1,
        network: devnet ? 'devnet' : 'mainnet',
        coreBridge: devnet ? SOLANA_CORE_BRIDGE_DEVNET : SOLANA_CORE_BRIDGE_MAINNET,
        tokenBridge: devnet ? SOLANA_TOKEN_BRIDGE_DEVNET : SOLANA_TOKEN_BRIDGE_MAINNET,
        rpcUrl: process.env['WORMCRAFT_SOLANA_RPC'] ?? (devnet ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com'),
      });
    });

  // ── wormcraft solana balance <address> ────────────────────────────────────
  solana
    .command('balance <address>')
    .description('Get SOL balance (and optionally an SPL token balance)')
    .option('--token <mint>', 'SPL token mint address — show token balance instead of SOL')
    .action(async (address: string, opts: { token?: string }, cmd: Command) => {
      const chain = makeChain(cmd.parent!.opts());
      try {
        if (opts.token) {
          const tb = await chain.getTokenBalance(address, opts.token);
          printJson(tb);
        } else {
          const lamports = await chain.getBalance(address);
          printJson({
            address,
            balanceLamports: lamports.toString(),
            balanceSol: (Number(lamports) / 1e9).toFixed(9),
          });
        }
      } catch (e) { printError('balance failed', e); process.exit(1); }
    });

  // ── wormcraft solana tx <signature> ──────────────────────────────────────
  solana
    .command('tx <signature>')
    .description('Get status and details of a transaction')
    .action(async (signature: string, _opts, cmd: Command) => {
      const chain = makeChain(cmd.parent!.opts());
      try {
        const receipt = await chain.waitForTransaction(signature);
        printJson(receipt);
      } catch (e) { printError('tx status failed', e); process.exit(1); }
    });

  // ── wormcraft solana send-sol <to> <amount-sol> ──────────────────────────
  solana
    .command('send-sol <to> <amountSol>')
    .description('Transfer SOL from the configured keypair')
    .action(async (to: string, amountSol: string, _opts, cmd: Command) => {
      const chain = makeChain(cmd.parent!.opts());
      const lamports = BigInt(Math.round(Number(amountSol) * 1e9));
      try {
        const receipt = await chain.transferSol(to, lamports);
        printJson(receipt);
      } catch (e) { printError('send-sol failed', e); process.exit(1); }
    });

  // ── wormcraft solana wormhole <subcommands> ───────────────────────────────
  const wormhole = solana
    .command('wormhole')
    .description('Wormhole protocol utilities on Solana');

  // wormcraft solana wormhole emitter <program-id>
  wormhole
    .command('emitter <programId>')
    .description('Derive the Wormhole emitter address for a program (32-byte hex)')
    .action((programId: string) => {
      try {
        const emitter = getEmitterAddress(programId);
        printJson({ programId, emitterAddress: emitter });
      } catch (e) { printError('emitter derivation failed', e); process.exit(1); }
    });

  // wormcraft solana wormhole sequence <program-id>
  wormhole
    .command('sequence <programId>')
    .description('Get the next sequence number for a program\'s emitter')
    .action(async (programId: string, _opts, cmd: Command) => {
      const chain = makeChain(cmd.parent!.parent!.opts());
      try {
        const seq = await chain.getNextSequence(programId);
        printJson(seq);
      } catch (e) { printError('sequence query failed', e); process.exit(1); }
    });

  // wormcraft solana wormhole guardian-set
  wormhole
    .command('guardian-set')
    .description('Print the current on-chain guardian set')
    .option('--index <n>', 'Guardian set index (defaults to current active set)')
    .action(async (opts: { index?: string }, cmd: Command) => {
      const chain = makeChain(cmd.parent!.parent!.opts());
      try {
        const gs = await chain.getGuardianSet(opts.index !== undefined ? Number(opts.index) : undefined);
        printJson(gs);
      } catch (e) { printError('guardian-set query failed', e); process.exit(1); }
    });

  // wormcraft solana wormhole is-posted <vaa>
  wormhole
    .command('is-posted <vaaHex>')
    .description('Check if a VAA has been posted to the core bridge')
    .action(async (vaaHex: string, _opts, cmd: Command) => {
      const chain = makeChain(cmd.parent!.parent!.opts());
      try {
        const posted = await chain.isVaaPosted(vaaHex);
        printJson({ posted, vaaHash: parseVaa(vaaHex).hash });
      } catch (e) { printError('is-posted check failed', e); process.exit(1); }
    });

  // ── wormcraft solana bridge <subcommands> ────────────────────────────────
  const bridge = solana
    .command('bridge')
    .description('Wormhole token bridge operations on Solana');

  // wormcraft solana bridge redeemed <vaa>
  bridge
    .command('redeemed <vaaHex>')
    .description('Check if a VAA has already been redeemed (claim account exists)')
    .action(async (vaaHex: string, _opts, cmd: Command) => {
      const chain = makeChain(cmd.parent!.parent!.opts());
      try {
        const redeemed = await chain.isVaaRedeemed(vaaHex);
        const vaa = parseVaa(vaaHex);
        printJson({
          redeemed,
          emitterChain: vaa.emitterChain,
          emitterAddress: vaa.emitterAddress,
          sequence: vaa.sequence.toString(),
        });
      } catch (e) { printError('redeemed check failed', e); process.exit(1); }
    });

  // wormcraft solana bridge wrapped <foreign-chain-id> <foreign-address>
  bridge
    .command('wrapped <foreignChain> <foreignAddress>')
    .description('Find the wrapped SPL mint address for a foreign token')
    .action((foreignChain: string, foreignAddress: string, _opts, cmd: Command) => {
      const parentOpts = cmd.parent!.parent!.opts<{ network?: string }>();
      const isDevnet = parentOpts.network === 'devnet';
      const tokenBridgeId = isDevnet ? SOLANA_TOKEN_BRIDGE_DEVNET : SOLANA_TOKEN_BRIDGE_MAINNET;
      try {
        const mint = getWrappedMintPda(
          Number(foreignChain),
          foreignAddress as `0x${string}`,
          tokenBridgeId,
        );
        printJson({ foreignChain: Number(foreignChain), foreignAddress, wrappedMint: mint.toBase58() });
      } catch (e) { printError('wrapped mint derivation failed', e); process.exit(1); }
    });

  // wormcraft solana bridge redeem <vaa>
  bridge
    .command('redeem <vaaHex>')
    .description('Complete an inbound token bridge transfer (requires keypair)')
    .action(async (vaaHex: string, _opts, cmd: Command) => {
      const chain = makeChain(cmd.parent!.parent!.opts());
      try {
        const receipt = await chain.redeemTokenBridgeTransfer(vaaHex);
        printJson(receipt);
      } catch (e) { printError('bridge redeem failed', e); process.exit(1); }
    });

  // wormcraft solana bridge transfer <mint> <amount> --to-chain <id> --to-addr <hex>
  bridge
    .command('transfer <mint> <amount>')
    .description('Initiate a token bridge transfer out of Solana')
    .requiredOption('--to-chain <chainId>', 'Destination Wormhole chain ID')
    .requiredOption('--to-addr <hex>', 'Destination address as 32-byte 0x-prefixed hex')
    .option('--fee <amount>', 'Relayer fee in raw units (default 0)')
    .action(async (
      mint: string,
      amount: string,
      opts: { toChain: string; toAddr: string; fee?: string },
      cmd: Command,
    ) => {
      const chain = makeChain(cmd.parent!.parent!.opts());
      try {
        const result = await chain.initiateTokenBridgeTransfer({
          mint,
          amount: BigInt(amount),
          targetChain: Number(opts.toChain),
          targetAddress: opts.toAddr as `0x${string}`,
          relayerFee: opts.fee ? BigInt(opts.fee) : 0n,
        });
        printJson({
          ...result.receipt,
          sequence: result.sequence.toString(),
          emitterAddress: result.emitterAddress,
        });
      } catch (e) { printError('bridge transfer failed', e); process.exit(1); }
    });
}
```

### Task 3.2: Register in `packages/cli/src/main.ts`

```typescript
import { registerSolanaCommand } from './commands/solana.js';
// after registerEvmCommand(program):
registerSolanaCommand(program);
```

### Task 3.3: Update completion list

```typescript
cmds=(parse info generate status latency deploy transfer tokens submit redeem evm solana completion)
```

---

## Phase 4 — Tests

### Task 4.1: Unit tests — `packages/sdk/tests/chains/solana-wormhole.test.ts`

Pure function tests — no mocking needed.

```typescript
describe('Wormhole PDA derivations', () => {
  it('getEmitterAddress is deterministic and 32-byte hex', () => {
    const addr = getEmitterAddress('wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb');
    expect(addr).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('getEmitterAddress is stable (regression)', () => {
    // Token bridge emitter for mainnet — known value
    const addr = getEmitterAddress('wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb');
    expect(addr).toBe('0x0e0a589a6ba37b75caa22e5ebd2b1bd9c7aded88b3c543e1e0d86ff0f5c6e3d1'); // replace with actual value
  });

  it('getPostedVaaPda produces a valid PublicKey', () => {
    const hash = new Uint8Array(32).fill(0xab);
    const pda = getPostedVaaPda(hash);
    expect(() => pda.toBase58()).not.toThrow();
  });

  it('getClaimPda changes with emitterChain', () => {
    const a = getClaimPda('0x' + 'aa'.repeat(32), 2, 1n);
    const b = getClaimPda('0x' + 'aa'.repeat(32), 4, 1n);
    expect(a.toBase58()).not.toBe(b.toBase58());
  });

  it('getClaimPda changes with sequence', () => {
    const a = getClaimPda('0x' + 'aa'.repeat(32), 2, 1n);
    const b = getClaimPda('0x' + 'aa'.repeat(32), 2, 2n);
    expect(a.toBase58()).not.toBe(b.toBase58());
  });

  it('getWrappedMintPda is different for different foreign chains', () => {
    const addr = '0x' + '01'.repeat(32);
    const ethMint = getWrappedMintPda(2, addr);
    const bscMint = getWrappedMintPda(4, addr);
    expect(ethMint.toBase58()).not.toBe(bscMint.toBase58());
  });

  it('getCustodyPda is deterministic', () => {
    const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
    const pda1 = getCustodyPda(mint);
    const pda2 = getCustodyPda(mint);
    expect(pda1.toBase58()).toBe(pda2.toBase58());
  });
});
```

### Task 4.2: Unit tests — `packages/sdk/tests/chains/solana.test.ts`

Mock `@solana/web3.js` Connection. Cover:

- `chainId` = `1n`, `chainName` = `'solana'`
- `getBalance(address)` — mock returns `2_000_000_000`, assert `2000000000n`
- `getBalance` with invalid address → `RpcError`
- `getTokenBalance` — mock `getAccount` + `getParsedAccountInfo`, assert `amount`, `decimals`, `uiAmount`
- `getNextSequence` — mock account data with 8 bytes `[1, 0, 0, 0, 0, 0, 0, 0]`, assert `nextSequence` = `1n`
- `getNextSequence` for unknown emitter (no account) → returns `{ nextSequence: 0n }`
- `isVaaPosted` — mock account exists → `true`; mock null → `false`
- `isVaaRedeemed` — mock claim account exists → `true`; mock null → `false`
- `getWrappedMint` — calls `getWrappedMintPda` and returns base58
- `getGuardianSet` with explicit index — mock account data, assert guardian keys parsed correctly
- `sendTransaction` without keypair → `RpcError('solana', 'privateKey required…')`
- `waitForTransaction` success → `{ success: true }`
- `waitForTransaction` with failed tx → `{ success: false }`

### Task 4.3: Integration smoke tests — `packages/sdk/tests/integration/solana.smoke.ts`

Skip unless `WORMCRAFT_SOLANA_RPC` is set.

```bash
# Mainnet smoke (read-only, no key needed)
WORMCRAFT_SOLANA_RPC=https://api.mainnet-beta.solana.com npx vitest run tests/integration/solana.smoke.ts

# Devnet with transfer (needs funded key)
WORMCRAFT_SOLANA_RPC=https://api.devnet.solana.com \
WORMCRAFT_SOLANA_KEY='[...]' \
npx vitest run tests/integration/solana.smoke.ts --devnet
```

Covered:
- `getBalance` on a known address (e.g. token bridge program key)
- `getNextSequence` for token bridge emitter
- `getGuardianSet()` — assert > 0 guardian keys
- `isVaaPosted` + `isVaaRedeemed` on a known historical VAA hash

---

## Phase 5 — Documentation

### Task 5.1: `packages/sdk/README.md` — Solana section

Include:
- Config interface with all options
- How to use Wormhole PDA utilities standalone (no chain instance needed)
- Example: check if a VAA is redeemed before attempting to redeem
- Example: find a wrapped mint given a foreign token address
- Note on `privateKey` format (JSON number array vs base58)

### Task 5.2: `packages/cli/README.md` — `wormcraft solana` section

Full command reference table. Emphasis on the Wormhole workflow:

```
# Full inbound transfer workflow
# 1. Watch for the VAA to be signed
wormcraft status --chain 2 --emitter 0x... --seq 42

# 2. Check it hasn't been redeemed yet
wormcraft solana bridge redeemed <vaa-hex>

# 3. Redeem it
wormcraft solana bridge redeem <vaa-hex> --key '[...]'

# 4. Confirm new token balance
wormcraft solana balance <my-address> --token <wrapped-mint>
```

---

## Phase 6 — Quality Gate

```bash
npm run build --workspaces
npm run typecheck --workspaces
npm test --workspaces
npm run lint --workspaces

# Smoke — no key, mainnet
wormcraft solana info
wormcraft solana wormhole guardian-set
wormcraft solana wormhole emitter wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb
wormcraft solana bridge wrapped 2 0x000000000000000000000000A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48

# Smoke — devnet
wormcraft solana --network devnet balance <your-address>
```

---

## Open Issues / Phase 2.2 Scope

The `initiateTokenBridgeTransfer` and `redeemTokenBridgeTransfer` methods are stubbed to throw. Completing them is the largest single piece of work in this plan and should be its own PR. The two options:

1. **Use `@wormhole-foundation/sdk-solana`** — the official Wormhole TypeScript SDK handles all instruction builders. Add it as a dependency and delegate to it. Clean but adds a large dependency.

2. **Manual instruction building** — copy the instruction layout from the [token bridge source](https://github.com/wormhole-foundation/wormhole/blob/main/solana/modules/token_bridge/program/src/instructions.rs). More control, zero new deps, more maintenance surface.

Recommendation: start with option 1 for correctness and launch speed. The SDK is maintained by the Wormhole Foundation and handles edge cases like custody vs. wrapped routing automatically.
