# CLI Polish & Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task.

**Goal:** Implement 10 UX improvements and new commands discovered during manual testing: shared table output, `info` ergonomics, optional sequence in `generate test-vaa`, deploy plan/diff table view, manifest error guidance, Beacon proxy detection, `wormcraft doctor`, `wormcraft deploy init`, and `deploy run --dry-run`.

**Architecture:** All changes are additive — no breaking changes to existing commands or SDK exports. Output infrastructure (Task 1) is foundational and must land first; Tasks 2–7 are independent of each other; Tasks 8–10 build on Task 1. SDK changes are isolated to their modules. New CLI commands live in `packages/cli/src/commands/` and are wired in `packages/cli/src/main.ts`.

**Tech Stack:** TypeScript 5.4 strict mode, Commander.js v12, vitest, tsup. No new runtime dependencies.

**Feature Branch:** `feat/cli-polish`

---

## Context for implementers

This project is a TypeScript CLI + SDK monorepo. Key conventions:

- Commands: `packages/cli/src/commands/<name>.ts` — exports `register<Name>Command(program: Command)`
- SDK modules: `packages/sdk/src/` — exported via `packages/sdk/src/index.ts`
- Tests: co-located with source as `*.test.ts` (vitest)
- Build: `npm run build` inside `packages/sdk` then `packages/cli` (tsup)
- Test: `npm test` inside `packages/sdk`
- No non-null assertions (`!`) in non-test code — use optional chaining or explicit checks
- Errors extend `WormcraftError` from `packages/sdk/src/error.ts`
- No comments unless the WHY is non-obvious; no docstrings beyond one-line JSDoc on exported functions

Relevant existing files to read before each task:
- `packages/cli/src/output.ts` — `printJson`, `printError`
- `packages/cli/src/commands/contracts.ts` — has `renderTable` (to be replaced)
- `packages/cli/src/commands/info.ts` — chain lookup commands
- `packages/cli/src/commands/deploy.ts` — deploy subcommands
- `packages/sdk/src/deploy/registry.ts` — `CHAIN_REGISTRY`, `getChainById`, `getChainByName`
- `packages/sdk/src/deploy/engine.ts` — `buildDeployPlan`, `runDeployment`
- `packages/sdk/src/deploy/manifest.ts` — `DeployManifest`, `parseManifest`
- `packages/sdk/src/toolchain/index.ts` — `detectToolchain`, `listArtifacts`

---

## Task 1: Shared `printTable` helper in `output.ts`

The `renderTable` function in `contracts.ts` handles exactly 3 fixed columns. Extract a reusable N-column helper into `output.ts`, then update `contracts list` to use it.

**Files:**
- Modify: `packages/cli/src/output.ts`
- Modify: `packages/cli/src/commands/contracts.ts` (remove `renderTable`, call `printTable`)
- Test: `packages/cli/src/output.test.ts` (create new)

### Step 1: Write failing test

Create `packages/cli/src/output.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatTable } from './output.js';

describe('formatTable', () => {
  it('aligns columns to max content width', () => {
    const result = formatTable(
      ['Name', 'Value'],
      [['foo', '1'], ['longname', '42']],
    );
    const lines = result.split('\n');
    // header
    expect(lines[0]).toBe('Name      Value');
    // separator
    expect(lines[1]).toBe('──────────────────');
    // row 1 — 'foo' padded to length of 'longname' (8)
    expect(lines[2]).toBe('foo       1    ');
    // row 2
    expect(lines[3]).toBe('longname  42   ');
  });

  it('returns "No results." line for empty rows', () => {
    const result = formatTable(['A', 'B'], []);
    expect(result).toBe('No results.');
  });

  it('handles single column', () => {
    const result = formatTable(['Chain'], [['ethereum'], ['sepolia']]);
    expect(result).toContain('ethereum');
    expect(result).toContain('sepolia');
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd packages/cli && npx vitest run src/output.test.ts
```
Expected: FAIL — `formatTable is not exported`

### Step 3: Implement `formatTable` in `output.ts`

Add to `packages/cli/src/output.ts`:

```typescript
/**
 * Format an N-column table with dynamic column widths.
 * Returns "No results." when rows is empty.
 */
export function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return 'No results.';
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? '').length))
  );
  const pad = (s: string, n: number) => s.padEnd(n);
  const sep = widths.map(w => '─'.repeat(w + 2)).join('').slice(0, -2);
  const fmt = (row: string[]) => row.map((c, i) => pad(c, widths[i]!)).join('  ');
  return [fmt(headers), sep, ...rows.map(fmt)].join('\n');
}
```

### Step 4: Run test to verify it passes

```bash
cd packages/cli && npx vitest run src/output.test.ts
```
Expected: 3 tests pass

### Step 5: Refactor `contracts.ts` to use `printTable`

In `packages/cli/src/commands/contracts.ts`:

1. Add to imports: `import { printJson, printError, formatTable } from '../output.js';`
2. Delete the entire `renderTable` function (lines 25–51).
3. Replace the call `console.log(renderTable(all))` with:

```typescript
const rows = all.map(c => {
  const args = c.constructorInputs.length === 0
    ? '—'
    : `(${c.constructorInputs.map(p => p.type).join(', ')})`;
  const suffix = c.isInterface ? '  ← interface' : c.isAbstract ? '  ← abstract' : '';
  return [c.name + suffix, c.sourcePath, args];
});
console.log(formatTable(['Contract', 'Source', 'Constructor Args'], rows));
```

### Step 6: Build and smoke-test

```bash
cd packages/sdk && npm run build
cd ../cli && npm run build
node dist/cli.js contracts list --project /tmp   # expects "Toolchain not found" error
```

### Step 7: Verify branch and commit

```bash
git branch --show-current  # must be feat/cli-polish, NOT main
git add packages/cli/src/output.ts packages/cli/src/output.test.ts packages/cli/src/commands/contracts.ts
git commit -m "feat: extract shared printTable helper, remove duplicate renderTable"
```

---

## Task 2: `info chains --testnet-only` flag

Currently `--testnet` means "include testnet chains" (shows mainnet + testnet). There is no way to show ONLY testnet chains. Add `--testnet-only`.

**Files:**
- Modify: `packages/cli/src/commands/info.ts`
- Test: in-file test or verify by running the built CLI

### Step 1: Write failing test

Add to `packages/cli/src/commands/info.test.ts` (create if it doesn't exist, or find the existing test file — check `packages/cli/src/commands/` for `*.test.ts` files):

```typescript
// In a describe block for the chains filtering logic, or as a standalone test:
it('--testnet-only returns only isTestnet chains', async () => {
  // The actual filtering logic is inline in the action handler.
  // Test the SDK-level filtering directly:
  const { CHAIN_REGISTRY } = await import('@wormcraft/sdk');
  const testnetOnly = CHAIN_REGISTRY.filter(c => c.isTestnet === true);
  const mainnetOnly = CHAIN_REGISTRY.filter(c => !c.isTestnet);
  expect(testnetOnly.every(c => c.isTestnet)).toBe(true);
  expect(mainnetOnly.every(c => !c.isTestnet)).toBe(true);
  // sepolia must be testnet
  expect(testnetOnly.some(c => c.name === 'sepolia')).toBe(true);
  // ethereum must be mainnet
  expect(mainnetOnly.some(c => c.name === 'ethereum')).toBe(true);
});
```

Run: `cd packages/cli && npx vitest run`
Expected: test passes (this validates the registry shape; the flag wiring will be tested via build+smoke)

### Step 2: Update `info chains` in `info.ts`

Replace the `.option('--testnet', ...)` block entirely:

```typescript
info
  .command('chains')
  .description('List all supported chains')
  .option('--testnet', 'Include testnet chains alongside mainnet chains')
  .option('--testnet-only', 'Show only testnet chains')
  .action((opts: { testnet?: boolean; testnetOnly?: boolean }) => {
    let chains = CHAIN_REGISTRY;
    if (opts.testnetOnly) {
      chains = CHAIN_REGISTRY.filter(c => c.isTestnet === true);
    } else if (!opts.testnet) {
      chains = CHAIN_REGISTRY.filter(c => !c.isTestnet);
    }
    printJson(chains.map((c) => ({
      name: c.name,
      wormholeChainId: c.wormholeChainId,
      evmChainId: c.evmChainId ?? null,
      isTestnet: c.isTestnet ?? false,
    })));
  });
```

### Step 3: Build and smoke-test

```bash
cd packages/cli && npm run build
node dist/cli.js info chains | grep -c '"isTestnet": false'  # should return count of mainnet chains
node dist/cli.js info chains --testnet-only | grep -c '"isTestnet": true'  # should return 4
node dist/cli.js info chains --testnet | grep -c '"isTestnet"'  # should return total count
```

### Step 4: Verify branch and commit

```bash
git branch --show-current  # feat/cli-polish
git add packages/cli/src/commands/info.ts
git commit -m "feat: add --testnet-only flag to info chains"
```

---

## Task 3: `info chain-id` and `info contract-address` accept EVM chain ID

`info chain-id 1` currently fails with "Unknown chain: 1" because `getChainById(1)` looks up by Wormhole chain ID (1 = Solana), not EVM chain ID. When numeric input doesn't match a Wormhole chain ID, fall back to EVM chain ID lookup.

**Files:**
- Modify: `packages/sdk/src/deploy/registry.ts` — add `getChainByEvmId`
- Modify: `packages/cli/src/commands/info.ts` — `chain-id` and `contract-address` actions
- Test: `packages/sdk/tests/deploy/registry.test.ts`

### Step 1: Write failing test in `registry.test.ts`

```typescript
it('getChainByEvmId returns the chain matching that EVM chain ID', () => {
  const chain = getChainByEvmId(1);  // EVM chain 1 = ethereum
  expect(chain?.name).toBe('ethereum');
});

it('getChainByEvmId returns sepolia for EVM chain ID 11155111', () => {
  const chain = getChainByEvmId(11155111);
  expect(chain?.name).toBe('sepolia');
});

it('getChainByEvmId returns undefined for unknown EVM chain ID', () => {
  expect(getChainByEvmId(999999)).toBeUndefined();
});
```

Run: `cd packages/sdk && npm test`
Expected: FAIL — `getChainByEvmId is not a function`

### Step 2: Add `getChainByEvmId` to `registry.ts`

```typescript
/** Look up a chain entry by its EVM chain ID (e.g. 1 for ethereum, 11155111 for sepolia). */
export function getChainByEvmId(evmChainId: number): ChainEntry | undefined {
  return CHAIN_REGISTRY.find(c => c.evmChainId === evmChainId);
}
```

Also export it from `packages/sdk/src/deploy/index.ts` if it isn't already re-exported (check the file — `getChainByEvmId` needs to be in the public SDK surface via the SDK's `index.ts` chain).

### Step 3: Run tests to verify they pass

```bash
cd packages/sdk && npm test
```
Expected: all tests pass including new ones

### Step 4: Update `info chain-id` action in `info.ts`

Import `getChainByEvmId` at the top of the file (already imports `getChainById`, `getChainByName`).

Replace the action body:

```typescript
.action((chain: string) => {
  try {
    const asNum = parseInt(chain, 10);
    let entry;
    if (Number.isNaN(asNum)) {
      entry = getChainByName(chain);
    } else {
      // Try Wormhole chain ID first, then EVM chain ID
      entry = getChainById(asNum) ?? getChainByEvmId(asNum);
    }
    if (!entry) { printError(`Unknown chain: ${chain}`); process.exit(1); }
    printJson({ chain: entry.name, wormholeChainId: entry.wormholeChainId });
  } catch (err) { printError('chain-id failed', err); process.exit(1); }
});
```

Apply the same pattern to `contract-address <chain>` — it currently uses `getChainByName` only:

```typescript
.action((chain: string) => {
  try {
    const asNum = parseInt(chain, 10);
    const entry = Number.isNaN(asNum)
      ? getChainByName(chain)
      : (getChainById(asNum) ?? getChainByEvmId(asNum));
    if (!entry) { printError(`Unknown chain: ${chain}`); process.exit(1); }
    printJson({ ... });
  } catch (err) { ... }
});
```

### Step 5: Build and smoke-test

```bash
cd packages/cli && npm run build
node dist/cli.js info chain-id 1        # → ethereum (wormhole chain ID 1 = solana, but EVM 1 = ethereum — IMPORTANT: wormhole chain ID 1 wins here)
node dist/cli.js info chain-id 11155111 # → sepolia (EVM chain ID fallback)
node dist/cli.js info chain-id ethereum # → ethereum (by name still works)
node dist/cli.js info chain-id 99999    # → Error: Unknown chain: 99999
```

> **Note on `chain-id 1`:** Wormhole chain ID 1 is Solana, EVM chain ID 1 is Ethereum. When `getChainById(1)` returns Solana, that takes priority (Wormhole chain IDs are the primary identifier in this tool). So `info chain-id 1` → Solana. To get Ethereum by EVM ID, users would use `info chain-id 11155111` (Ethereum's unique EVM chain ID), or just `info chain-id ethereum`.

### Step 6: Verify branch and commit

```bash
git branch --show-current  # feat/cli-polish
git add packages/sdk/src/deploy/registry.ts packages/cli/src/commands/info.ts
git commit -m "feat: add getChainByEvmId, accept EVM chain ID in info chain-id"
```

---

## Task 4: Make `--sequence` optional in `generate test-vaa`

`generate test-vaa` requires `--sequence` but most users generating test VAAs don't care about the sequence number. Default to `0`.

**Files:**
- Modify: `packages/cli/src/commands/generate.ts`
- Test: `packages/cli/src/commands/generate.test.ts` (co-located)

### Step 1: Write failing test

Find or create `packages/cli/src/commands/generate.test.ts`. Add:

```typescript
import { describe, it, expect } from 'vitest';
import { generateTestVaaHex } from '@wormcraft/sdk';

describe('generate test-vaa sequence default', () => {
  it('generates a valid VAA when sequence is 0 (default)', () => {
    const hex = generateTestVaaHex({
      emitterChain: 2,
      emitterAddress: '0x0000000000000000000000000000000000000000000000000000000000000004',
      sequence: 0n,
      payload: '0xdeadbeef',
    });
    expect(hex).toMatch(/^0x/);
  });
});
```

Run: `cd packages/cli && npx vitest run`
Expected: PASS (the underlying SDK function already supports sequence 0 — this confirms the default is safe)

### Step 2: Update `generate.ts` to make `--sequence` optional

Change:
```typescript
.requiredOption('--sequence <n>', 'Message sequence number', (v: string) => BigInt(v))
```

To:
```typescript
.option('--sequence <n>', 'Message sequence number (default: 0)', (v: string) => BigInt(v))
```

Update the action opts type:
```typescript
(opts: {
  emitterChain: number;
  emitterAddress: string;
  sequence?: bigint;   // was: bigint
  payload: string;
  ...
})
```

Update the call:
```typescript
const hex = generateTestVaaHex({
  ...
  sequence: opts.sequence ?? 0n,
  ...
});
```

### Step 3: Build and smoke-test

```bash
cd packages/cli && npm run build
# Without --sequence — must work now
node dist/cli.js generate test-vaa \
  --emitter-chain 2 \
  --emitter-address 0000000000000000000000000000000000000000000000000000000000000004 \
  --payload deadbeef
# Expected: {"vaa": "0x01..."}
```

### Step 4: Verify branch and commit

```bash
git branch --show-current  # feat/cli-polish
git add packages/cli/src/commands/generate.ts
git commit -m "feat: make --sequence optional in generate test-vaa (default 0)"
```

---

## Task 5: Table output for `deploy plan` and `deploy diff`

Both commands currently output raw JSON. Add default table rendering with `--json` to keep machine-readable output.

**Files:**
- Modify: `packages/cli/src/commands/deploy.ts` — `plan` and `diff` action handlers
- No new SDK changes needed

### Step 1: Implement `deploy plan` table output

In `packages/cli/src/commands/deploy.ts`, find the `deploy plan` action (currently just calls `printJson(plan)`).

Update the imports at the top to include `formatTable`:

```typescript
import { printJson, printError, formatTable } from '../output.js';
```

Update the `plan` command options and action:

```typescript
deploy
  .command('plan')
  .description('Dry-run: show what would be deployed and in what order')
  .option('--project <dir>', 'Project root (default: cwd)')
  .option('--json', 'Output as JSON array instead of a table')
  .action(async (opts: { project?: string; json?: boolean }) => {
    try {
      const root = opts.project ?? process.cwd();
      const { parseManifest, loadAddressBook, buildDeployPlan } = await import('@wormcraft/sdk');
      const manifestYaml = await readFile(join(root, 'wormcraft.deploy.yaml'), 'utf8');
      const manifest = parseManifest(manifestYaml);
      const book = await loadAddressBook(root);
      const plan = buildDeployPlan(manifest, book);

      if (opts.json) {
        printJson(plan);
      } else {
        const rows = plan.map(e => [
          e.name,
          e.targetChains.join(', '),
          e.alreadyDeployed ? '✓ deployed' : '✗ pending',
          e.strategy,
        ]);
        console.log(formatTable(['Contract', 'Chains', 'Status', 'Strategy'], rows));
      }
    } catch (err) { printError('deploy plan failed', err); process.exit(1); }
  });
```

### Step 2: Implement `deploy diff` table output

Same pattern for the `diff` command:

```typescript
deploy
  .command('diff')
  .description('Compare manifest targets vs what is in the address book')
  .option('--project <dir>', 'Project root (default: cwd)')
  .option('--json', 'Output as JSON array instead of a table')
  .action(async (opts: { project?: string; json?: boolean }) => {
    try {
      const root = opts.project ?? process.cwd();
      const { parseManifest, loadAddressBook, isDeployed } = await import('@wormcraft/sdk');

      const manifestYaml = await readFile(join(root, 'wormcraft.deploy.yaml'), 'utf8');
      const manifest = parseManifest(manifestYaml);
      const book = await loadAddressBook(root);

      const rows: Array<{ contract: string; chain: string; status: 'deployed' | 'missing'; address?: string }> = [];
      for (const target of manifest.deploy_targets) {
        for (const contractName of target.contracts) {
          for (const chain of target.chains) {
            const dep = isDeployed(book, contractName, chain);
            const address = book.contracts[contractName]?.[chain]?.address;
            rows.push({ contract: contractName, chain, status: dep ? 'deployed' : 'missing', ...(address ? { address } : {}) });
          }
        }
      }

      if (opts.json) {
        printJson(rows);
      } else {
        const tableRows = rows.map(r => [
          r.contract,
          r.chain,
          r.status === 'deployed' ? '✓ deployed' : '✗ missing',
          r.address ?? '—',
        ]);
        console.log(formatTable(['Contract', 'Chain', 'Status', 'Address'], tableRows));
      }
    } catch (err) { printError('deploy diff failed', err); process.exit(1); }
  });
```

### Step 3: Build and smoke-test with the fixture

```bash
FIXTURE=/var/folders/bp/g_nzlqhs15j5kgw52gsmdc3w0000gn/T/tmp.0wyBQLvoks
cd packages/cli && npm run build
node dist/cli.js deploy plan --project "$FIXTURE"
# Expected: table output
# Contract  Chains    Status      Strategy
# ─────────────────────────────────────────
# Counter   sepolia   ✓ deployed  sequential
# Vault     sepolia   ✗ pending   sequential

node dist/cli.js deploy plan --project "$FIXTURE" --json
# Expected: JSON array (same as before)

node dist/cli.js deploy diff --project "$FIXTURE"
# Expected: table output
```

### Step 4: Verify branch and commit

```bash
git branch --show-current  # feat/cli-polish
git add packages/cli/src/commands/deploy.ts
git commit -m "feat: table output for deploy plan and deploy diff, --json flag to keep raw output"
```

---

## Task 6: Better missing-manifest error message

When `wormcraft.deploy.yaml` is not found, the current error is raw `ENOENT`. Guide users to run `wormcraft deploy init`.

**Files:**
- Modify: `packages/cli/src/commands/deploy.ts` — add manifest-specific error handler

### Step 1: Add a manifest error helper at the top of `deploy.ts`

After the imports, before `saltFromStr`:

```typescript
/** Detect ENOENT on the manifest file and guide users to deploy init. */
function handleManifestMissing(commandName: string, err: unknown): never {
  if (
    err instanceof Error &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT' &&
    String((err as NodeJS.ErrnoException).path ?? '').endsWith('wormcraft.deploy.yaml')
  ) {
    printError('wormcraft.deploy.yaml not found — run `wormcraft deploy init` to create one');
  } else {
    printError(`${commandName} failed`, err);
  }
  process.exit(1);
}
```

### Step 2: Replace catch handlers in plan, run, verify, diff, upgrade-safe

In each of those commands, replace:
```typescript
} catch (err) { printError('deploy plan failed', err); process.exit(1); }
```
with:
```typescript
} catch (err) { handleManifestMissing('deploy plan', err); }
```

(Use the appropriate command name string in each case: `'deploy plan'`, `'deploy run'`, etc.)

### Step 3: Build and smoke-test

```bash
cd packages/cli && npm run build
node dist/cli.js deploy plan --project /tmp/doesnotexist
# Expected: Error: wormcraft.deploy.yaml not found — run `wormcraft deploy init` to create one

node dist/cli.js deploy plan --project /tmp
# Expected: same error (no manifest there either)
```

### Step 4: Verify branch and commit

```bash
git branch --show-current  # feat/cli-polish
git add packages/cli/src/commands/deploy.ts
git commit -m "feat: guide users to deploy init when manifest file is missing"
```

---

## Task 7: `contracts check` — Beacon proxy detection

The ERC-1967 Beacon Proxy pattern (`beacon()` function) is not currently detected. Add it alongside UUPS and Transparent.

**Files:**
- Modify: `packages/cli/src/commands/contracts.ts`

### Step 1: Write failing test

In `packages/cli/src/commands/contracts.ts` there's a local `analyzeContract` function. The type `CheckResult.proxyPattern` is `'UUPS' | 'Transparent' | 'none'`. A unit test for `analyzeContract` would require exporting it — instead, write an integration test via the built binary.

Since the fixture's `Counter.sol` is UUPS, create a synthetic test using the analyze logic directly. First, export `analyzeContract` (temporarily or permanently via the `contracts check` logic being testable). 

Actually, the simplest approach is to test via `contracts check` output on an actual artifact. We'll rely on the smoke-test in Step 3 instead and write a unit test for the detection logic after extracting it.

Extract the detection logic into a testable function in `contracts.ts`:

```typescript
// Exported for tests
export function detectProxyPattern(
  names: Set<string>,
): 'UUPS' | 'Transparent' | 'Beacon' | 'none' {
  if (names.has('upgradeTo') || names.has('upgradeToAndCall')) return 'UUPS';
  if (names.has('admin') && names.has('implementation')) return 'Transparent';
  if (names.has('beacon')) return 'Beacon';
  return 'none';
}
```

Write test in `packages/cli/src/commands/contracts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectProxyPattern } from './contracts.js';

describe('detectProxyPattern', () => {
  it('detects UUPS via upgradeTo', () => {
    expect(detectProxyPattern(new Set(['upgradeTo', 'initialize']))).toBe('UUPS');
  });
  it('detects UUPS via upgradeToAndCall', () => {
    expect(detectProxyPattern(new Set(['upgradeToAndCall']))).toBe('UUPS');
  });
  it('detects Transparent via admin + implementation', () => {
    expect(detectProxyPattern(new Set(['admin', 'implementation']))).toBe('Transparent');
  });
  it('detects Beacon via beacon()', () => {
    expect(detectProxyPattern(new Set(['beacon']))).toBe('Beacon');
  });
  it('returns none for plain contracts', () => {
    expect(detectProxyPattern(new Set(['transfer', 'balanceOf']))).toBe('none');
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd packages/cli && npx vitest run src/commands/contracts.test.ts
```
Expected: FAIL — `detectProxyPattern` not exported

### Step 3: Implement changes in `contracts.ts`

1. Extract and export `detectProxyPattern` (signature above).
2. Update `CheckResult` type: `proxyPattern: 'UUPS' | 'Transparent' | 'Beacon' | 'none'`
3. Update `analyzeContract` to call `detectProxyPattern(names)` instead of inline logic.
4. Add Beacon warning: `if (proxyPattern === 'Beacon' && !names.has('implementation')) warnings.push('Beacon proxy missing implementation() view function');`

### Step 4: Run tests to verify they pass

```bash
cd packages/cli && npx vitest run src/commands/contracts.test.ts
```
Expected: 5 tests pass

### Step 5: Build and smoke-test

```bash
cd packages/cli && npm run build
FIXTURE=/var/folders/bp/g_nzlqhs15j5kgw52gsmdc3w0000gn/T/tmp.0wyBQLvoks
node dist/cli.js contracts check Counter --project "$FIXTURE"
# Expected: {"proxyPattern": "UUPS", ...}
```

### Step 6: Verify branch and commit

```bash
git branch --show-current  # feat/cli-polish
git add packages/cli/src/commands/contracts.ts packages/cli/src/commands/contracts.test.ts
git commit -m "feat: detect Beacon proxy in contracts check, extract testable detectProxyPattern"
```

---

## Task 8: `wormcraft doctor` command

A pre-flight environment checker. Runs a series of checks and reports pass/fail with actionable messages.

**Files:**
- Create: `packages/cli/src/commands/doctor.ts`
- Modify: `packages/cli/src/main.ts` — wire in `registerDoctorCommand`

**Checks performed:**
1. `WORMCRAFT_EVM_PRIVATE_KEY` — set, starts with `0x`, is 66 chars (32 bytes)
2. Toolchain detected — `foundry.toml` or `hardhat.config.ts/js` found in project root
3. `wormcraft.deploy.yaml` — exists and parses without error
4. All contracts in `deploy_targets` have compiled artifacts
5. All chains in `deploy_targets` are in `CHAIN_REGISTRY`

Output format (default — human-readable):
```
✓ Private key configured
✓ Foundry project detected
✓ wormcraft.deploy.yaml valid
✓ All manifest contracts found in artifacts (Counter, Vault)
✗ Unknown chain: mainnet (not in CHAIN_REGISTRY — did you mean "ethereum"?)
```
With `--json`, output a JSON array of `{check, passed, message}`.

### Step 1: Write tests

Create `packages/cli/src/commands/doctor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { runChecks } from './doctor.js';
import type { DoctorCheck } from './doctor.js';

describe('runChecks', () => {
  it('returns a failed check when WORMCRAFT_EVM_PRIVATE_KEY is missing', async () => {
    const oldKey = process.env['WORMCRAFT_EVM_PRIVATE_KEY'];
    delete process.env['WORMCRAFT_EVM_PRIVATE_KEY'];
    const results = await runChecks({ root: process.cwd(), skipManifest: true, skipToolchain: true });
    process.env['WORMCRAFT_EVM_PRIVATE_KEY'] = oldKey;
    const keyCheck = results.find(r => r.check === 'private-key');
    expect(keyCheck?.passed).toBe(false);
  });

  it('returns a failed check for invalid key format', async () => {
    const oldKey = process.env['WORMCRAFT_EVM_PRIVATE_KEY'];
    process.env['WORMCRAFT_EVM_PRIVATE_KEY'] = 'not-a-key';
    const results = await runChecks({ root: process.cwd(), skipManifest: true, skipToolchain: true });
    process.env['WORMCRAFT_EVM_PRIVATE_KEY'] = oldKey;
    const keyCheck = results.find(r => r.check === 'private-key');
    expect(keyCheck?.passed).toBe(false);
  });

  it('passes key check when valid key is set', async () => {
    const oldKey = process.env['WORMCRAFT_EVM_PRIVATE_KEY'];
    process.env['WORMCRAFT_EVM_PRIVATE_KEY'] = '0x' + 'a'.repeat(64);
    const results = await runChecks({ root: process.cwd(), skipManifest: true, skipToolchain: true });
    process.env['WORMCRAFT_EVM_PRIVATE_KEY'] = oldKey;
    const keyCheck = results.find(r => r.check === 'private-key');
    expect(keyCheck?.passed).toBe(true);
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd packages/cli && npx vitest run src/commands/doctor.test.ts
```
Expected: FAIL — module not found

### Step 3: Implement `doctor.ts`

```typescript
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Command } from 'commander';
import { printJson, printError } from '../output.js';

export interface DoctorCheck {
  check: string;
  passed: boolean;
  message: string;
}

export interface RunChecksOptions {
  root: string;
  skipManifest?: boolean;
  skipToolchain?: boolean;
}

export async function runChecks(opts: RunChecksOptions): Promise<DoctorCheck[]> {
  const { root, skipManifest, skipToolchain } = opts;
  const results: DoctorCheck[] = [];

  // 1. Private key
  const pk = process.env['WORMCRAFT_EVM_PRIVATE_KEY'];
  const keyValid = typeof pk === 'string' && /^0x[0-9a-fA-F]{64}$/.test(pk);
  results.push({
    check: 'private-key',
    passed: keyValid,
    message: keyValid
      ? 'Private key configured'
      : pk === undefined
        ? 'WORMCRAFT_EVM_PRIVATE_KEY is not set'
        : 'WORMCRAFT_EVM_PRIVATE_KEY is set but has invalid format (expected 0x + 64 hex chars)',
  });

  // 2. Toolchain
  if (!skipToolchain) {
    const { detectToolchain, ToolchainNotFoundError } = await import('@wormcraft/sdk');
    try {
      await detectToolchain(root);
      results.push({ check: 'toolchain', passed: true, message: 'Project toolchain detected (Foundry or Hardhat)' });
    } catch (err) {
      results.push({
        check: 'toolchain',
        passed: false,
        message: err instanceof ToolchainNotFoundError
          ? `No toolchain found in ${root} (add foundry.toml or hardhat.config.ts)`
          : `Toolchain detection failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 3. Manifest
  if (!skipManifest) {
    try {
      const { parseManifest, loadAddressBook, detectToolchain, listArtifacts, getChainByName, CHAIN_REGISTRY } = await import('@wormcraft/sdk');
      const yaml = await readFile(join(root, 'wormcraft.deploy.yaml'), 'utf8');
      const manifest = parseManifest(yaml);
      results.push({ check: 'manifest', passed: true, message: 'wormcraft.deploy.yaml found and valid' });

      // 4. Artifacts for all contracts in deploy_targets
      try {
        const toolchain = await detectToolchain(root);
        const artifacts = await listArtifacts(toolchain);
        const artifactNames = new Set(artifacts.map(a => a.name));
        const allContractNames = new Set(manifest.deploy_targets.flatMap(t => t.contracts));
        const missing = [...allContractNames].filter(n => !artifactNames.has(n));
        if (missing.length === 0) {
          results.push({ check: 'artifacts', passed: true, message: `All manifest contracts found in artifacts (${[...allContractNames].join(', ')})` });
        } else {
          results.push({ check: 'artifacts', passed: false, message: `Missing artifacts: ${missing.join(', ')} — run forge build / npx hardhat compile` });
        }
      } catch {
        results.push({ check: 'artifacts', passed: false, message: 'Could not list artifacts (toolchain not detected)' });
      }

      // 5. All chains recognized
      const allChains = [...new Set(manifest.deploy_targets.flatMap(t => t.chains))];
      const unknownChains = allChains.filter(c => {
        const net = manifest.networks[c];
        const chainName = net?.chain ?? c;
        return !CHAIN_REGISTRY.find(entry => entry.name === chainName);
      });
      if (unknownChains.length === 0) {
        results.push({ check: 'chains', passed: true, message: `All chains recognized (${allChains.join(', ')})` });
      } else {
        results.push({ check: 'chains', passed: false, message: `Unknown chains: ${unknownChains.join(', ')} — check wormcraft.deploy.yaml networks section` });
      }

    } catch (err) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        results.push({ check: 'manifest', passed: false, message: 'wormcraft.deploy.yaml not found — run `wormcraft deploy init` to create one' });
      } else {
        results.push({ check: 'manifest', passed: false, message: `wormcraft.deploy.yaml invalid: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
  }

  return results;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check environment configuration before deploying')
    .option('--project <dir>', 'Project root (default: cwd)')
    .option('--json', 'Output as JSON array')
    .action(async (opts: { project?: string; json?: boolean }) => {
      try {
        const root = opts.project ?? process.cwd();
        const results = await runChecks({ root });

        if (opts.json) {
          printJson(results);
        } else {
          for (const r of results) {
            const icon = r.passed ? '✓' : '✗';
            process.stdout.write(`${icon} ${r.message}\n`);
          }
          const allPassed = results.every(r => r.passed);
          if (!allPassed) process.exit(1);
        }
      } catch (err) {
        printError('doctor failed', err);
        process.exit(1);
      }
    });
}
```

### Step 4: Wire into `main.ts`

Add to `packages/cli/src/main.ts`:

```typescript
import { registerDoctorCommand } from './commands/doctor.js';
// ... (after existing imports)
registerDoctorCommand(program);
// ... (after existing registerXxx calls)
```

### Step 5: Run tests to verify they pass

```bash
cd packages/cli && npx vitest run src/commands/doctor.test.ts
```
Expected: 3 tests pass

### Step 6: Build and smoke-test

```bash
cd packages/cli && npm run build
FIXTURE=/var/folders/bp/g_nzlqhs15j5kgw52gsmdc3w0000gn/T/tmp.0wyBQLvoks
node dist/cli.js doctor --project "$FIXTURE"
# Expected: lines like:
# ✗ WORMCRAFT_EVM_PRIVATE_KEY is not set
# ✓ Project toolchain detected (Foundry or Hardhat)
# ✓ wormcraft.deploy.yaml found and valid
# ✓ All manifest contracts found in artifacts (Counter, Vault)
# ✓ All chains recognized (sepolia)

node dist/cli.js doctor --project "$FIXTURE" --json
# Expected: JSON array of check results
```

### Step 7: Verify branch and commit

```bash
git branch --show-current  # feat/cli-polish
git add packages/cli/src/commands/doctor.ts packages/cli/src/commands/doctor.test.ts packages/cli/src/main.ts
git commit -m "feat: add wormcraft doctor command for pre-deployment environment checks"
```

---

## Task 9: `wormcraft deploy init` — generate starter manifest

Generate a starter `wormcraft.deploy.yaml` from detected artifacts. Saves users from learning the manifest schema by hand.

**Files:**
- Modify: `packages/cli/src/commands/deploy.ts` — add `deploy init` subcommand

### Step 1: Write test for manifest generation logic

Add a helper function `buildStarterManifest` that takes a list of contract names and returns a YAML string. Test it in isolation:

Add to `packages/sdk/src/deploy/manifest.ts` (or a new `init.ts`):

Actually, since this is a CLI-only concern (it just writes a file), put the generation logic directly in `deploy.ts` as a local helper. The test will be a snapshot test.

Create `packages/cli/src/commands/deploy.init.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildStarterManifestYaml } from './deploy.js';

describe('buildStarterManifestYaml', () => {
  it('generates valid YAML with given contract names', () => {
    const yaml = buildStarterManifestYaml(['Counter', 'Vault']);
    expect(yaml).toContain('name: Counter');
    expect(yaml).toContain('name: Vault');
    expect(yaml).toContain('version: "1"');
    expect(yaml).toContain('strategy: sequential');
    expect(yaml).toContain('WORMCRAFT_RPC_SEPOLIA');
  });

  it('handles a single contract', () => {
    const yaml = buildStarterManifestYaml(['Token']);
    expect(yaml).toContain('name: Token');
    expect(yaml).toContain('contracts: [Token]');
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd packages/cli && npx vitest run src/commands/deploy.init.test.ts
```
Expected: FAIL — `buildStarterManifestYaml` not exported

### Step 3: Implement `buildStarterManifestYaml` and `deploy init` subcommand

Add to `packages/cli/src/commands/deploy.ts`:

```typescript
/** Exported for testing. Builds a starter manifest YAML for the given contract names. */
export function buildStarterManifestYaml(contractNames: string[]): string {
  const contractsYaml = contractNames.map(n =>
    `  - name: ${n}\n    contract: ${n}\n    args: []   # TODO: fill constructor args`
  ).join('\n');

  const targetContracts = `[${contractNames.join(', ')}]`;

  return `version: "1"

# Network definitions — set RPC env vars before running
networks:
  sepolia:
    chain: sepolia
    rpc: "\${WORMCRAFT_RPC_SEPOLIA}"

# Deployer salt — change this to get a different deterministic address
deployer:
  salt: "my-project-v1"

# Contracts to deploy — add constructor args as {type, value} pairs
contracts:
${contractsYaml}

# Deploy targets — which contracts go to which chains
deploy_targets:
  - contracts: ${targetContracts}
    chains: [sepolia]
    strategy: sequential
`;
}
```

Add the `deploy init` subcommand inside `registerDeployCommand`:

```typescript
deploy
  .command('init')
  .description('Generate a starter wormcraft.deploy.yaml from compiled artifacts')
  .option('--project <dir>', 'Project root (default: cwd)')
  .option('--force', 'Overwrite existing manifest')
  .action(async (opts: { project?: string; force?: boolean }) => {
    try {
      const root = opts.project ?? process.cwd();
      const manifestPath = join(root, 'wormcraft.deploy.yaml');

      if (!opts.force) {
        try {
          await readFile(manifestPath, 'utf8');
          printError(`wormcraft.deploy.yaml already exists — use --force to overwrite`);
          process.exit(1);
        } catch (err) {
          if (!(err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT')) {
            throw err;
          }
          // File doesn't exist — proceed
        }
      }

      const { detectToolchain, listArtifacts, ToolchainNotFoundError } = await import('@wormcraft/sdk');
      let contractNames: string[];
      try {
        const toolchain = await detectToolchain(root);
        const artifacts = await listArtifacts(toolchain);
        // Only deployable contracts (not interfaces/abstract)
        contractNames = artifacts.filter(a => !a.isAbstract).map(a => a.name);
      } catch (err) {
        if (err instanceof ToolchainNotFoundError) {
          process.stderr.write('No toolchain found — generating manifest with empty contracts list.\n');
          contractNames = [];
        } else {
          throw err;
        }
      }

      const { writeFile } = await import('fs/promises');
      await writeFile(manifestPath, buildStarterManifestYaml(contractNames), 'utf8');
      process.stdout.write(`Created ${manifestPath}\n`);
      if (contractNames.length > 0) {
        process.stdout.write(`Found ${contractNames.length} deployable contract(s): ${contractNames.join(', ')}\n`);
        process.stdout.write('Edit the file to fill in constructor args and networks.\n');
      }
    } catch (err) { printError('deploy init failed', err); process.exit(1); }
  });
```

### Step 4: Run tests to verify they pass

```bash
cd packages/cli && npx vitest run src/commands/deploy.init.test.ts
```
Expected: 2 tests pass

### Step 5: Build and smoke-test

```bash
cd packages/cli && npm run build
FIXTURE=/var/folders/bp/g_nzlqhs15j5kgw52gsmdc3w0000gn/T/tmp.0wyBQLvoks

# Test: should fail because manifest already exists
node dist/cli.js deploy init --project "$FIXTURE"
# Expected: Error: wormcraft.deploy.yaml already exists — use --force to overwrite

# Test with --force
node dist/cli.js deploy init --project "$FIXTURE" --force
# Expected: Created .../wormcraft.deploy.yaml
#           Found 2 deployable contract(s): Counter, Vault

cat "$FIXTURE/wormcraft.deploy.yaml"
# Expected: YAML with Counter and Vault

# Test in a directory with no manifest
TMPDIR2=$(mktemp -d)
cp -r "$FIXTURE/out" "$TMPDIR2/"
cp "$FIXTURE/foundry.toml" "$TMPDIR2/"
node dist/cli.js deploy init --project "$TMPDIR2"
# Expected: Created .../wormcraft.deploy.yaml
cat "$TMPDIR2/wormcraft.deploy.yaml"
```

### Step 6: Verify branch and commit

```bash
git branch --show-current  # feat/cli-polish
git add packages/cli/src/commands/deploy.ts packages/cli/src/commands/deploy.init.test.ts
git commit -m "feat: add deploy init command to generate starter wormcraft.deploy.yaml"
```

---

## Task 10: `deploy run --dry-run` (simulate without transactions)

Add a `--dry-run` flag to `deploy run` that goes through the full engine pipeline (resolves dependencies, encodes constructor args, computes CREATE2 addresses) without sending any transactions.

**Files:**
- Modify: `packages/sdk/src/deploy/engine.ts` — add `dryRun` option to `EngineRunOptions`
- Modify: `packages/cli/src/commands/deploy.ts` — add `--dry-run` flag

### Step 1: Write failing test

Add to `packages/sdk/src/deploy/engine.test.ts`:

```typescript
it('dry-run skips deployFn and returns computed addresses', async () => {
  const manifest: DeployManifest = {
    version: '1',
    networks: { sepolia: { chain: 'sepolia', rpc: 'http://localhost' } },
    deployer: { salt: 'test' },
    contracts: [{ name: 'Counter', contract: 'Counter' }],
    deploy_targets: [{ contracts: ['Counter'], chains: ['sepolia'], strategy: 'sequential' }],
  };
  const book: AddressBook = { version: '1', salt: '', contracts: {} };
  const artifacts = [
    {
      name: 'Counter',
      bytecode: '0x6080' as `0x${string}`,
      abi: [],
      constructorInputs: [],
      isAbstract: false,
      isInterface: false,
      sourcePath: 'src/Counter.sol',
      artifactPath: '',
      compilerVersion: '0.8.24',
    },
  ];

  let deployFnCalled = false;
  const result = await runDeployment({
    manifest,
    book,
    artifacts,
    saltFn: s => s as `0x${string}`,
    deployFn: async () => { deployFnCalled = true; return []; },
    dryRun: true,
    dryRunDeployerAddress: '0x4e59b44847b379578588920cA78FbF26c0B4956C',
  });

  expect(deployFnCalled).toBe(false);
  expect(result.deployed.length).toBe(1);
  expect(result.deployed[0]?.name).toBe('Counter');
  expect(result.deployed[0]?.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
});
```

### Step 2: Run test to verify it fails

```bash
cd packages/sdk && npm test
```
Expected: FAIL — `dryRun is not a valid option`

### Step 3: Implement dry-run in `engine.ts`

1. Add to `EngineRunOptions`:
   ```typescript
   /** When true, skip calling deployFn and compute addresses offline. */
   dryRun?: boolean;
   /** Required when dryRun is true — the CREATE2 deployer contract address. */
   dryRunDeployerAddress?: string;
   ```

2. In `runDeployment`, before calling `deployFn`, add the dry-run branch:

```typescript
if (opts.dryRun) {
  // Compute CREATE2 address offline without sending a transaction
  const { keccak256, concat } = await import('viem');
  const initCode = (constructorArgs !== '0x' && constructorArgs.length > 2)
    ? (artifact.bytecode + constructorArgs.slice(2)) as `0x${string}`
    : artifact.bytecode;
  const initCodeHash = keccak256(initCode);
  const deployerAddr = opts.dryRunDeployerAddress ?? '0x0000000000000000000000000000000000000000';
  const { computeCreate2Address } = await import('../deploy/create2.js');
  const address = computeCreate2Address(deployerAddr, salt, initCodeHash);
  
  book = setAddress(book, contractConfig.name, target.chains[0] ?? '', {
    address,
    deployedAt: new Date().toISOString(),
  });
  deployed.push({ name: contractConfig.name, chain: target.chains[0] ?? '', address });
  if (!resolvedAddresses[contractConfig.name]) {
    resolvedAddresses[contractConfig.name] = address;
  }
  continue;
}
```

3. Add `keccak_256` import from `@noble/hashes/sha3` (already used in CLI) or use `computeCreate2Address` from the SDK's own create2 module. Check what `computeCreate2Address` expects.

> Look at `packages/sdk/src/deploy/create2.ts` to understand the existing `computeCreate2Address` function signature before implementing.

### Step 4: Run tests to verify they pass

```bash
cd packages/sdk && npm test
```
Expected: all tests pass including new dry-run test

### Step 5: Update `deploy run` in `deploy.ts`

Add `--dry-run` option:

```typescript
deploy
  .command('run')
  .option('--project <dir>', ...)
  .option('--network <name>', ...)
  .option('--only <contract>', ...)
  .option('--dry-run', 'Simulate deployment — compute addresses without sending transactions')
  // ...
  .action(async (opts: { ...; dryRun?: boolean }) => {
    // ...
    const result = await runDeployment({
      // ...
      ...(opts.dryRun ? {
        dryRun: true,
        dryRunDeployerAddress: chainEntry?.wormToolDeployer,
      } : {}),
    });

    if (opts.dryRun) {
      process.stderr.write('DRY RUN — no transactions sent\n');
    }
    // ...
  });
```

### Step 6: Build and smoke-test

```bash
cd packages/cli && npm run build
FIXTURE=/var/folders/bp/g_nzlqhs15j5kgw52gsmdc3w0000gn/T/tmp.0wyBQLvoks

node dist/cli.js deploy run --only Vault --dry-run --project "$FIXTURE"
# Expected: DRY RUN — no transactions sent (to stderr)
# JSON output: { deployed: [{name: "Vault", chain: "sepolia", address: "0x..."}], skipped: ["Counter"] }
```

### Step 7: Verify branch and commit

```bash
git branch --show-current  # feat/cli-polish
git add packages/sdk/src/deploy/engine.ts packages/sdk/src/deploy/engine.test.ts packages/cli/src/commands/deploy.ts
git commit -m "feat: add deploy run --dry-run to simulate deployments without sending transactions"
```

---

## Final verification

After all tasks are complete:

```bash
cd packages/sdk && npm test
# Expected: all 110+ tests pass

cd packages/cli && npm run build
# Expected: clean build

# Quick end-to-end smoke tests
node packages/cli/dist/cli.js --version
node packages/cli/dist/cli.js info chains --testnet-only | grep sepolia
node packages/cli/dist/cli.js info chain-id 11155111
node packages/cli/dist/cli.js generate test-vaa --emitter-chain 2 --emitter-address 0000000000000000000000000000000000000000000000000000000000000004 --payload deadbeef
FIXTURE=/var/folders/bp/g_nzlqhs15j5kgw52gsmdc3w0000gn/T/tmp.0wyBQLvoks
node packages/cli/dist/cli.js doctor --project "$FIXTURE"
node packages/cli/dist/cli.js deploy plan --project "$FIXTURE"
node packages/cli/dist/cli.js deploy diff --project "$FIXTURE"
node packages/cli/dist/cli.js contracts check Counter --project "$FIXTURE"
node packages/cli/dist/cli.js deploy run --only Vault --dry-run --project "$FIXTURE"
```

Expected: all commands run without crashing.
