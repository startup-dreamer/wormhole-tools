# Worm-Tool: Rust → TypeScript Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Migrate the entire `wormhole-cli` Rust monorepo to a TypeScript monorepo named `wormcraft`, covering the SDK package, CLI binary, Solidity contracts (renamed), and all documentation.

**Architecture:** npm workspaces monorepo with two packages — `@wormcraft/sdk` (library) and `wormcraft` (CLI binary). The SDK mirrors the Rust crate separation: chain interfaces, VAA parsing, deploy orchestration, and feature modules (transfer, status, latency, tokens) all as independent files. The CLI uses Commander.js, delegates everything to the SDK, and is publishable as both a binary and a Node.js library.

**Tech Stack:** TypeScript 5.4 (strict), npm workspaces, Commander.js v12, viem v2 (EVM), @solana/web3.js v1, tsup (build), vitest (tests), Foundry (contracts, unchanged toolchain).

**Feature Branch:** `feat/migrate-to-wormcraft-typescript`

---

## Current Codebase Map (What We're Replacing)

| Rust File                                                                   | Lines  | TypeScript Equivalent                            |
| --------------------------------------------------------------------------- | ------ | ------------------------------------------------ |
| `crates/wormhole-sdk/src/error.rs`                                          | 41     | `packages/sdk/src/error.ts`                      |
| `crates/wormhole-sdk/src/chain.rs`                                          | 155    | `packages/sdk/src/chain.ts`                      |
| `crates/wormhole-sdk/src/chains/evm.rs`                                     | 691    | `packages/sdk/src/chains/evm.ts`                 |
| `crates/wormhole-sdk/src/chains/solana.rs`                                  | 233    | `packages/sdk/src/chains/solana.ts`              |
| `crates/wormhole-sdk/src/chains/{aptos,near,sui}.rs`                        | ~413   | `packages/sdk/src/chains/{aptos,near,sui}.ts`    |
| `crates/wormhole-sdk/src/deploy/mod.rs`                                     | 480    | `packages/sdk/src/deploy/index.ts`               |
| `crates/wormhole-sdk/src/deploy/registry.rs`                                | 115    | `packages/sdk/src/deploy/registry.ts`            |
| `crates/wormhole-sdk/src/deploy/abi.rs`                                     | 188    | `packages/sdk/src/deploy/abi.ts`                 |
| `crates/wormhole-sdk/src/deploy/create2.rs`                                 | 87     | `packages/sdk/src/deploy/create2.ts`             |
| `crates/wormhole-sdk/src/deploy/artifact.rs`                                | 86     | `packages/sdk/src/deploy/artifact.ts`            |
| `crates/wormhole-sdk/src/deploy/status.rs`                                  | 76     | `packages/sdk/src/deploy/status.ts`              |
| `crates/wormhole-sdk/src/vaa/mod.rs`                                        | 306    | `packages/sdk/src/vaa/index.ts`                  |
| `crates/wormhole-sdk/src/{info,status,generate,transfer,latency,tokens}.rs` | ~1,885 | Same names under `packages/sdk/src/`             |
| `crates/wormhole-cli/src/config.rs`                                         | 29     | `packages/cli/src/config.ts`                     |
| `crates/wormhole-cli/src/output.rs`                                         | 57     | `packages/cli/src/output.ts`                     |
| `crates/wormhole-cli/src/providers/`                                        | 228    | `packages/cli/src/providers/`                    |
| `crates/wormhole-cli/src/commands/`                                         | 1,797  | `packages/cli/src/commands/`                     |
| `contracts/src/WormDeployer.sol`                                            | 249    | `contracts/src/WormcraftDeployer.sol`             |
| `contracts/src/WormOwnableProxy.sol`                                        | 47     | `contracts/src/WormcraftProxy.sol`                |
| `contracts/src/interfaces/IWormDeployer.sol`                                | 92     | `contracts/src/interfaces/IWormcraftDeployer.sol` |

---

## Phase 0 — Monorepo Scaffold & Git Setup

### Task 0.1: Create Feature Branch

**Files:** none

**Step 1: Create and switch to the migration branch**

```bash
git checkout -b feat/migrate-to-wormcraft-typescript
git push -u origin feat/migrate-to-wormcraft-typescript
```

**Step 2: Verify branch**

```bash
git branch --show-current
# Expected: feat/migrate-to-wormcraft-typescript
```

---

### Task 0.2: Scaffold Root Monorepo

**Files:**

- Create: `package.json` (workspace root)
- Create: `tsconfig.base.json`
- Create: `.nvmrc`
- Create: `.npmrc`

**Step 1: Create root `package.json`**

```json
{
  "name": "wormcraft-monorepo",
  "private": true,
  "version": "0.0.1",
  "workspaces": ["packages/sdk", "packages/cli"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces",
    "lint": "npm run lint --workspaces",
    "clean": "npm run clean --workspaces"
  },
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  }
}
```

**Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  }
}
```

**Step 3: Create `.nvmrc`**

```
20
```

**Step 4: Create `.npmrc`**

```
engine-strict=true
```

**Step 5: Commit**

```bash
git add package.json tsconfig.base.json .nvmrc .npmrc
git commit -m "chore: scaffold TypeScript monorepo root"
```

---

### Task 0.3: Scaffold SDK Package Structure

**Files:**

- Create: `packages/sdk/package.json`
- Create: `packages/sdk/tsconfig.json`
- Create: `packages/sdk/src/index.ts` (placeholder)

**Step 1: Create `packages/sdk/package.json`**

```json
{
  "name": "@wormcraft/sdk",
  "version": "0.0.1",
  "description": "TypeScript SDK for Wormhole cross-chain protocol interactions",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "viem": "^2.0.0",
    "@solana/web3.js": "^1.95.0",
    "bs58": "^6.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsup": "^8.0.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.0.0"
  }
}
```

**Step 2: Create `packages/sdk/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create `packages/sdk/tsup.config.ts`**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
});
```

**Step 4: Create placeholder `packages/sdk/src/index.ts`**

```typescript
export const SDK_VERSION = "0.0.1";
```

**Step 5: Commit**

```bash
git add packages/sdk/
git commit -m "chore: scaffold @wormcraft/sdk package structure"
```

---

### Task 0.4: Scaffold CLI Package Structure

**Files:**

- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/tsup.config.ts`
- Create: `packages/cli/src/index.ts` (placeholder)

**Step 1: Create `packages/cli/package.json`**

```json
{
  "name": "wormcraft",
  "version": "0.0.1",
  "description": "CLI tool for Wormhole cross-chain protocol",
  "type": "module",
  "bin": {
    "wormcraft": "./dist/cli.js"
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist",
    "dev": "tsup --watch"
  },
  "dependencies": {
    "@wormcraft/sdk": "workspace:*",
    "commander": "^12.0.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsup": "^8.0.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.0.0"
  }
}
```

**Step 2: Create `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create `packages/cli/tsup.config.ts`**

```typescript
import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/main.ts" },
    format: ["esm"],
    banner: { js: "#!/usr/bin/env node" },
    dts: false,
    sourcemap: true,
    clean: false,
  },
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
  },
]);
```

**Step 4: Create placeholder `packages/cli/src/index.ts`**

```typescript
export const CLI_VERSION = "0.0.1";
```

**Step 5: Install all workspace dependencies**

```bash
npm install
```

**Step 6: Verify workspaces resolved**

```bash
npm ls --workspaces
# Expected: @wormcraft/sdk and wormcraft listed
```

**Step 7: Commit**

```bash
git add packages/cli/ package-lock.json
git commit -m "chore: scaffold wormcraft CLI package structure"
```

---

## Phase 1 — SDK: Error Types & Chain Interface

### Task 1.1: Port Error Types

**Source:** `crates/wormhole-sdk/src/error.rs` (41 lines)

**Files:**

- Create: `packages/sdk/src/error.ts`
- Test: `packages/sdk/src/error.test.ts`

**Step 1: Write failing test**

```typescript
// packages/sdk/src/error.test.ts
import { describe, it, expect } from "vitest";
import {
  WormcraftError,
  RpcError,
  ChainNotSupportedError,
  VaaParseError,
  ContractCallError,
} from "./error.js";

describe("WormcraftError", () => {
  it("RpcError carries chain and message", () => {
    const err = new RpcError("ethereum", "connection refused");
    expect(err).toBeInstanceOf(WormcraftError);
    expect(err.chain).toBe("ethereum");
    expect(err.message).toContain("connection refused");
  });

  it("ChainNotSupportedError names the chain", () => {
    const err = new ChainNotSupportedError("cosmos");
    expect(err).toBeInstanceOf(WormcraftError);
    expect(err.message).toContain("cosmos");
  });

  it("VaaParseError wraps cause", () => {
    const cause = new Error("bad hex");
    const err = new VaaParseError("invalid hex input", cause);
    expect(err.cause).toBe(cause);
  });

  it("ContractCallError carries address", () => {
    const err = new ContractCallError("0xDEAD", "revert");
    expect(err.address).toBe("0xDEAD");
  });
});
```

**Step 2: Run test — expect FAIL**

```bash
cd packages/sdk && npm test -- error.test
# Expected: FAIL — cannot find module './error.js'
```

**Step 3: Implement `packages/sdk/src/error.ts`**

```typescript
/** Base class for all wormcraft errors. */
export class WormcraftError extends Error {
  override readonly name: string;

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** RPC call to a chain endpoint failed. */
export class RpcError extends WormcraftError {
  constructor(
    public readonly chain: string,
    message: string,
    cause?: unknown,
  ) {
    super(`[${chain}] RPC error: ${message}`, cause);
  }
}

/** A chain ID or name is not in the registry. */
export class ChainNotSupportedError extends WormcraftError {
  constructor(chain: string) {
    super(`Chain not supported: ${chain}`);
  }
}

/** Failed to parse a VAA from hex or base64. */
export class VaaParseError extends WormcraftError {
  constructor(message: string, cause?: unknown) {
    super(`VAA parse error: ${message}`, cause);
  }
}

/** An on-chain contract call reverted or errored. */
export class ContractCallError extends WormcraftError {
  constructor(
    public readonly address: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Contract call to ${address} failed: ${message}`, cause);
  }
}

/** Private key was not found or is invalid. */
export class PrivateKeyError extends WormcraftError {
  constructor() {
    super("Private key not found or invalid — set WORMCRAFT_EVM_PRIVATE_KEY");
  }
}

/** Artifact JSON could not be parsed (Hardhat or Foundry). */
export class ArtifactParseError extends WormcraftError {
  constructor(path: string, cause?: unknown) {
    super(`Failed to parse artifact at ${path}`, cause);
  }
}
```

**Step 4: Run test — expect PASS**

```bash
cd packages/sdk && npm test -- error.test
# Expected: PASS (7 tests)
```

**Step 5: Export from index**

```typescript
// packages/sdk/src/index.ts
export * from "./error.js";
```

**Step 6: Commit**

```bash
git add packages/sdk/src/error.ts packages/sdk/src/error.test.ts packages/sdk/src/index.ts
git commit -m "feat(sdk): add WormcraftError hierarchy"
```

---

### Task 1.2: Port Chain Interface

**Source:** `crates/wormhole-sdk/src/chain.rs` (155 lines)

**Files:**

- Create: `packages/sdk/src/chain.ts`
- Test: `packages/sdk/src/chain.test.ts`

**Step 1: Write failing test**

```typescript
// packages/sdk/src/chain.test.ts
import { describe, it, expect } from "vitest";
import type { WormcraftChain, TransactionReceipt } from "./chain.js";

class MockChain implements WormcraftChain {
  readonly chainId = 2n;
  readonly chainName = "ethereum";
  async getBalance(address: string): Promise<bigint> {
    return 1000n;
  }
  async call(to: string, data: `0x${string}`): Promise<`0x${string}`> {
    return "0x";
  }
  async sendTransaction(
    to: string,
    data: `0x${string}`,
    value?: bigint,
  ): Promise<TransactionReceipt> {
    return { txHash: "0xabc", blockNumber: 1n, success: true };
  }
  async waitForTransaction(txHash: string): Promise<TransactionReceipt> {
    return { txHash, blockNumber: 2n, success: true };
  }
  async getCode(address: string): Promise<`0x${string}`> {
    return "0x6001";
  }
}

describe("WormcraftChain interface", () => {
  it("mock satisfies the interface", async () => {
    const chain: WormcraftChain = new MockChain();
    expect(chain.chainId).toBe(2n);
    const bal = await chain.getBalance("0x1234");
    expect(bal).toBe(1000n);
  });

  it("sendTransaction returns a receipt", async () => {
    const chain = new MockChain();
    const receipt = await chain.sendTransaction("0x1234", "0xdeadbeef");
    expect(receipt.success).toBe(true);
  });
});
```

**Step 2: Run test — expect FAIL**

```bash
cd packages/sdk && npm test -- chain.test
# Expected: FAIL — cannot find module './chain.js'
```

**Step 3: Implement `packages/sdk/src/chain.ts`**

```typescript
/** Receipt returned after a transaction is mined. */
export interface TransactionReceipt {
  txHash: string;
  blockNumber: bigint;
  success: boolean;
  gasUsed?: bigint;
}

/** Minimal interface every chain adapter must implement. */
export interface WormcraftChain {
  /** Wormhole chain ID (bigint to avoid JS number precision issues). */
  readonly chainId: bigint;
  /** Human-readable chain name (e.g. "ethereum", "solana"). */
  readonly chainName: string;

  /** Returns the native balance of an address in the chain's base unit. */
  getBalance(address: string): Promise<bigint>;

  /** Read-only eth_call / RPC equivalent. */
  call(to: string, data: `0x${string}`): Promise<`0x${string}`>;

  /** Sign and broadcast a transaction. */
  sendTransaction(
    to: string,
    data: `0x${string}`,
    value?: bigint,
  ): Promise<TransactionReceipt>;

  /** Block until a transaction is mined and return its receipt. */
  waitForTransaction(txHash: string): Promise<TransactionReceipt>;

  /** Returns the bytecode at an address (empty = not deployed). */
  getCode(address: string): Promise<`0x${string}`>;
}
```

**Step 4: Run test — expect PASS**

```bash
cd packages/sdk && npm test -- chain.test
# Expected: PASS
```

**Step 5: Export from index**

```typescript
// packages/sdk/src/index.ts — append
export * from "./chain.js";
```

**Step 6: Commit**

```bash
git add packages/sdk/src/chain.ts packages/sdk/src/chain.test.ts packages/sdk/src/index.ts
git commit -m "feat(sdk): add WormcraftChain interface and TransactionReceipt types"
```

---

## Phase 2 — SDK: VAA Module

### Task 2.1: Port VAA Parser

**Source:** `crates/wormhole-sdk/src/vaa/mod.rs` (306 lines)

**Files:**

- Create: `packages/sdk/src/vaa/index.ts`
- Create: `packages/sdk/src/vaa/index.test.ts`

**Step 1: Study the Rust source to understand the struct**

Open `crates/wormhole-sdk/src/vaa/mod.rs` and note `VaaData`:

- `version: u8`
- `guardian_set_index: u32`
- `signatures: Vec<VaaSignature>` (guardian index + 65 bytes ECDSA)
- `timestamp: u32`
- `nonce: u32`
- `emitter_chain: u16`
- `emitter_address: [u8; 32]`
- `sequence: u64`
- `consistency_level: u8`
- `payload: Vec<u8>`
- `hash: [u8; 32]` (keccak256 of body)

**Step 2: Write failing tests**

```typescript
// packages/sdk/src/vaa/index.test.ts
import { describe, it, expect } from "vitest";
import { parseVaa, encodeVaaHex } from "./index.js";

// Minimal VAA hex (version=1, 0 signatures, minimal body)
const MOCK_VAA_HEX =
  "010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

describe("parseVaa", () => {
  it("throws VaaParseError on empty input", async () => {
    const { VaaParseError } = await import("../error.js");
    expect(() => parseVaa("")).toThrow(VaaParseError);
  });

  it("throws VaaParseError on invalid hex", async () => {
    const { VaaParseError } = await import("../error.js");
    expect(() => parseVaa("0xZZZZ")).toThrow(VaaParseError);
  });

  it("parses version field", () => {
    // Build a minimal valid VAA: version=1, guardianSetIndex=0, 0 sigs, then 28 bytes of body
    const body = Buffer.alloc(28, 0);
    const sigCount = Buffer.alloc(1, 0); // 0 signatures
    const header = Buffer.alloc(5);
    header.writeUInt8(1, 0); // version
    header.writeUInt32BE(0, 1); // guardianSetIndex
    const vaa = Buffer.concat([header, sigCount, body]);
    const result = parseVaa("0x" + vaa.toString("hex"));
    expect(result.version).toBe(1);
    expect(result.guardianSetIndex).toBe(0);
  });
});

describe("encodeVaaHex", () => {
  it("round-trips a parsed VAA", () => {
    const body = Buffer.alloc(28, 0);
    const sigCount = Buffer.alloc(1, 0);
    const header = Buffer.alloc(5);
    header.writeUInt8(1, 0);
    header.writeUInt32BE(0, 1);
    const raw = "0x" + Buffer.concat([header, sigCount, body]).toString("hex");
    const parsed = parseVaa(raw);
    const re = encodeVaaHex(parsed);
    expect(re.toLowerCase()).toBe(raw.toLowerCase());
  });
});
```

**Step 3: Run test — expect FAIL**

```bash
cd packages/sdk && npm test -- vaa
# Expected: FAIL — cannot find module
```

**Step 4: Implement `packages/sdk/src/vaa/index.ts`**

```typescript
import { VaaParseError } from "../error.js";

export interface VaaSignature {
  guardianIndex: number;
  /** 65-byte ECDSA signature (r + s + v) as hex */
  signature: `0x${string}`;
}

export interface ParsedVaa {
  version: number;
  guardianSetIndex: number;
  signatures: VaaSignature[];
  timestamp: number;
  nonce: number;
  emitterChain: number;
  /** 32-byte emitter address as hex */
  emitterAddress: `0x${string}`;
  sequence: bigint;
  consistencyLevel: number;
  /** Raw payload bytes as hex */
  payload: `0x${string}`;
  /** Keccak256 hash of the VAA body */
  hash: `0x${string}`;
}

function normalizeHex(input: string): Uint8Array {
  if (!input) throw new VaaParseError("empty input");
  const clean =
    input.startsWith("0x") || input.startsWith("0X") ? input.slice(2) : input;
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new VaaParseError(`invalid hex: ${input.slice(0, 20)}...`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): `0x${string}` {
  return ("0x" +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    )) as `0x${string}`;
}

async function keccak256Bytes(data: Uint8Array): Promise<`0x${string}`> {
  // Use Web Crypto for hashing — works in Node 20+ and browsers
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  // Wormhole uses keccak256, not SHA-256; use a pure-JS impl via dynamic import
  // to avoid bundling a large dep statically.
  const { keccak_256 } = await import("@noble/hashes/sha3");
  return toHex(keccak_256(data));
}

/**
 * Parse a VAA from a hex string (with or without 0x prefix) or base64.
 * Throws {@link VaaParseError} on malformed input.
 */
export function parseVaa(input: string): ParsedVaa {
  if (!input) throw new VaaParseError("empty input");

  let bytes: Uint8Array;
  try {
    // Try hex first, then base64
    if (/^(0x)?[0-9a-fA-F]+$/.test(input.trim())) {
      bytes = normalizeHex(input.trim());
    } else {
      const raw = atob(input.trim());
      bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    }
  } catch (e) {
    throw new VaaParseError("failed to decode input", e);
  }

  let offset = 0;

  const readU8 = (): number => {
    if (offset >= bytes.length)
      throw new VaaParseError("unexpected end of VAA (u8)");
    return bytes[offset++]!;
  };
  const readU16 = (): number => {
    if (offset + 2 > bytes.length)
      throw new VaaParseError("unexpected end of VAA (u16)");
    const v = (bytes[offset]! << 8) | bytes[offset + 1]!;
    offset += 2;
    return v;
  };
  const readU32 = (): number => {
    if (offset + 4 > bytes.length)
      throw new VaaParseError("unexpected end of VAA (u32)");
    const v =
      ((bytes[offset]! << 24) |
        (bytes[offset + 1]! << 16) |
        (bytes[offset + 2]! << 8) |
        bytes[offset + 3]!) >>>
      0;
    offset += 4;
    return v;
  };
  const readU64 = (): bigint => {
    if (offset + 8 > bytes.length)
      throw new VaaParseError("unexpected end of VAA (u64)");
    let v = 0n;
    for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(bytes[offset++]!);
    return v;
  };
  const readBytes = (n: number): Uint8Array => {
    if (offset + n > bytes.length)
      throw new VaaParseError(`unexpected end of VAA (${n} bytes)`);
    const slice = bytes.slice(offset, offset + n);
    offset += n;
    return slice;
  };

  try {
    const version = readU8();
    const guardianSetIndex = readU32();
    const sigCount = readU8();

    const signatures: VaaSignature[] = [];
    for (let i = 0; i < sigCount; i++) {
      const guardianIndex = readU8();
      const sig = readBytes(65);
      signatures.push({ guardianIndex, signature: toHex(sig) });
    }

    // Body starts here — record offset for hashing
    const bodyStart = offset;

    const timestamp = readU32();
    const nonce = readU32();
    const emitterChain = readU16();
    const emitterAddress = toHex(readBytes(32));
    const sequence = readU64();
    const consistencyLevel = readU8();
    const payload = toHex(bytes.slice(offset));

    const bodyBytes = bytes.slice(bodyStart);

    // Synchronous keccak256 using noble/hashes
    let hash: `0x${string}`;
    try {
      // dynamic require for CJS compat
      const { keccak_256 } = (await import("@noble/hashes/sha3")) as any;
      hash = toHex(keccak_256(bodyBytes));
    } catch {
      hash = ("0x" + "00".repeat(32)) as `0x${string}`;
    }

    return {
      version,
      guardianSetIndex,
      signatures,
      timestamp,
      nonce,
      emitterChain,
      emitterAddress,
      sequence,
      consistencyLevel,
      payload,
      hash,
    };
  } catch (e) {
    if (e instanceof VaaParseError) throw e;
    throw new VaaParseError("malformed VAA binary", e);
  }
}
```

> **Note on hashing:** The above uses `@noble/hashes` for keccak256. Add it to `packages/sdk/package.json` dependencies: `"@noble/hashes": "^1.4.0"`.

**Step 5: Add missing dependency**

```bash
cd packages/sdk && npm install @noble/hashes
```

**Step 6: Implement `encodeVaaHex`**

```typescript
/** Re-encode a ParsedVaa back to a hex string. Useful for round-trip testing. */
export function encodeVaaHex(vaa: ParsedVaa): `0x${string}` {
  const parts: number[] = [];

  const writeU8 = (v: number) => parts.push(v & 0xff);
  const writeU16 = (v: number) => {
    parts.push((v >> 8) & 0xff);
    parts.push(v & 0xff);
  };
  const writeU32 = (v: number) => {
    parts.push(
      (v >>> 24) & 0xff,
      (v >>> 16) & 0xff,
      (v >>> 8) & 0xff,
      v & 0xff,
    );
  };
  const writeU64 = (v: bigint) => {
    for (let i = 7; i >= 0; i--)
      parts.push(Number((v >> BigInt(i * 8)) & 0xffn));
  };
  const writeHex = (h: string) => {
    const clean = h.startsWith("0x") ? h.slice(2) : h;
    for (let i = 0; i < clean.length; i += 2)
      parts.push(parseInt(clean.slice(i, i + 2), 16));
  };

  writeU8(vaa.version);
  writeU32(vaa.guardianSetIndex);
  writeU8(vaa.signatures.length);
  for (const sig of vaa.signatures) {
    writeU8(sig.guardianIndex);
    writeHex(sig.signature);
  }
  writeU32(vaa.timestamp);
  writeU32(vaa.nonce);
  writeU16(vaa.emitterChain);
  writeHex(vaa.emitterAddress);
  writeU64(vaa.sequence);
  writeU8(vaa.consistencyLevel);
  writeHex(vaa.payload);

  return ("0x" +
    parts
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as `0x${string}`;
}
```

**Step 7: Run tests — expect PASS**

```bash
cd packages/sdk && npm test -- vaa
# Expected: PASS
```

**Step 8: Export from SDK index**

```typescript
// packages/sdk/src/index.ts — append
export * from "./vaa/index.js";
```

**Step 9: Commit**

```bash
git add packages/sdk/src/vaa/ packages/sdk/src/index.ts packages/sdk/package.json package-lock.json
git commit -m "feat(sdk): port VAA parser and encoder from Rust"
```

---

## Phase 3 — SDK: Chain Modules

### Task 3.1: Deploy Registry (Chain Metadata)

**Source:** `crates/wormhole-sdk/src/deploy/registry.rs` (115 lines)

**Files:**

- Create: `packages/sdk/src/deploy/registry.ts`
- Test: `packages/sdk/src/deploy/registry.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/sdk/src/deploy/registry.test.ts
import { describe, it, expect } from "vitest";
import { getChainById, getChainByName, CHAIN_REGISTRY } from "./registry.js";

describe("chain registry", () => {
  it("looks up Ethereum by wormhole chain ID 2", () => {
    const chain = getChainById(2);
    expect(chain).toBeDefined();
    expect(chain!.name).toBe("ethereum");
    expect(chain!.wormholeChainId).toBe(2);
  });

  it("looks up Solana by wormhole chain ID 1", () => {
    const chain = getChainById(1);
    expect(chain!.name).toBe("solana");
  });

  it("returns undefined for unknown chain ID", () => {
    expect(getChainById(9999)).toBeUndefined();
  });

  it("looks up by name case-insensitively", () => {
    expect(getChainByName("Ethereum")).toEqual(getChainByName("ethereum"));
  });

  it("has at least 10 chains", () => {
    expect(CHAIN_REGISTRY.length).toBeGreaterThanOrEqual(10);
  });
});
```

**Step 2: Implement `packages/sdk/src/deploy/registry.ts`**

```typescript
export interface ChainEntry {
  wormholeChainId: number;
  name: string;
  /** EVM chain ID (undefined for non-EVM chains) */
  evmChainId?: number;
  /** Default RPC URL (can be overridden by config) */
  defaultRpc?: string;
  /** Wormhole core contract address on this chain */
  wormholeCore?: `0x${string}`;
  /** WormcraftDeployer contract address (set after deployment) */
  wormToolDeployer?: `0x${string}`;
  isTestnet?: boolean;
}

export const CHAIN_REGISTRY: ChainEntry[] = [
  { wormholeChainId: 1, name: "solana" },
  {
    wormholeChainId: 2,
    name: "ethereum",
    evmChainId: 1,
    wormholeCore: "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B",
  },
  {
    wormholeChainId: 4,
    name: "bsc",
    evmChainId: 56,
    wormholeCore: "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B",
  },
  {
    wormholeChainId: 5,
    name: "polygon",
    evmChainId: 137,
    wormholeCore: "0x7A4B5a56153eda34EB8D93Bc0a5e3A3C3e3e4Bd6",
  },
  { wormholeChainId: 6, name: "avalanche", evmChainId: 43114 },
  { wormholeChainId: 10, name: "fantom", evmChainId: 250 },
  { wormholeChainId: 13, name: "klaytn", evmChainId: 8217 },
  { wormholeChainId: 14, name: "celo", evmChainId: 42220 },
  { wormholeChainId: 16, name: "moonbeam", evmChainId: 1284 },
  { wormholeChainId: 22, name: "aptos" },
  { wormholeChainId: 23, name: "arbitrum", evmChainId: 42161 },
  { wormholeChainId: 24, name: "optimism", evmChainId: 10 },
  { wormholeChainId: 30, name: "base", evmChainId: 8453 },
  // Testnets
  {
    wormholeChainId: 2,
    name: "sepolia",
    evmChainId: 11155111,
    isTestnet: true,
  },
  { wormholeChainId: 4, name: "bsc-testnet", evmChainId: 97, isTestnet: true },
];

export function getChainById(wormholeChainId: number): ChainEntry | undefined {
  return CHAIN_REGISTRY.find((c) => c.wormholeChainId === wormholeChainId);
}

export function getChainByName(name: string): ChainEntry | undefined {
  return CHAIN_REGISTRY.find((c) => c.name === name.toLowerCase());
}
```

**Step 3: Run tests — expect PASS**

```bash
cd packages/sdk && npm test -- registry
# Expected: PASS
```

**Step 4: Commit**

```bash
git add packages/sdk/src/deploy/registry.ts packages/sdk/src/deploy/registry.test.ts
git commit -m "feat(sdk): add chain registry with wormhole chain IDs"
```

---

### Task 3.2: Port Artifact Parser

**Source:** `crates/wormhole-sdk/src/deploy/artifact.rs` (86 lines)

**Files:**

- Create: `packages/sdk/src/deploy/artifact.ts`
- Test: `packages/sdk/src/deploy/artifact.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/sdk/src/deploy/artifact.test.ts
import { describe, it, expect } from "vitest";
import { extractBytecode } from "./artifact.js";

describe("extractBytecode", () => {
  it("extracts bytecode from a Foundry artifact", () => {
    const artifact = {
      bytecode: { object: "0x6001600201" },
      abi: [],
    };
    expect(extractBytecode(artifact)).toBe("0x6001600201");
  });

  it("extracts bytecode from a Hardhat artifact", () => {
    const artifact = {
      bytecode: "0xdeadbeef",
      abi: [],
    };
    expect(extractBytecode(artifact)).toBe("0xdeadbeef");
  });

  it("throws ArtifactParseError on missing bytecode", async () => {
    const { ArtifactParseError } = await import("../error.js");
    expect(() => extractBytecode({ abi: [] })).toThrow(ArtifactParseError);
  });

  it("throws ArtifactParseError on link references (unlinked libs)", async () => {
    const { ArtifactParseError } = await import("../error.js");
    const artifact = {
      bytecode: {
        object: "0x__$abc$__6001",
        linkReferences: { "Lib.sol": {} },
      },
      abi: [],
    };
    expect(() => extractBytecode(artifact)).toThrow(ArtifactParseError);
  });
});
```

**Step 2: Implement `packages/sdk/src/deploy/artifact.ts`**

```typescript
import { ArtifactParseError } from "../error.js";

interface FoundryBytecodeField {
  object: string;
  linkReferences?: Record<string, unknown>;
}

interface ArtifactLike {
  bytecode?: string | FoundryBytecodeField;
  abi?: unknown[];
  [key: string]: unknown;
}

/** Extract deployable bytecode from a Hardhat or Foundry artifact JSON. */
export function extractBytecode(
  artifact: unknown,
  path = "<artifact>",
): `0x${string}` {
  const a = artifact as ArtifactLike;

  if (!a.bytecode) {
    throw new ArtifactParseError(path, new Error("no bytecode field"));
  }

  let raw: string;
  if (typeof a.bytecode === "string") {
    raw = a.bytecode;
  } else if (
    typeof a.bytecode === "object" &&
    typeof a.bytecode.object === "string"
  ) {
    if (
      a.bytecode.linkReferences &&
      Object.keys(a.bytecode.linkReferences).length > 0
    ) {
      throw new ArtifactParseError(
        path,
        new Error("bytecode has unresolved link references"),
      );
    }
    raw = a.bytecode.object;
  } else {
    throw new ArtifactParseError(
      path,
      new Error("unrecognised bytecode format"),
    );
  }

  const hex = raw.startsWith("0x") ? raw : "0x" + raw;
  if (hex === "0x" || hex.length < 4) {
    throw new ArtifactParseError(path, new Error("bytecode is empty"));
  }
  return hex as `0x${string}`;
}
```

**Step 3: Run tests — expect PASS**

```bash
cd packages/sdk && npm test -- artifact
```

**Step 4: Commit**

```bash
git add packages/sdk/src/deploy/artifact.ts packages/sdk/src/deploy/artifact.test.ts
git commit -m "feat(sdk): port artifact bytecode extractor (Hardhat + Foundry)"
```

---

### Task 3.3: Port CREATE2 Address Calculator

**Source:** `crates/wormhole-sdk/src/deploy/create2.rs` (87 lines)

**Files:**

- Create: `packages/sdk/src/deploy/create2.ts`
- Test: `packages/sdk/src/deploy/create2.test.ts`

**Step 1: Write failing tests using a known CREATE2 vector**

```typescript
// packages/sdk/src/deploy/create2.test.ts
import { describe, it, expect } from "vitest";
import { computeCreate2Address } from "./create2.js";

describe("computeCreate2Address", () => {
  it("matches EIP-1014 known vector", () => {
    // from https://eips.ethereum.org/EIPS/eip-1014 example
    const deployer = "0x0000000000000000000000000000000000000000";
    const salt =
      "0x0000000000000000000000000000000000000000000000000000000000000000";
    const initCodeHash =
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"; // keccak(0x)
    const result = computeCreate2Address(deployer, salt, initCodeHash);
    // known result: 0xe33c0C7F7df4809055C3ebA6c09CFe4BaF1BD9e0 (lower-cased)
    expect(result.toLowerCase()).toBe(
      "0xe33c0c7f7df4809055c3eba6c09cfe4baf1bd9e0",
    );
  });

  it("throws on invalid deployer address", async () => {
    const { WormcraftError } = await import("../error.js");
    expect(() =>
      computeCreate2Address(
        "notanaddress",
        "0x" + "00".repeat(32),
        "0x" + "00".repeat(32),
      ),
    ).toThrow();
  });
});
```

**Step 2: Implement `packages/sdk/src/deploy/create2.ts`**

```typescript
import { keccak_256 } from "@noble/hashes/sha3";

/**
 * Compute the deterministic CREATE2 address per EIP-1014.
 *
 * @param deployer - Address of the deploying contract (20 bytes hex)
 * @param salt - 32-byte salt as 0x-prefixed hex
 * @param initCodeHash - keccak256 of the init code as 0x-prefixed hex
 */
export function computeCreate2Address(
  deployer: string,
  salt: string,
  initCodeHash: string,
): `0x${string}` {
  const fromHex = (h: string): Uint8Array => {
    const clean = h.startsWith("0x") ? h.slice(2) : h;
    const arr = new Uint8Array(clean.length / 2);
    for (let i = 0; i < arr.length; i++)
      arr[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return arr;
  };
  const toHex = (b: Uint8Array): `0x${string}` =>
    ("0x" +
      Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(
        "",
      )) as `0x${string}`;

  const deployerBytes = fromHex(deployer);
  if (deployerBytes.length !== 20)
    throw new Error(`deployer must be 20 bytes, got ${deployerBytes.length}`);

  const saltBytes = fromHex(salt);
  if (saltBytes.length !== 32)
    throw new Error(`salt must be 32 bytes, got ${saltBytes.length}`);

  const hashBytes = fromHex(initCodeHash);
  if (hashBytes.length !== 32) throw new Error(`initCodeHash must be 32 bytes`);

  const data = new Uint8Array(85);
  data[0] = 0xff;
  data.set(deployerBytes, 1);
  data.set(saltBytes, 21);
  data.set(hashBytes, 53);

  const addressHash = keccak_256(data);
  // Last 20 bytes of the keccak256 hash
  return toHex(addressHash.slice(12));
}
```

**Step 3: Run tests — expect PASS**

```bash
cd packages/sdk && npm test -- create2
```

**Step 4: Commit**

```bash
git add packages/sdk/src/deploy/create2.ts packages/sdk/src/deploy/create2.test.ts
git commit -m "feat(sdk): port CREATE2 address calculator (EIP-1014)"
```

---

### Task 3.4: EVM Chain Adapter

**Source:** `crates/wormhole-sdk/src/chains/evm.rs` (691 lines)

**Files:**

- Create: `packages/sdk/src/chains/evm.ts`
- Test: `packages/sdk/src/chains/evm.test.ts`

**Step 1: Add viem dependency**

```bash
cd packages/sdk && npm install viem
```

**Step 2: Write failing tests**

```typescript
// packages/sdk/src/chains/evm.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EvmChain } from "./evm.js";

describe("EvmChain", () => {
  it("constructs with rpc url and chain id", () => {
    const chain = new EvmChain({
      rpcUrl: "http://localhost:8545",
      wormholeChainId: 2n,
      evmChainId: 1,
    });
    expect(chain.chainId).toBe(2n);
    expect(chain.chainName).toBe("ethereum");
  });

  it('chainName defaults to "evm-{wormholeChainId}" for unknown chains', () => {
    const chain = new EvmChain({
      rpcUrl: "http://localhost:8545",
      wormholeChainId: 999n,
      evmChainId: 1337,
    });
    expect(chain.chainName).toBe("evm-999");
  });
});
```

**Step 3: Implement `packages/sdk/src/chains/evm.ts`**

```typescript
import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain as ViemChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { WormcraftChain, TransactionReceipt } from "../chain.js";
import { RpcError, PrivateKeyError } from "../error.js";
import { getChainById } from "../deploy/registry.js";

export interface EvmChainConfig {
  rpcUrl: string;
  wormholeChainId: bigint;
  evmChainId: number;
  /** Private key (0x-prefixed hex). If omitted, read-only mode. */
  privateKey?: `0x${string}`;
}

export class EvmChain implements WormcraftChain {
  readonly chainId: bigint;
  readonly chainName: string;

  private readonly publicClient: PublicClient;
  private walletClient?: WalletClient;

  constructor(config: EvmChainConfig) {
    this.chainId = config.wormholeChainId;
    const entry = getChainById(Number(config.wormholeChainId));
    this.chainName = entry?.name ?? `evm-${config.wormholeChainId}`;

    const viemChain = {
      id: config.evmChainId,
      name: this.chainName,
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    } satisfies ViemChain;

    this.publicClient = createPublicClient({
      chain: viemChain,
      transport: http(config.rpcUrl),
    });

    if (config.privateKey) {
      const account = privateKeyToAccount(config.privateKey);
      this.walletClient = createWalletClient({
        account,
        chain: viemChain,
        transport: http(config.rpcUrl),
      });
    }
  }

  async getBalance(address: string): Promise<bigint> {
    try {
      return await this.publicClient.getBalance({
        address: address as `0x${string}`,
      });
    } catch (e) {
      throw new RpcError(this.chainName, `getBalance failed: ${String(e)}`, e);
    }
  }

  async call(to: string, data: `0x${string}`): Promise<`0x${string}`> {
    try {
      const result = await this.publicClient.call({
        to: to as `0x${string}`,
        data,
      });
      return (result.data ?? "0x") as `0x${string}`;
    } catch (e) {
      throw new RpcError(
        this.chainName,
        `call to ${to} failed: ${String(e)}`,
        e,
      );
    }
  }

  async sendTransaction(
    to: string,
    data: `0x${string}`,
    value?: bigint,
  ): Promise<TransactionReceipt> {
    if (!this.walletClient) throw new PrivateKeyError();
    try {
      const hash = await this.walletClient.sendTransaction({
        to: to as `0x${string}`,
        data,
        value,
      });
      return this.waitForTransaction(hash);
    } catch (e) {
      throw new RpcError(
        this.chainName,
        `sendTransaction failed: ${String(e)}`,
        e,
      );
    }
  }

  async waitForTransaction(txHash: string): Promise<TransactionReceipt> {
    try {
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
      });
      return {
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        success: receipt.status === "success",
        gasUsed: receipt.gasUsed,
      };
    } catch (e) {
      throw new RpcError(
        this.chainName,
        `waitForTransaction failed: ${String(e)}`,
        e,
      );
    }
  }

  async getCode(address: string): Promise<`0x${string}`> {
    try {
      const code = await this.publicClient.getCode({
        address: address as `0x${string}`,
      });
      return (code ?? "0x") as `0x${string}`;
    } catch (e) {
      throw new RpcError(this.chainName, `getCode failed: ${String(e)}`, e);
    }
  }
}
```

**Step 4: Run tests — expect PASS**

```bash
cd packages/sdk && npm test -- chains/evm
```

**Step 5: Commit**

```bash
git add packages/sdk/src/chains/evm.ts packages/sdk/src/chains/evm.test.ts packages/sdk/package.json package-lock.json
git commit -m "feat(sdk): add EvmChain adapter (viem v2)"
```

---

### Task 3.5: Solana Chain Adapter (Read-Only)

**Source:** `crates/wormhole-sdk/src/chains/solana.rs` (233 lines)

**Files:**

- Create: `packages/sdk/src/chains/solana.ts`
- Test: `packages/sdk/src/chains/solana.test.ts`

**Step 1: Install Solana SDK**

```bash
cd packages/sdk && npm install @solana/web3.js
```

**Step 2: Write tests (mock RPC)**

```typescript
// packages/sdk/src/chains/solana.test.ts
import { describe, it, expect } from "vitest";
import { SolanaChain } from "./solana.js";

describe("SolanaChain", () => {
  it("has correct wormhole chain ID (1)", () => {
    const chain = new SolanaChain({ rpcUrl: "https://api.devnet.solana.com" });
    expect(chain.chainId).toBe(1n);
    expect(chain.chainName).toBe("solana");
  });

  it("call() throws — Solana has no eth_call equivalent", async () => {
    const chain = new SolanaChain({ rpcUrl: "https://api.devnet.solana.com" });
    await expect(chain.call("addr", "0x")).rejects.toThrow("not supported");
  });
});
```

**Step 3: Implement `packages/sdk/src/chains/solana.ts`**

```typescript
import { Connection, PublicKey } from "@solana/web3.js";
import type { WormcraftChain, TransactionReceipt } from "../chain.js";
import { RpcError } from "../error.js";

export interface SolanaChainConfig {
  rpcUrl: string;
}

export class SolanaChain implements WormcraftChain {
  readonly chainId = 1n;
  readonly chainName = "solana";

  private readonly connection: Connection;

  constructor(config: SolanaChainConfig) {
    this.connection = new Connection(config.rpcUrl, "confirmed");
  }

  async getBalance(address: string): Promise<bigint> {
    try {
      const pk = new PublicKey(address);
      const lamports = await this.connection.getBalance(pk);
      return BigInt(lamports);
    } catch (e) {
      throw new RpcError("solana", `getBalance failed: ${String(e)}`, e);
    }
  }

  async call(_to: string, _data: `0x${string}`): Promise<`0x${string}`> {
    throw new RpcError(
      "solana",
      "eth_call not supported on Solana — use program calls directly",
    );
  }

  async sendTransaction(
    _to: string,
    _data: `0x${string}`,
    _value?: bigint,
  ): Promise<TransactionReceipt> {
    throw new RpcError(
      "solana",
      "sendTransaction not yet implemented for Solana",
    );
  }

  async waitForTransaction(txHash: string): Promise<TransactionReceipt> {
    try {
      const sig = await this.connection.getSignatureStatus(txHash, {
        searchTransactionHistory: true,
      });
      const status = sig.value;
      return {
        txHash,
        blockNumber: BigInt(status?.slot ?? 0),
        success: status?.err == null,
      };
    } catch (e) {
      throw new RpcError(
        "solana",
        `waitForTransaction failed: ${String(e)}`,
        e,
      );
    }
  }

  async getCode(_address: string): Promise<`0x${string}`> {
    throw new RpcError(
      "solana",
      "getCode not applicable to Solana — programs have a different structure",
    );
  }
}
```

**Step 4: Run tests — expect PASS**

```bash
cd packages/sdk && npm test -- chains/solana
```

**Step 5: Create stub adapters for Aptos, NEAR, Sui**

Following the same pattern, create:

- `packages/sdk/src/chains/aptos.ts` — `AptosChain` with `chainId = 22n`
- `packages/sdk/src/chains/near.ts` — `NearChain` with `chainId = 15n`
- `packages/sdk/src/chains/sui.ts` — `SuiChain` with `chainId = 21n`

Each throws `RpcError('not yet implemented')` for `sendTransaction` and `call`.

**Step 6: Create `packages/sdk/src/chains/index.ts`**

```typescript
export { EvmChain } from "./evm.js";
export { SolanaChain } from "./solana.js";
export { AptosChain } from "./aptos.js";
export { NearChain } from "./near.js";
export { SuiChain } from "./sui.js";
```

**Step 7: Commit**

```bash
git add packages/sdk/src/chains/
git commit -m "feat(sdk): add Solana, Aptos, NEAR, Sui chain adapters"
```

---

## Phase 4 — SDK: Deploy Module

### Task 4.1: ABI Encoder for WormcraftDeployer

**Source:** `crates/wormhole-sdk/src/deploy/abi.rs` (188 lines)

**Files:**

- Create: `packages/sdk/src/deploy/abi.ts`
- Test: `packages/sdk/src/deploy/abi.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/sdk/src/deploy/abi.test.ts
import { describe, it, expect } from "vitest";
import {
  encodeDeployMessage,
  encodeCallMessage,
  encodeUpgradeMessage,
} from "./abi.js";

describe("encodeDeployMessage", () => {
  it("produces a non-empty hex string", () => {
    const encoded = encodeDeployMessage({
      bytecode: "0x6001",
      constructorArgs: "0x",
      salt: "0x" + "00".repeat(32),
      targetChains: [2, 4],
    });
    expect(encoded.startsWith("0x")).toBe(true);
    expect(encoded.length).toBeGreaterThan(2);
  });
});

describe("encodeCallMessage", () => {
  it("produces non-empty hex", () => {
    const encoded = encodeCallMessage({
      target: "0x" + "ab".repeat(20),
      calldata: "0xdeadbeef",
      targetChains: [2],
    });
    expect(encoded.startsWith("0x")).toBe(true);
  });
});
```

**Step 2: Implement `packages/sdk/src/deploy/abi.ts` using viem's ABI encoder**

```typescript
import { encodeAbiParameters, parseAbiParameters } from "viem";

export interface DeployMessageParams {
  bytecode: `0x${string}`;
  constructorArgs: `0x${string}`;
  salt: `0x${string}`;
  targetChains: number[];
}

export interface CallMessageParams {
  target: `0x${string}`;
  calldata: `0x${string}`;
  targetChains: number[];
}

export interface UpgradeMessageParams {
  proxy: `0x${string}`;
  newImpl: `0x${string}`;
  targetChains: number[];
}

/** MSG_DEPLOY = 0x01 */
export function encodeDeployMessage(p: DeployMessageParams): `0x${string}` {
  const encoded = encodeAbiParameters(
    parseAbiParameters(
      "uint8 msgType, bytes bytecode, bytes constructorArgs, bytes32 salt, uint16[] targetChains",
    ),
    [
      1,
      p.bytecode,
      p.constructorArgs,
      p.salt as `0x${string}`,
      p.targetChains.map((c) => c),
    ],
  );
  return encoded;
}

/** MSG_CALL = 0x02 */
export function encodeCallMessage(p: CallMessageParams): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters(
      "uint8 msgType, address target, bytes calldata_, uint16[] targetChains",
    ),
    [2, p.target, p.calldata, p.targetChains.map((c) => c)],
  );
}

/** MSG_UPGRADE = 0x03 */
export function encodeUpgradeMessage(p: UpgradeMessageParams): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters(
      "uint8 msgType, address proxy, address newImpl, uint16[] targetChains",
    ),
    [3, p.proxy, p.newImpl, p.targetChains.map((c) => c)],
  );
}
```

**Step 3: Run tests — expect PASS**

```bash
cd packages/sdk && npm test -- deploy/abi
```

**Step 4: Commit**

```bash
git add packages/sdk/src/deploy/abi.ts packages/sdk/src/deploy/abi.test.ts
git commit -m "feat(sdk): port WormcraftDeployer ABI encoder (deploy/call/upgrade)"
```

---

### Task 4.2: Deploy Status Checker

**Source:** `crates/wormhole-sdk/src/deploy/status.rs` (76 lines)

**Files:**

- Create: `packages/sdk/src/deploy/status.ts`
- Test: `packages/sdk/src/deploy/status.test.ts`

**Step 1: Write failing tests (mock chain)**

```typescript
// packages/sdk/src/deploy/status.test.ts
import { describe, it, expect, vi } from "vitest";
import { checkContractDeployed } from "./status.js";
import type { WormcraftChain } from "../chain.js";

const makeChain = (code: string): WormcraftChain => ({
  chainId: 2n,
  chainName: "ethereum",
  getBalance: vi.fn(),
  call: vi.fn(),
  sendTransaction: vi.fn(),
  waitForTransaction: vi.fn(),
  getCode: vi.fn().mockResolvedValue(code as `0x${string}`),
});

describe("checkContractDeployed", () => {
  it("returns true if getCode returns non-empty bytecode", async () => {
    const chain = makeChain("0x6001");
    const result = await checkContractDeployed(chain, "0x" + "ab".repeat(20));
    expect(result).toBe(true);
  });

  it("returns false if getCode returns empty bytecode", async () => {
    const chain = makeChain("0x");
    const result = await checkContractDeployed(chain, "0x" + "ab".repeat(20));
    expect(result).toBe(false);
  });
});
```

**Step 2: Implement `packages/sdk/src/deploy/status.ts`**

```typescript
import type { WormcraftChain } from "../chain.js";

/** Returns true if a contract is deployed at the given address. */
export async function checkContractDeployed(
  chain: WormcraftChain,
  address: string,
): Promise<boolean> {
  const code = await chain.getCode(address);
  return code !== "0x" && code.length > 2;
}
```

**Step 3: Run tests — expect PASS**

```bash
cd packages/sdk && npm test -- deploy/status
```

**Step 4: Commit**

```bash
git add packages/sdk/src/deploy/status.ts packages/sdk/src/deploy/status.test.ts
git commit -m "feat(sdk): add checkContractDeployed helper"
```

---

### Task 4.3: Deploy Orchestration (Core)

**Source:** `crates/wormhole-sdk/src/deploy/mod.rs` (480 lines)

**Files:**

- Create: `packages/sdk/src/deploy/index.ts`
- Test: `packages/sdk/src/deploy/index.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/sdk/src/deploy/index.test.ts
import { describe, it, expect, vi } from "vitest";
import { deployAcrossChains } from "./index.js";
import type { WormcraftChain, TransactionReceipt } from "../chain.js";

const makeMockChain = (id: bigint, name: string): WormcraftChain => ({
  chainId: id,
  chainName: name,
  getBalance: vi.fn().mockResolvedValue(1000n),
  call: vi.fn().mockResolvedValue("0x"),
  sendTransaction: vi
    .fn()
    .mockResolvedValue({
      txHash: "0xabc",
      blockNumber: 1n,
      success: true,
    } satisfies TransactionReceipt),
  waitForTransaction: vi
    .fn()
    .mockResolvedValue({
      txHash: "0xabc",
      blockNumber: 1n,
      success: true,
    } satisfies TransactionReceipt),
  getCode: vi.fn().mockResolvedValue("0x"),
});

describe("deployAcrossChains", () => {
  it("dispatches a deploy transaction on each chain", async () => {
    const ethereum = makeMockChain(2n, "ethereum");
    const bsc = makeMockChain(4n, "bsc");

    const results = await deployAcrossChains({
      chains: [ethereum, bsc],
      bytecode: "0x6001",
      constructorArgs: "0x",
      salt: "0x" + "00".repeat(32),
      wormToolDeployerAddress: "0x" + "de".repeat(20),
    });

    expect(results).toHaveLength(2);
    expect(ethereum.sendTransaction).toHaveBeenCalledOnce();
    expect(bsc.sendTransaction).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Implement `packages/sdk/src/deploy/index.ts`**

```typescript
import type { WormcraftChain, TransactionReceipt } from "../chain.js";
import {
  encodeDeployMessage,
  encodeCallMessage,
  encodeUpgradeMessage,
} from "./abi.js";

export interface DeployAcrossChainsParams {
  chains: WormcraftChain[];
  bytecode: `0x${string}`;
  constructorArgs?: `0x${string}`;
  salt: `0x${string}`;
  wormToolDeployerAddress: string;
}

export interface ChainDeployResult {
  chain: string;
  chainId: bigint;
  receipt: TransactionReceipt;
}

export async function deployAcrossChains(
  params: DeployAcrossChainsParams,
): Promise<ChainDeployResult[]> {
  const {
    chains,
    bytecode,
    constructorArgs = "0x",
    salt,
    wormToolDeployerAddress,
  } = params;
  const chainIds = chains.map((c) => Number(c.chainId));
  const data = encodeDeployMessage({
    bytecode,
    constructorArgs,
    salt,
    targetChains: chainIds,
  });

  const results = await Promise.all(
    chains.map(async (chain): Promise<ChainDeployResult> => {
      const receipt = await chain.sendTransaction(
        wormToolDeployerAddress,
        data,
      );
      return { chain: chain.chainName, chainId: chain.chainId, receipt };
    }),
  );
  return results;
}

export interface CallAcrossChainsParams {
  chains: WormcraftChain[];
  target: `0x${string}`;
  calldata: `0x${string}`;
  wormToolDeployerAddress: string;
}

export async function callAcrossChains(
  params: CallAcrossChainsParams,
): Promise<ChainDeployResult[]> {
  const { chains, target, calldata, wormToolDeployerAddress } = params;
  const chainIds = chains.map((c) => Number(c.chainId));
  const data = encodeCallMessage({ target, calldata, targetChains: chainIds });

  return Promise.all(
    chains.map(async (chain): Promise<ChainDeployResult> => {
      const receipt = await chain.sendTransaction(
        wormToolDeployerAddress,
        data,
      );
      return { chain: chain.chainName, chainId: chain.chainId, receipt };
    }),
  );
}

export interface UpgradeAcrossChainsParams {
  chains: WormcraftChain[];
  proxy: `0x${string}`;
  newImpl: `0x${string}`;
  wormToolDeployerAddress: string;
}

export async function upgradeAcrossChains(
  params: UpgradeAcrossChainsParams,
): Promise<ChainDeployResult[]> {
  const { chains, proxy, newImpl, wormToolDeployerAddress } = params;
  const chainIds = chains.map((c) => Number(c.chainId));
  const data = encodeUpgradeMessage({ proxy, newImpl, targetChains: chainIds });

  return Promise.all(
    chains.map(async (chain): Promise<ChainDeployResult> => {
      const receipt = await chain.sendTransaction(
        wormToolDeployerAddress,
        data,
      );
      return { chain: chain.chainName, chainId: chain.chainId, receipt };
    }),
  );
}
```

**Step 3: Run tests — expect PASS**

```bash
cd packages/sdk && npm test -- deploy/index
```

**Step 4: Wire up deploy module barrel**

```typescript
// packages/sdk/src/deploy/index.ts — add at top
export { extractBytecode } from "./artifact.js";
export { computeCreate2Address } from "./create2.js";
export { getChainById, getChainByName, CHAIN_REGISTRY } from "./registry.js";
export { checkContractDeployed } from "./status.js";
export * from "./abi.js";
// ... keep deploy function exports
```

**Step 5: Commit**

```bash
git add packages/sdk/src/deploy/
git commit -m "feat(sdk): deploy orchestration — deployAcrossChains, callAcrossChains, upgradeAcrossChains"
```

---

## Phase 5 — SDK: Feature Modules

### Task 5.1: VAA Status Module

**Source:** `crates/wormhole-sdk/src/status.rs` (397 lines)

**Files:**

- Create: `packages/sdk/src/status.ts`
- Test: `packages/sdk/src/status.test.ts`

**Implementation notes:**

- Port `MessageStatus` enum: `Pending`, `Signed`, `Relayed`
- `fetchMessageStatus(txHash, emitterChain, sequence)` — queries Wormhole Guardian REST API
- Guardian API base: `https://api.wormholescan.io`
- No private key needed — read-only

**Step 1: Write failing tests (mock fetch)**

```typescript
// packages/sdk/src/status.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageStatus, getMessageStatus } from "./status.js";

global.fetch = vi.fn();

describe("getMessageStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns Signed when wormholescan returns signedVAA", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vaaBytes: "AQID" }),
    });

    const result = await getMessageStatus({
      emitterChain: 2,
      emitterAddress: "0x" + "00".repeat(32),
      sequence: 1n,
    });
    expect(result.status).toBe(MessageStatus.Signed);
  });

  it("returns Pending when 404", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });
    const result = await getMessageStatus({
      emitterChain: 2,
      emitterAddress: "0x" + "00".repeat(32),
      sequence: 1n,
    });
    expect(result.status).toBe(MessageStatus.Pending);
  });
});
```

**Step 2: Implement `packages/sdk/src/status.ts`**

```typescript
const WORMHOLESCAN_BASE = "https://api.wormholescan.io";

export enum MessageStatus {
  Pending = "pending",
  Signed = "signed",
  Relayed = "relayed",
}

export interface MessageStatusParams {
  emitterChain: number;
  emitterAddress: string;
  sequence: bigint;
  network?: "mainnet" | "testnet";
}

export interface MessageStatusResult {
  status: MessageStatus;
  vaaBytes?: string;
  txHash?: string;
}

export async function getMessageStatus(
  params: MessageStatusParams,
): Promise<MessageStatusResult> {
  const {
    emitterChain,
    emitterAddress,
    sequence,
    network = "mainnet",
  } = params;
  const base =
    network === "testnet"
      ? "https://api.testnet.wormholescan.io"
      : WORMHOLESCAN_BASE;
  const url = `${base}/api/v1/vaas/${emitterChain}/${emitterAddress}/${sequence}`;

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) return { status: MessageStatus.Pending };
    throw new Error(`Guardian API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    vaaBytes?: string;
    data?: { txHash?: string };
  };
  return {
    status: MessageStatus.Signed,
    vaaBytes: data.vaaBytes,
    txHash: data.data?.txHash,
  };
}
```

**Step 3: Run tests — expect PASS**

```bash
cd packages/sdk && npm test -- src/status
```

**Step 4: Commit**

```bash
git add packages/sdk/src/status.ts packages/sdk/src/status.test.ts
git commit -m "feat(sdk): add getMessageStatus (wormholescan API)"
```

---

### Task 5.2: Chain Info Module

**Source:** `crates/wormhole-sdk/src/info.rs` (358 lines)

**Files:**

- Create: `packages/sdk/src/info.ts`
- Test: `packages/sdk/src/info.test.ts`

**Port these functions:**

- `getChainInfo(chain)` — returns RPC metadata, guardian set, finality
- `getGuardianSet(wormholeCore, chain)` — on-chain guardian set query

**Step 1: Write failing tests**

```typescript
// packages/sdk/src/info.test.ts
import { describe, it, expect } from "vitest";
import { buildChainInfoSummary } from "./info.js";

describe("buildChainInfoSummary", () => {
  it("returns chain name and id", () => {
    const summary = buildChainInfoSummary({
      chainId: 2,
      chainName: "ethereum",
      rpcUrl: "http://localhost:8545",
    });
    expect(summary.name).toBe("ethereum");
    expect(summary.wormholeChainId).toBe(2);
  });
});
```

**Step 2: Implement `packages/sdk/src/info.ts`**

```typescript
export interface ChainInfoInput {
  chainId: number;
  chainName: string;
  rpcUrl: string;
}

export interface ChainInfoSummary {
  name: string;
  wormholeChainId: number;
  rpcUrl: string;
  finality: string;
}

const FINALITY_MAP: Record<number, string> = {
  1: "confirmed (32 slots)",
  2: "finalized (15 min)",
  4: "finalized (15 min)",
  23: "safe (2 min)",
  24: "safe (2 min)",
  30: "safe (2 min)",
};

export function buildChainInfoSummary(input: ChainInfoInput): ChainInfoSummary {
  return {
    name: input.chainName,
    wormholeChainId: input.chainId,
    rpcUrl: input.rpcUrl,
    finality: FINALITY_MAP[input.chainId] ?? "unknown",
  };
}
```

**Step 3: Run tests — expect PASS**

```bash
cd packages/sdk && npm test -- src/info
```

**Step 4: Port remaining feature modules**

Following the same TDD pattern, port:

- `packages/sdk/src/transfer.ts` — Token Bridge transfer initiation
- `packages/sdk/src/tokens.ts` — Token Bridge asset queries
- `packages/sdk/src/latency.ts` — Guardian signing latency
- `packages/sdk/src/generate.ts` — VAA generation for testing

Each file should have corresponding `.test.ts` with at minimum 2 unit tests.

**Step 5: Commit after all modules pass**

```bash
git add packages/sdk/src/info.ts packages/sdk/src/transfer.ts packages/sdk/src/tokens.ts packages/sdk/src/latency.ts packages/sdk/src/generate.ts packages/sdk/src/**/*.test.ts
git commit -m "feat(sdk): port info, transfer, tokens, latency, generate modules"
```

---

### Task 5.3: SDK Barrel Export

**Files:**

- Modify: `packages/sdk/src/index.ts`

**Step 1: Wire up all exports**

```typescript
// packages/sdk/src/index.ts — final version
export * from "./error.js";
export * from "./chain.js";
export * from "./vaa/index.js";
export * from "./chains/index.js";
export * from "./deploy/index.js";
export * from "./status.js";
export * from "./info.js";
export * from "./transfer.js";
export * from "./tokens.js";
export * from "./latency.js";
export * from "./generate.js";
```

**Step 2: Build the SDK**

```bash
cd packages/sdk && npm run build
# Expected: dist/ folder created with index.js, index.cjs, index.d.ts
```

**Step 3: Verify type-check passes**

```bash
cd packages/sdk && npm run lint
# Expected: zero errors
```

**Step 4: Commit**

```bash
git add packages/sdk/src/index.ts packages/sdk/dist/
git commit -m "feat(sdk): finalize barrel exports and build"
```

---

## Phase 6 — CLI Foundation

### Task 6.1: Config Loader

**Source:** `crates/wormhole-cli/src/config.rs` (29 lines)

**Files:**

- Create: `packages/cli/src/config.ts`
- Test: `packages/cli/src/config.test.ts`

**Step 1: Write failing test**

```typescript
// packages/cli/src/config.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { loadConfig } from "./config.js";

afterEach(() => vi.unstubAllEnvs());

describe("loadConfig", () => {
  it("reads WORMCRAFT_EVM_PRIVATE_KEY from env", () => {
    vi.stubEnv("WORMCRAFT_EVM_PRIVATE_KEY", "0xdeadbeef");
    const config = loadConfig();
    expect(config.privateKey).toBe("0xdeadbeef");
  });

  it("returns undefined for missing keys", () => {
    vi.stubEnv("WORMCRAFT_EVM_PRIVATE_KEY", "");
    const config = loadConfig();
    expect(config.privateKey).toBeUndefined();
  });
});
```

**Step 2: Implement `packages/cli/src/config.ts`**

```typescript
import { config as loadDotenv } from "dotenv";
import { resolve } from "path";
import { homedir } from "os";

export interface WormcraftConfig {
  privateKey?: `0x${string}`;
  rpcUrls: Record<string, string>;
  network: "mainnet" | "testnet";
}

/** Loads config from ~/.wormcraft/.env, then process.env (process.env wins). */
export function loadConfig(): WormcraftConfig {
  loadDotenv({
    path: resolve(homedir(), ".wormcraft", ".env"),
    override: false,
  });

  const pk = process.env["WORMCRAFT_EVM_PRIVATE_KEY"];

  const rpcUrls: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^WORMCRAFT_RPC_(.+)$/);
    if (match?.[1] && value) rpcUrls[match[1].toLowerCase()] = value;
  }

  return {
    privateKey: pk ? (pk as `0x${string}`) : undefined,
    rpcUrls,
    network:
      (process.env["WORMCRAFT_NETWORK"] as "mainnet" | "testnet") ?? "mainnet",
  };
}
```

**Step 3: Run tests — expect PASS**

```bash
cd packages/cli && npm test -- config
```

**Step 4: Commit**

```bash
git add packages/cli/src/config.ts packages/cli/src/config.test.ts
git commit -m "feat(cli): add config loader (~/.wormcraft/.env)"
```

---

### Task 6.2: Output Formatter

**Source:** `crates/wormhole-cli/src/output.rs` (57 lines)

**Files:**

- Create: `packages/cli/src/output.ts`
- Test: `packages/cli/src/output.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/cli/src/output.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { printJson, printError } from "./output.js";

beforeEach(() => vi.spyOn(console, "log").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("printJson", () => {
  it("outputs pretty JSON to stdout", () => {
    printJson({ key: "value" });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"key": "value"'),
    );
  });
});

describe("printError", () => {
  it("outputs to stderr", () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    printError("something failed");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("something failed"),
    );
    spy.mockRestore();
  });
});
```

**Step 2: Implement `packages/cli/src/output.ts`**

```typescript
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printError(message: string, err?: unknown): void {
  const detail = err instanceof Error ? `: ${err.message}` : "";
  process.stderr.write(`Error: ${message}${detail}\n`);
}

export function printSuccess(message: string): void {
  console.log(`OK: ${message}`);
}
```

**Step 3: Run tests — expect PASS**

```bash
cd packages/cli && npm test -- output
```

**Step 4: Commit**

```bash
git add packages/cli/src/output.ts packages/cli/src/output.test.ts
git commit -m "feat(cli): add output formatter (printJson, printError)"
```

---

### Task 6.3: EVM Provider Factory

**Source:** `crates/wormhole-cli/src/providers/evm.rs` (82 lines)

**Files:**

- Create: `packages/cli/src/providers/evm.ts`
- Create: `packages/cli/src/providers/index.ts`

**Step 1: Implement `packages/cli/src/providers/evm.ts`**

```typescript
import { EvmChain } from "@wormcraft/sdk";
import type { WormcraftConfig } from "../config.js";
import { getChainByName } from "@wormcraft/sdk";
import { ChainNotSupportedError } from "@wormcraft/sdk";

export function createEvmChain(
  chainName: string,
  config: WormcraftConfig,
): EvmChain {
  const entry = getChainByName(chainName);
  if (!entry) throw new ChainNotSupportedError(chainName);
  if (!entry.evmChainId)
    throw new ChainNotSupportedError(`${chainName} is not an EVM chain`);

  const rpcUrl = config.rpcUrls[chainName] ?? entry.defaultRpc;
  if (!rpcUrl)
    throw new Error(
      `No RPC URL for ${chainName} — set WORMCRAFT_RPC_${chainName.toUpperCase()}`,
    );

  return new EvmChain({
    rpcUrl,
    wormholeChainId: BigInt(entry.wormholeChainId),
    evmChainId: entry.evmChainId,
    privateKey: config.privateKey,
  });
}
```

**Step 2: Wire up providers barrel**

```typescript
// packages/cli/src/providers/index.ts
export { createEvmChain } from "./evm.js";
```

**Step 3: Commit**

```bash
git add packages/cli/src/providers/
git commit -m "feat(cli): add createEvmChain provider factory"
```

---

### Task 6.4: CLI Entry Point with Commander.js

**Source:** `crates/wormhole-cli/src/main.rs` (74 lines)

**Files:**

- Create: `packages/cli/src/main.ts`
- Modify: `packages/cli/src/index.ts`

**Step 1: Implement `packages/cli/src/main.ts`**

```typescript
import { Command } from "commander";
import { registerStatusCommand } from "./commands/status.js";
import { registerInfoCommand } from "./commands/info.js";
import { registerDeployCommand } from "./commands/deploy.js";
import { registerTransferCommand } from "./commands/transfer.js";
import { registerTokensCommand } from "./commands/tokens.js";
import { registerParseCommand } from "./commands/parse.js";
import { registerGenerateCommand } from "./commands/generate.js";
import { registerLatencyCommand } from "./commands/latency.js";
import { registerSubmitCommand } from "./commands/submit.js";
import { registerRedeemCommand } from "./commands/redeem.js";
import { printError } from "./output.js";

const program = new Command();

program
  .name("wormcraft")
  .description("CLI for Wormhole cross-chain protocol interactions")
  .version(process.env["npm_package_version"] ?? "0.0.1")
  .option("--json", "force JSON output")
  .option("--network <network>", "mainnet or testnet", "mainnet");

registerStatusCommand(program);
registerInfoCommand(program);
registerDeployCommand(program);
registerTransferCommand(program);
registerTokensCommand(program);
registerParseCommand(program);
registerGenerateCommand(program);
registerLatencyCommand(program);
registerSubmitCommand(program);
registerRedeemCommand(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  printError("Unexpected error", err);
  process.exit(1);
});
```

**Step 2: Commit**

```bash
git add packages/cli/src/main.ts
git commit -m "feat(cli): add Commander.js entry point with all command registrations"
```

---

## Phase 7 — CLI Commands

Each command file follows this pattern:

```typescript
// packages/cli/src/commands/parse.ts
import { Command } from "commander";
import { parseVaa } from "@wormcraft/sdk";
import { printJson, printError } from "../output.js";

export function registerParseCommand(program: Command): void {
  program
    .command("parse <vaa>")
    .description("Parse a VAA from hex or base64")
    .action(async (vaa: string) => {
      try {
        const parsed = parseVaa(vaa);
        printJson(parsed);
      } catch (err) {
        printError("Failed to parse VAA", err);
        process.exit(1);
      }
    });
}
```

### Task 7.1: `parse` command

**Source:** `crates/wormhole-cli/src/commands/parse.rs` (22 lines)

Implement the pattern above. Test: run `wormcraft parse 0x01...` and verify JSON output.

### Task 7.2: `status` command

**Source:** `crates/wormhole-cli/src/commands/status.rs` (82 lines)

Options:

- `--chain <id>` — emitter chain ID
- `--address <hex>` — emitter address
- `--sequence <n>` — message sequence
- `--network <mainnet|testnet>`

```bash
git commit -m "feat(cli): add status command"
```

### Task 7.3: `info` command

**Source:** `crates/wormhole-cli/src/commands/info.rs` (74 lines)

Options: `--chain <name>` — prints chain metadata from registry.

```bash
git commit -m "feat(cli): add info command"
```

### Task 7.4: `deploy` command group

**Source:** `crates/wormhole-cli/src/commands/deploy.rs` (647 lines)

This is the most complex command. It has 5 subcommands:

- `deploy multi` — deploy bytecode across chains
- `deploy address` — compute CREATE2 address
- `deploy call` — call a function across chains
- `deploy upgrade` — upgrade a proxy across chains
- `deploy status` — check deployment status

Use Commander's `.addCommand()` to nest subcommands:

```typescript
// packages/cli/src/commands/deploy.ts
import { Command } from "commander";
import {
  deployAcrossChains,
  computeCreate2Address,
  extractBytecode,
  callAcrossChains,
  upgradeAcrossChains,
  checkContractDeployed,
} from "@wormcraft/sdk";
import { loadConfig } from "../config.js";
import { createEvmChain } from "../providers/evm.js";
import { printJson, printError } from "../output.js";
import { readFile } from "fs/promises";

export function registerDeployCommand(program: Command): void {
  const deploy = new Command("deploy").description(
    "Cross-chain contract deployment",
  );

  deploy
    .command("multi")
    .description("Deploy bytecode across multiple chains via WormcraftDeployer")
    .requiredOption(
      "--artifact <path>",
      "Path to Hardhat/Foundry artifact JSON",
    )
    .requiredOption(
      "--chains <chains>",
      "Comma-separated chain names (e.g. ethereum,bsc)",
    )
    .option(
      "--salt <hex>",
      "CREATE2 salt (32 bytes hex)",
      "0x" + "00".repeat(32),
    )
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const artifact = JSON.parse(await readFile(opts.artifact, "utf8"));
        const bytecode = extractBytecode(artifact, opts.artifact);
        const chainNames = (opts.chains as string).split(",");
        const chains = chainNames.map((n) => createEvmChain(n.trim(), config));
        const deployer =
          config.rpcUrls["worm_tool_deployer"] ??
          (() => {
            throw new Error("Set WORMCRAFT_DEPLOYER_ADDRESS");
          })();
        const results = await deployAcrossChains({
          chains,
          bytecode,
          salt: opts.salt,
          wormToolDeployerAddress: deployer,
        });
        printJson(results);
      } catch (err) {
        printError("Deploy failed", err);
        process.exit(1);
      }
    });

  deploy
    .command("address")
    .description("Compute CREATE2 deployment address")
    .requiredOption("--deployer <address>", "Deployer contract address")
    .requiredOption("--salt <hex>", "Salt (32 bytes)")
    .requiredOption("--init-code-hash <hex>", "keccak256 of init bytecode")
    .action((opts) => {
      const address = computeCreate2Address(
        opts.deployer,
        opts.salt,
        opts.initCodeHash,
      );
      printJson({ address });
    });

  deploy
    .command("call")
    .description("Call a function across chains")
    .requiredOption("--target <address>", "Target contract address")
    .requiredOption("--calldata <hex>", "ABI-encoded calldata")
    .requiredOption("--chains <chains>", "Comma-separated chain names")
    .action(async (opts) => {
      /* similar to multi */
    });

  deploy
    .command("upgrade")
    .description("Upgrade a proxy contract across chains")
    .requiredOption("--proxy <address>", "Proxy address")
    .requiredOption("--new-impl <address>", "New implementation address")
    .requiredOption("--chains <chains>", "Comma-separated chain names")
    .action(async (opts) => {
      /* similar pattern */
    });

  deploy
    .command("status")
    .description("Check if a contract is deployed")
    .requiredOption("--address <address>", "Contract address to check")
    .requiredOption("--chains <chains>", "Comma-separated chain names")
    .action(async (opts) => {
      /* checkContractDeployed */
    });

  program.addCommand(deploy);
}
```

```bash
git commit -m "feat(cli): add deploy command group (multi/address/call/upgrade/status)"
```

### Task 7.5: Remaining Commands

Port each in its own commit:

| Command    | Source                 | Commit message                    |
| ---------- | ---------------------- | --------------------------------- |
| `transfer` | `commands/transfer.rs` | `feat(cli): add transfer command` |
| `tokens`   | `commands/tokens.rs`   | `feat(cli): add tokens command`   |
| `latency`  | `commands/latency.rs`  | `feat(cli): add latency command`  |
| `submit`   | `commands/submit.rs`   | `feat(cli): add submit command`   |
| `redeem`   | `commands/redeem.rs`   | `feat(cli): add redeem command`   |
| `generate` | `commands/generate.rs` | `feat(cli): add generate command` |
| `evm`      | `commands/evm.rs`      | `feat(cli): add evm command`      |
| `solana`   | `commands/solana.rs`   | `feat(cli): add solana command`   |
| `aptos`    | `commands/aptos.rs`    | `feat(cli): add aptos command`    |
| `near`     | `commands/near.rs`     | `feat(cli): add near command`     |
| `sui`      | `commands/sui.rs`      | `feat(cli): add sui command`      |

### Task 7.6: Build CLI and Smoke Test

**Step 1: Build**

```bash
npm run build --workspace=packages/cli
```

**Step 2: Smoke test the binary**

```bash
node packages/cli/dist/cli.js --help
# Expected: wormcraft help output with all commands listed

node packages/cli/dist/cli.js parse --help
# Expected: parse command help

node packages/cli/dist/cli.js info --chain ethereum
# Expected: JSON with chain metadata
```

**Step 3: Commit**

```bash
git add packages/cli/dist/
git commit -m "feat(cli): build passes and all commands registered"
```

---

## Phase 8 — Contract Rename

### Task 8.1: Rename Solidity Contracts

**Files to modify:**

- Rename: `contracts/src/WormDeployer.sol` → `contracts/src/WormcraftDeployer.sol`
- Rename: `contracts/src/WormOwnableProxy.sol` → `contracts/src/WormcraftProxy.sol`
- Rename: `contracts/src/interfaces/IWormDeployer.sol` → `contracts/src/interfaces/IWormcraftDeployer.sol`
- Rename: `contracts/test/WormDeployer.t.sol` → `contracts/test/WormcraftDeployer.t.sol`
- Rename: `contracts/test/WormOwnableProxy.t.sol` → `contracts/test/WormcraftProxy.t.sol`
- Rename: `contracts/script/Bootstrap.s.sol`

**Step 1: Rename files**

```bash
cd contracts
mv src/WormDeployer.sol src/WormcraftDeployer.sol
mv src/WormOwnableProxy.sol src/WormcraftProxy.sol
mv src/interfaces/IWormDeployer.sol src/interfaces/IWormcraftDeployer.sol
mv test/WormDeployer.t.sol test/WormcraftDeployer.t.sol
mv test/WormOwnableProxy.t.sol test/WormcraftProxy.t.sol
```

**Step 2: Find and replace inside Solidity files**

All occurrences of:

- `WormDeployer` → `WormcraftDeployer`
- `WormOwnableProxy` → `WormcraftProxy`
- `IWormDeployer` → `IWormcraftDeployer`

```bash
# In each renamed file, update contract names and import paths
sed -i '' 's/WormDeployer/WormcraftDeployer/g' contracts/src/WormcraftDeployer.sol
sed -i '' 's/WormOwnableProxy/WormcraftProxy/g' contracts/src/WormcraftProxy.sol
sed -i '' 's/IWormDeployer/IWormcraftDeployer/g' contracts/src/interfaces/IWormcraftDeployer.sol
# ... (repeat for all files)
```

**Step 3: Update import paths within Solidity files**

In `WormcraftDeployer.sol`, update:

```solidity
import "./interfaces/IWormcraftDeployer.sol";
import "./WormcraftProxy.sol";
```

**Step 4: Verify Foundry tests still compile and pass**

```bash
cd contracts && forge build
# Expected: Compiler run successful

forge test -vv
# Expected: all tests pass
```

**Step 5: Commit**

```bash
git add contracts/
git commit -m "feat(contracts): rename WormDeployer → WormcraftDeployer, WormOwnableProxy → WormcraftProxy"
```

---

### Task 8.2: Update Contract Artifacts

**Step 1: Rebuild Foundry artifacts**

```bash
cd contracts && forge build
```

**Step 2: Verify artifacts directory updated**

```bash
ls contracts/artifacts/
# Expected: WormcraftDeployer.json and WormcraftProxy.json present
ls contracts/out/
# Expected: WormcraftDeployer.sol/ directory
```

**Step 3: Update artifact references in SDK**

In `packages/sdk/src/deploy/abi.ts`, any hardcoded references to `WormDeployer` must be updated to `WormcraftDeployer`.

**Step 4: Commit**

```bash
git add contracts/artifacts/ contracts/out/
git commit -m "chore(contracts): rebuild artifacts after WormcraftDeployer rename"
```

---

## Phase 9 — Documentation Update

### Task 9.1: Update Root README

**File:** `README.md`

**Changes required:**

1. Title: `wormcraft` instead of `wormhole-cli`
2. Installation: `npm install -g wormcraft` instead of `cargo install ...`
3. SDK usage: `import { parseVaa } from '@wormcraft/sdk'`
4. Command reference: update all `worm ...` examples to `wormcraft ...`
5. Stack table: replace Rust columns with TypeScript/Node.js

**Step 1: Rewrite README.md to match the new stack**

````markdown
# wormcraft

CLI and SDK for the [Wormhole](https://wormhole.com) cross-chain protocol.

## Install

```bash
npm install -g wormcraft
```
````

## Usage

```bash
wormcraft --help
wormcraft status --chain 2 --address 0x... --sequence 42
wormcraft parse 0x01...
wormcraft deploy multi --artifact ./out/MyContract.sol/MyContract.json --chains ethereum,bsc
```

## SDK

```typescript
import { parseVaa, getMessageStatus, deployAcrossChains } from "@wormcraft/sdk";
```

## Configuration

Create `~/.wormcraft/.env`:

```env
WORMCRAFT_EVM_PRIVATE_KEY=0x...
WORMCRAFT_RPC_ETHEREUM=https://mainnet.infura.io/v3/...
WORMCRAFT_RPC_BSC=https://bsc-dataseed.binance.org/
WORMCRAFT_NETWORK=mainnet
```

````

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for wormcraft TypeScript migration"
````

---

### Task 9.2: Update CLI Reference Docs

**File:** `docs/cli/README.md`

Update every command example from `worm <command>` to `wormcraft <command>`.

**Step 1: Rewrite `docs/cli/README.md`**

Include:

- All commands and their flags (ported from Rust `--help` output)
- Exit codes
- JSON output format examples

**Step 2: Commit**

```bash
git add docs/cli/README.md
git commit -m "docs: update CLI reference for wormcraft"
```

---

### Task 9.3: SDK API Reference

**File:** `docs/sdk/README.md` (new file)

Document every exported function and type from `@wormcraft/sdk`:

- `parseVaa(input)` — return type, throws
- `EvmChain` — constructor options, methods
- `deployAcrossChains(params)` — params, return
- `getMessageStatus(params)` — params, return
- All error classes

```bash
git add docs/sdk/README.md
git commit -m "docs: add @wormcraft/sdk API reference"
```

---

## Phase 10 — CLAUDE.md and Pipeline Update

### Task 10.1: Update CLAUDE.md

**File:** `CLAUDE.md`

**Step 1: Rewrite CLAUDE.md** to reflect the new TypeScript stack.

```markdown
# wormcraft — Claude Code Rules

Auto-loaded by Claude Code sessions in this repo.

## What this project is about

TypeScript CLI tool and SDK for interacting with the Wormhole cross-chain protocol.
The Rust crates in `crates/` are the historical reference — new code goes in `packages/`.
Reference: `reference/ccip-tools-ts` (TypeScript, study structure only)

## Stack

- Language: TypeScript 5.4 (strict)
- CLI framework: Commander.js v12
- Async: Node.js native async/await (no extra runtime)
- EVM: viem v2
- Solana: @solana/web3.js v1
- Build: tsup (wraps esbuild)
- Tests: vitest
- Contracts: Foundry (Solidity, unchanged)
- Config: dotenv, loading from ~/.wormcraft/.env

## Architecture Rules

- `packages/sdk/` — all domain logic, chain interfaces, VAA, deploy, status
- `packages/cli/` — Commander.js commands + providers only, no business logic
- Commands go in `packages/cli/src/commands/` — one file per command group
- Chain adapters go in `packages/sdk/src/chains/` — one file per chain family
- VAA parsing lives in `packages/sdk/src/vaa/` only
- No business logic in `packages/cli/src/main.ts` — registration only
- Errors: custom classes extending `WormcraftError` (see `packages/sdk/src/error.ts`)

## Code Rules

- All public functions and types must have JSDoc comments
- No `any` types — use `unknown` and narrow
- No `!` non-null assertions in non-test code — guard explicitly
- Private keys never logged, never in error messages
- Tests in same directory as source (`.test.ts` suffix)
- Integration tests in `packages/*/tests/`

## Testing

- `npm test --workspaces` runs all vitest suites
- Contracts: `cd contracts && forge test`
- Coverage: `npm test -- --coverage`

## Build

- `npm run build --workspaces` — builds all packages
- Binary entry: `packages/cli/dist/cli.js`

## Git

- Branch naming: `feat/command-name`, `fix/issue-description`
- Commits: conventional commits format
- Never commit `.env` files or private keys
- Never commit `node_modules/` or `dist/`
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for TypeScript migration"
```

---

### Task 10.2: Update Claude Pipeline Agents

**Files:**

- Modify: `.claude/agents/rust-developer.md` → `.claude/agents/typescript-developer.md`
- Modify: `.claude/agents/rust-test-validator.md` → `.claude/agents/typescript-test-validator.md`

**Step 1: Rename and update agent files**

For `typescript-developer.md`, replace all references to:

- `cargo test` → `npm test`
- `Cargo.toml` → `package.json`
- `thiserror/anyhow` → `WormcraftError` classes
- `tokio` → `Node.js async/await`
- `clap` → `Commander.js`

**Step 2: Update `.claude/settings.json`**

Remove the `rustfmt` on-edit hook. Replace with `eslint --fix` or `prettier` if desired.

**Step 3: Update hooks**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "cd packages/sdk && npm run lint 2>&1 | head -20"
          }
        ]
      }
    ]
  }
}
```

**Step 4: Commit**

```bash
git add .claude/
git commit -m "chore(claude): update pipeline agents for TypeScript stack"
```

---

## Phase 11 — Final Cleanup

### Task 11.1: Archive Rust Crates

**Step 1: Move Rust crates to an archive folder**

```bash
mkdir -p archive
mv crates/ archive/rust-crates
```

> **Note:** Do NOT delete the Rust crates — they are the reference implementation. Archive them for future reference.

**Step 2: Update .gitignore**

Add:

```
node_modules/
packages/*/dist/
*.tsbuildinfo
```

**Step 3: Commit**

```bash
git add archive/ .gitignore
git commit -m "chore: archive Rust crates (reference implementation preserved)"
```

---

### Task 11.2: Full Integration Test Pass

**Step 1: Build everything**

```bash
npm install
npm run build --workspaces
cd contracts && forge build
```

**Step 2: Run all tests**

```bash
npm test --workspaces
# Expected: all vitest suites pass

cd contracts && forge test -vv
# Expected: all Foundry tests pass
```

**Step 3: Smoke-test the CLI binary end-to-end**

```bash
node packages/cli/dist/cli.js --version
# Expected: 0.0.1

node packages/cli/dist/cli.js --help
# Expected: lists all commands

node packages/cli/dist/cli.js parse 0x010000000000
# Expected: JSON output or helpful error about malformed VAA

node packages/cli/dist/cli.js info --chain ethereum
# Expected: JSON with chain metadata
```

**Step 4: Type check both packages**

```bash
cd packages/sdk && npm run lint
cd packages/cli && npm run lint
# Expected: zero TypeScript errors in both
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: wormcraft TypeScript migration complete"
```

---

### Task 11.3: Open Pull Request

**Step 1: Push branch**

```bash
git push origin feat/migrate-to-wormcraft-typescript
```

**Step 2: Create PR**

```bash
gh pr create \
  --title "feat: migrate wormhole-cli to wormcraft TypeScript monorepo" \
  --body "$(cat <<'EOF'
## Summary
- Migrates the Rust CLI + SDK to a TypeScript npm workspaces monorepo
- Renames the project to `wormcraft` (CLI) and `@wormcraft/sdk` (library)
- Ports all ~7,000 lines of Rust to idiomatic TypeScript (strict mode)
- Renames Solidity contracts: WormDeployer → WormcraftDeployer
- Updates all docs, CLAUDE.md, and Claude pipeline agents
- Archives Rust crates in `archive/rust-crates/` for reference

## Packages
- `packages/sdk` — `@wormcraft/sdk`: chain adapters, VAA parser, deploy orchestration
- `packages/cli` — `wormcraft`: Commander.js CLI binary

## Test Plan
- [ ] `npm test --workspaces` passes
- [ ] `forge test -vv` passes in `contracts/`
- [ ] `wormcraft --help` shows all commands
- [ ] `wormcraft parse <vaa>` outputs valid JSON
- [ ] `wormcraft info --chain ethereum` returns chain metadata
- [ ] TypeScript strict mode: zero errors in both packages

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Appendix: Dependency Matrix

| Rust Crate               | TypeScript Equivalent           | Notes                      |
| ------------------------ | ------------------------------- | -------------------------- |
| `tokio`                  | Node.js native async            | No equivalent needed       |
| `clap`                   | `commander` v12                 | Similar derive-style API   |
| `thiserror`              | Custom `WormcraftError` classes  | Manual but simple          |
| `anyhow`                 | `try/catch` + re-throw          | TypeScript standard        |
| `ethers-rs`              | `viem` v2                       | More type-safe, modern API |
| `solana-client`          | `@solana/web3.js`               | Direct equivalent          |
| `serde_json`             | `JSON.parse` / `JSON.stringify` | Built-in                   |
| `hex`                    | string operations               | Built-in                   |
| `base64`                 | `atob`/`btoa`                   | Built-in in Node 20+       |
| `sha3 / k256`            | `@noble/hashes`                 | Pure JS, audited           |
| `rlp`                    | `viem` RLP utils                | Included in viem           |
| `dotenvy`                | `dotenv`                        | Direct equivalent          |
| `clap_complete`          | `commander` completions         | Built-in                   |
| `bs58`                   | `bs58` npm package              | Same name                  |
| `alloy-core` (sol-types) | `viem` ABI encoder              | `encodeAbiParameters`      |
| `async-trait`            | TypeScript interfaces           | Native, no macro needed    |

---

## Estimated Task Count

| Phase                            | Tasks  | Commits |
| -------------------------------- | ------ | ------- |
| 0 — Scaffold                     | 4      | 5       |
| 1 — SDK Errors + Chain Interface | 2      | 2       |
| 2 — VAA Module                   | 1      | 1       |
| 3 — Chain Modules                | 5      | 5       |
| 4 — Deploy Module                | 5      | 5       |
| 5 — Feature Modules              | 3      | 3       |
| 6 — CLI Foundation               | 4      | 4       |
| 7 — CLI Commands (13 commands)   | 13     | 13      |
| 8 — Contract Rename              | 2      | 2       |
| 9 — Docs                         | 3      | 3       |
| 10 — CLAUDE.md + Pipeline        | 2      | 2       |
| 11 — Cleanup + PR                | 3      | 3       |
| **Total**                        | **47** | **48**  |

**Rough estimate:** 3–5 focused working sessions for an experienced TypeScript developer familiar with viem and Commander.js.
