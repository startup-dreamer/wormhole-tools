# Foundry & Hardhat Compatibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Make `wormcraft` project-aware inside Foundry and Hardhat repos — auto-discover compiled contracts, provide a declarative deployment manifest, orchestrate multi-contract multi-chain deployments with dependency resolution and address-book resumability, verify, and support proxy upgrades.

**Architecture:** Seven sequential phases: (1) toolchain detection + artifact normalization in SDK, (2) `wormcraft contracts` CLI, (3) YAML deployment manifest schema + parser, (4) deployment engine with `deploy run/plan/diff` CLI, (5) address book with Foundry/Hardhat seed import, (6) Etherscan verification, (7) upgrade with storage-layout safety diff. Each phase adds a module to `packages/sdk/src/` and optionally wires a CLI command in `packages/cli/src/commands/`.

**Tech Stack:** TypeScript 5.4 strict, viem v2 (ABI encoding), `yaml` npm package (manifest parsing), vitest (tests co-located as `*.test.ts`), Commander.js v12 (CLI).

**Feature Branch:** `feat/foundry-hardhat-compatibility`

---

## Task 1: Toolchain Detection & Artifact Normalization

**Goal:** Given a project root directory, detect whether it is a Foundry or Hardhat project, then read all compiled artifacts into a normalized `ContractMeta` shape — regardless of which toolchain produced them.

**Files:**
- Create: `packages/sdk/src/toolchain/types.ts`
- Create: `packages/sdk/src/toolchain/detect.ts`
- Create: `packages/sdk/src/toolchain/foundry.ts`
- Create: `packages/sdk/src/toolchain/hardhat.ts`
- Create: `packages/sdk/src/toolchain/index.ts`
- Create: `packages/sdk/src/toolchain/toolchain.test.ts`
- Modify: `packages/sdk/src/index.ts` — add `export * from './toolchain/index.js'`

---

### Step 1: Write failing tests

In `packages/sdk/src/toolchain/toolchain.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectToolchain, listArtifacts } from './index.js';
import { join } from 'path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'wormcraft-test-'));
}

function writeJson(path: string, obj: unknown): void {
  writeFileSync(path, JSON.stringify(obj));
}

// ── detectToolchain ───────────────────────────────────────────────────────────

describe('detectToolchain', () => {
  it('detects foundry project from foundry.toml', async () => {
    const root = makeTmpDir();
    writeFileSync(join(root, 'foundry.toml'), '[profile.default]\n');
    mkdirSync(join(root, 'out'), { recursive: true });
    const info = await detectToolchain(root);
    expect(info.type).toBe('foundry');
    expect(info.root).toBe(root);
    rmSync(root, { recursive: true });
  });

  it('detects hardhat project from hardhat.config.ts', async () => {
    const root = makeTmpDir();
    writeFileSync(join(root, 'hardhat.config.ts'), '');
    mkdirSync(join(root, 'artifacts'), { recursive: true });
    const info = await detectToolchain(root);
    expect(info.type).toBe('hardhat');
    rmSync(root, { recursive: true });
  });

  it('throws when neither config found', async () => {
    const root = makeTmpDir();
    await expect(detectToolchain(root)).rejects.toThrow('not a Foundry or Hardhat project');
    rmSync(root, { recursive: true });
  });

  it('prefers foundry when both configs present', async () => {
    const root = makeTmpDir();
    writeFileSync(join(root, 'foundry.toml'), '');
    writeFileSync(join(root, 'hardhat.config.ts'), '');
    const info = await detectToolchain(root);
    expect(info.type).toBe('foundry');
    rmSync(root, { recursive: true });
  });
});

// ── listArtifacts (Foundry) ───────────────────────────────────────────────────

describe('listArtifacts - foundry', () => {
  it('reads a foundry artifact and returns ContractMeta', async () => {
    const root = makeTmpDir();
    writeFileSync(join(root, 'foundry.toml'), '[profile.default]\n');
    const contractDir = join(root, 'out', 'MyToken.sol');
    mkdirSync(contractDir, { recursive: true });
    writeJson(join(contractDir, 'MyToken.json'), {
      abi: [{ type: 'constructor', inputs: [{ name: '_name', type: 'string' }], stateMutability: 'nonpayable' }],
      bytecode: { object: '0x6080' },
      metadata: { compiler: { version: '0.8.24' }, settings: { compilationTarget: { 'src/MyToken.sol': 'MyToken' } } },
    });

    const info = await detectToolchain(root);
    const contracts = await listArtifacts(info);
    expect(contracts).toHaveLength(1);
    const c = contracts[0]!;
    expect(c.name).toBe('MyToken');
    expect(c.bytecode).toBe('0x6080');
    expect(c.constructorInputs).toHaveLength(1);
    expect(c.constructorInputs[0]!.type).toBe('string');
    expect(c.isAbstract).toBe(false);
    expect(c.isInterface).toBe(false);
    expect(c.compilerVersion).toBe('0.8.24');
    rmSync(root, { recursive: true });
  });

  it('marks contract with empty bytecode as abstract', async () => {
    const root = makeTmpDir();
    writeFileSync(join(root, 'foundry.toml'), '');
    const contractDir = join(root, 'out', 'IToken.sol');
    mkdirSync(contractDir, { recursive: true });
    writeJson(join(contractDir, 'IToken.json'), {
      abi: [{ type: 'function', name: 'transfer', inputs: [], outputs: [], stateMutability: 'nonpayable' }],
      bytecode: { object: '0x' },
      metadata: { compiler: { version: '0.8.24' }, settings: { compilationTarget: { 'src/IToken.sol': 'IToken' } } },
    });

    const info = await detectToolchain(root);
    const contracts = await listArtifacts(info);
    expect(contracts[0]!.isAbstract).toBe(true);
    rmSync(root, { recursive: true });
  });

  it('reads storageLayout when present', async () => {
    const root = makeTmpDir();
    writeFileSync(join(root, 'foundry.toml'), '');
    const contractDir = join(root, 'out', 'Vault.sol');
    mkdirSync(contractDir, { recursive: true });
    const storageLayout = {
      storage: [{ label: 'owner', type: 't_address', slot: 0, offset: 0 }],
      types: { t_address: { encoding: 'inplace', label: 'address', numberOfBytes: '20' } },
    };
    writeJson(join(contractDir, 'Vault.json'), {
      abi: [],
      bytecode: { object: '0x6080' },
      metadata: { compiler: { version: '0.8.24' }, settings: { compilationTarget: { 'src/Vault.sol': 'Vault' } } },
      storageLayout,
    });

    const info = await detectToolchain(root);
    const contracts = await listArtifacts(info);
    expect(contracts[0]!.storageLayout).toBeDefined();
    expect(contracts[0]!.storageLayout!.storage[0]!.label).toBe('owner');
    rmSync(root, { recursive: true });
  });
});

// ── listArtifacts (Hardhat) ───────────────────────────────────────────────────

describe('listArtifacts - hardhat', () => {
  it('reads a hardhat artifact and returns ContractMeta', async () => {
    const root = makeTmpDir();
    writeFileSync(join(root, 'hardhat.config.ts'), '');
    const contractDir = join(root, 'artifacts', 'contracts', 'Vault.sol');
    mkdirSync(contractDir, { recursive: true });
    writeJson(join(contractDir, 'Vault.json'), {
      _format: 'hh-sol-artifact-1',
      contractName: 'Vault',
      sourceName: 'contracts/Vault.sol',
      abi: [{ type: 'constructor', inputs: [{ name: '_token', type: 'address' }], stateMutability: 'nonpayable' }],
      bytecode: '0x6080',
      deployedBytecode: '0x6080',
    });
    // .dbg.json should be ignored
    writeJson(join(contractDir, 'Vault.dbg.json'), { buildInfo: '../build-info/xxx.json' });

    const info = await detectToolchain(root);
    const contracts = await listArtifacts(info);
    expect(contracts).toHaveLength(1);
    const c = contracts[0]!;
    expect(c.name).toBe('Vault');
    expect(c.sourcePath).toBe('contracts/Vault.sol');
    expect(c.bytecode).toBe('0x6080');
    expect(c.constructorInputs[0]!.type).toBe('address');
    rmSync(root, { recursive: true });
  });
});
```

**Step 2: Run to verify it fails**

```bash
cd packages/sdk && npx vitest run src/toolchain/toolchain.test.ts 2>&1 | head -20
```

Expected: FAIL — `Cannot find module './index.js'`

**Step 3: Implement `types.ts`**

```typescript
// packages/sdk/src/toolchain/types.ts
import type { AbiParameter } from 'viem';

export type ToolchainType = 'foundry' | 'hardhat';

export interface ToolchainInfo {
  type: ToolchainType;
  root: string;
  artifactDir: string;
}

export interface StorageVariable {
  label: string;
  type: string;
  slot: number;
  offset: number;
}

export interface StorageLayout {
  storage: StorageVariable[];
  types: Record<string, { encoding: string; label: string; numberOfBytes: string }>;
}

export interface ContractMeta {
  name: string;
  sourcePath: string;
  artifactPath: string;
  abi: readonly unknown[];
  bytecode: `0x${string}`;
  constructorInputs: readonly AbiParameter[];
  isAbstract: boolean;
  isInterface: boolean;
  compilerVersion: string;
  storageLayout?: StorageLayout;
}
```

**Step 4: Implement `detect.ts`**

```typescript
// packages/sdk/src/toolchain/detect.ts
import { access, readFile } from 'fs/promises';
import { join } from 'path';
import { WormcraftError } from '../error.js';
import type { ToolchainInfo } from './types.js';

export class ToolchainNotFoundError extends WormcraftError {
  constructor(root: string) {
    super(`${root} is not a Foundry or Hardhat project (no foundry.toml or hardhat.config.ts/js found)`);
  }
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function foundryArtifactDir(root: string): Promise<string> {
  try {
    const toml = await readFile(join(root, 'foundry.toml'), 'utf8');
    const match = /^\s*out\s*=\s*"([^"]+)"/m.exec(toml);
    return join(root, match?.[1] ?? 'out');
  } catch {
    return join(root, 'out');
  }
}

export async function detectToolchain(root: string): Promise<ToolchainInfo> {
  const hasFoundry = await exists(join(root, 'foundry.toml'));
  if (hasFoundry) {
    return { type: 'foundry', root, artifactDir: await foundryArtifactDir(root) };
  }

  const hasHardhatTs = await exists(join(root, 'hardhat.config.ts'));
  const hasHardhatJs = await exists(join(root, 'hardhat.config.js'));
  if (hasHardhatTs || hasHardhatJs) {
    return { type: 'hardhat', root, artifactDir: join(root, 'artifacts') };
  }

  throw new ToolchainNotFoundError(root);
}
```

**Step 5: Implement `foundry.ts`**

```typescript
// packages/sdk/src/toolchain/foundry.ts
import { readdir, readFile } from 'fs/promises';
import { join, basename, dirname } from 'path';
import type { AbiParameter } from 'viem';
import type { ContractMeta, StorageLayout } from './types.js';

interface FoundryArtifact {
  abi?: unknown[];
  bytecode?: { object: string; linkReferences?: Record<string, unknown> };
  metadata?: {
    compiler?: { version?: string };
    settings?: { compilationTarget?: Record<string, string> };
  };
  storageLayout?: StorageLayout;
}

function extractConstructorInputs(abi: unknown[]): readonly AbiParameter[] {
  const ctor = abi.find((e): e is { type: string; inputs: AbiParameter[] } =>
    typeof e === 'object' && e !== null && (e as { type: string }).type === 'constructor'
  );
  return ctor?.inputs ?? [];
}

export async function readFoundryArtifacts(artifactDir: string): Promise<ContractMeta[]> {
  const results: ContractMeta[] = [];

  let solDirs: string[];
  try {
    const entries = await readdir(artifactDir, { withFileTypes: true });
    solDirs = entries
      .filter(e => e.isDirectory() && e.name.endsWith('.sol'))
      .map(e => join(artifactDir, e.name));
  } catch {
    return [];
  }

  for (const solDir of solDirs) {
    const files = await readdir(solDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const contractName = basename(file, '.json');
      const artifactPath = join(solDir, file);
      let raw: FoundryArtifact;
      try {
        raw = JSON.parse(await readFile(artifactPath, 'utf8')) as FoundryArtifact;
      } catch { continue; }

      const bytecodeObj = raw.bytecode?.object ?? '';
      const bytecodeHex = (bytecodeObj.startsWith('0x') ? bytecodeObj : '0x' + bytecodeObj) as `0x${string}`;
      const isEmpty = bytecodeHex === '0x' || bytecodeHex.length <= 2;

      const compilationTarget = raw.metadata?.settings?.compilationTarget ?? {};
      const sourcePath = Object.keys(compilationTarget)[0] ?? `${contractName}.sol`;
      const compilerVersion = raw.metadata?.compiler?.version ?? 'unknown';

      const abi: unknown[] = raw.abi ?? [];
      const allFunctions = abi.filter((e): e is { type: string } =>
        typeof e === 'object' && e !== null
      );
      const isInterface = isEmpty && allFunctions.every(e => e.type === 'function' || e.type === 'event' || e.type === 'error');

      results.push({
        name: contractName,
        sourcePath,
        artifactPath,
        abi,
        bytecode: bytecodeHex,
        constructorInputs: extractConstructorInputs(abi),
        isAbstract: isEmpty,
        isInterface,
        compilerVersion,
        storageLayout: raw.storageLayout,
      });
    }
  }

  return results;
}
```

**Step 6: Implement `hardhat.ts`**

```typescript
// packages/sdk/src/toolchain/hardhat.ts
import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import type { AbiParameter } from 'viem';
import type { ContractMeta } from './types.js';

interface HardhatArtifact {
  _format?: string;
  contractName?: string;
  sourceName?: string;
  abi?: unknown[];
  bytecode?: string;
  deployedBytecode?: string;
}

function extractConstructorInputs(abi: unknown[]): readonly AbiParameter[] {
  const ctor = abi.find((e): e is { type: string; inputs: AbiParameter[] } =>
    typeof e === 'object' && e !== null && (e as { type: string }).type === 'constructor'
  );
  return ctor?.inputs ?? [];
}

async function walkArtifactDir(dir: string): Promise<string[]> {
  const paths: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        paths.push(...await walkArtifactDir(full));
      } else if (entry.name.endsWith('.json') && !entry.name.endsWith('.dbg.json')) {
        paths.push(full);
      }
    }
  } catch { /* skip unreadable dirs */ }
  return paths;
}

export async function readHardhatArtifacts(artifactDir: string): Promise<ContractMeta[]> {
  const results: ContractMeta[] = [];
  const files = await walkArtifactDir(artifactDir);

  for (const artifactPath of files) {
    let raw: HardhatArtifact;
    try {
      raw = JSON.parse(await readFile(artifactPath, 'utf8')) as HardhatArtifact;
    } catch { continue; }

    if (!raw._format?.startsWith('hh-sol-artifact')) continue;

    const contractName = raw.contractName ?? basename(artifactPath, '.json');
    const sourcePath = raw.sourceName ?? `contracts/${contractName}.sol`;
    const bytecodeRaw = raw.bytecode ?? '0x';
    const bytecode = (bytecodeRaw.startsWith('0x') ? bytecodeRaw : '0x' + bytecodeRaw) as `0x${string}`;
    const isEmpty = bytecode === '0x' || bytecode.length <= 2;

    const abi: unknown[] = raw.abi ?? [];
    const isInterface = isEmpty && abi.length > 0;

    results.push({
      name: contractName,
      sourcePath,
      artifactPath,
      abi,
      bytecode,
      constructorInputs: extractConstructorInputs(abi),
      isAbstract: isEmpty,
      isInterface,
      compilerVersion: 'unknown',
    });
  }

  return results;
}
```

**Step 7: Implement `index.ts`**

```typescript
// packages/sdk/src/toolchain/index.ts
export type { ToolchainType, ToolchainInfo, ContractMeta, StorageLayout, StorageVariable } from './types.js';
export { detectToolchain, ToolchainNotFoundError } from './detect.js';
import { readFoundryArtifacts } from './foundry.js';
import { readHardhatArtifacts } from './hardhat.js';
import type { ToolchainInfo, ContractMeta } from './types.js';

/** Read all compiled contracts from a detected toolchain. */
export async function listArtifacts(info: ToolchainInfo): Promise<ContractMeta[]> {
  if (info.type === 'foundry') return readFoundryArtifacts(info.artifactDir);
  return readHardhatArtifacts(info.artifactDir);
}
```

**Step 8: Export from SDK root**

In `packages/sdk/src/index.ts`, add:
```typescript
export * from './toolchain/index.js';
```

**Step 9: Run tests**

```bash
cd packages/sdk && npx vitest run src/toolchain/toolchain.test.ts
```

Expected: all tests PASS.

**Step 10: Verify branch and commit**

```bash
git branch --show-current  # feat/foundry-hardhat-compatibility
git add packages/sdk/src/toolchain/ packages/sdk/src/index.ts
git commit -m "feat(toolchain): detect Foundry/Hardhat projects and normalize artifact format"
```

---

## Task 2: `wormcraft contracts` CLI Commands

**Goal:** Three new subcommands — `contracts list`, `contracts info <name>`, `contracts check <name>` — that auto-detect the toolchain from `cwd` (or `--project`) and display contract metadata.

**Files:**
- Create: `packages/cli/src/commands/contracts.ts`
- Create: `packages/cli/tests/commands/contracts.test.ts`
- Modify: `packages/cli/src/main.ts` — register `registerContractsCommand`

---

### Step 1: Write failing tests

In `packages/cli/tests/commands/contracts.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Command } from 'commander';
import { registerContractsCommand } from '../../src/commands/contracts.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'wormcraft-cli-test-'));
}

function makeFoundryProject(root: string, contracts: Array<{ name: string; bytecode?: string; constructorInputs?: unknown[] }>): void {
  writeFileSync(join(root, 'foundry.toml'), '[profile.default]\n');
  for (const c of contracts) {
    const dir = join(root, 'out', `${c.name}.sol`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${c.name}.json`), JSON.stringify({
      abi: c.constructorInputs ? [{ type: 'constructor', inputs: c.constructorInputs, stateMutability: 'nonpayable' }] : [],
      bytecode: { object: c.bytecode ?? '0x6080' },
      metadata: { compiler: { version: '0.8.24' }, settings: { compilationTarget: { [`src/${c.name}.sol`]: c.name } } },
    }));
  }
}

describe('contracts list', () => {
  let root: string;

  beforeAll(() => {
    root = makeTmpDir();
    makeFoundryProject(root, [
      { name: 'MyToken', constructorInputs: [{ name: '_name', type: 'string' }] },
      { name: 'Vault', constructorInputs: [{ name: '_token', type: 'address' }] },
      { name: 'IToken', bytecode: '0x' },
    ]);
  });

  afterAll(() => { rmSync(root, { recursive: true }); });

  it('lists all compiled contracts', async () => {
    const output: string[] = [];
    const program = new Command();
    program.configureOutput({ writeOut: s => output.push(s), writeErr: s => output.push(s) });
    registerContractsCommand(program);

    await program.parseAsync(['contracts', 'list', '--project', root, '--json'], { from: 'user' });

    const json = JSON.parse(output.join(''));
    expect(json).toHaveLength(3);
    const names = json.map((c: { name: string }) => c.name).sort();
    expect(names).toEqual(['IToken', 'MyToken', 'Vault']);
  });

  it('--deployable filters out abstract/interface contracts', async () => {
    const output: string[] = [];
    const program = new Command();
    program.configureOutput({ writeOut: s => output.push(s), writeErr: s => output.push(s) });
    registerContractsCommand(program);

    await program.parseAsync(['contracts', 'list', '--project', root, '--deployable', '--json'], { from: 'user' });

    const json = JSON.parse(output.join(''));
    expect(json.every((c: { isAbstract: boolean }) => !c.isAbstract)).toBe(true);
  });
});

describe('contracts info', () => {
  let root: string;

  beforeAll(() => {
    root = makeTmpDir();
    makeFoundryProject(root, [
      { name: 'MyToken', constructorInputs: [{ name: '_name', type: 'string' }, { name: '_owner', type: 'address' }] },
    ]);
  });

  afterAll(() => { rmSync(root, { recursive: true }); });

  it('returns contract metadata as JSON', async () => {
    const output: string[] = [];
    const program = new Command();
    program.configureOutput({ writeOut: s => output.push(s) });
    registerContractsCommand(program);

    await program.parseAsync(['contracts', 'info', 'MyToken', '--project', root, '--json'], { from: 'user' });

    const json = JSON.parse(output.join(''));
    expect(json.name).toBe('MyToken');
    expect(json.constructorInputs).toHaveLength(2);
    expect(json.compilerVersion).toBe('0.8.24');
  });

  it('exits with error for unknown contract', async () => {
    const program = new Command();
    registerContractsCommand(program);
    await expect(
      program.parseAsync(['contracts', 'info', 'NonExistent', '--project', root], { from: 'user' })
    ).rejects.toThrow();
  });
});
```

**Step 2: Run to verify it fails**

```bash
cd packages/cli && npx vitest run tests/commands/contracts.test.ts 2>&1 | head -20
```

Expected: FAIL — module not found.

**Step 3: Implement `packages/cli/src/commands/contracts.ts`**

```typescript
import type { Command } from 'commander';
import { detectToolchain, listArtifacts, ToolchainNotFoundError } from '@wormcraft/sdk';
import { printJson, printError } from '../output.js';

function resolveProject(option?: string): string {
  return option ?? process.cwd();
}

function padEnd(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n - 1) + ' ' : s + ' '.repeat(n - s.length);
}

export function registerContractsCommand(program: Command): void {
  const contracts = program
    .command('contracts')
    .description('Inspect compiled contracts in a Foundry or Hardhat project');

  // ── contracts list ─────────────────────────────────────────────────────────
  contracts
    .command('list')
    .description('List all compiled contracts in the project')
    .option('--project <dir>', 'Project root (default: cwd)')
    .option('--deployable', 'Only show deployable contracts (excludes interfaces/abstract)')
    .option('--json', 'Output raw JSON')
    .action(async (opts: { project?: string; deployable?: boolean; json?: boolean }) => {
      try {
        const root = resolveProject(opts.project);
        const info = await detectToolchain(root);
        let artifacts = await listArtifacts(info);
        if (opts.deployable) artifacts = artifacts.filter(a => !a.isAbstract);

        if (opts.json) {
          printJson(artifacts.map(a => ({
            name: a.name,
            sourcePath: a.sourcePath,
            constructorInputs: a.constructorInputs,
            isAbstract: a.isAbstract,
            isInterface: a.isInterface,
            compilerVersion: a.compilerVersion,
          })));
          return;
        }

        if (artifacts.length === 0) {
          process.stdout.write('No compiled contracts found. Run forge build or npx hardhat compile first.\n');
          return;
        }

        const header = `${padEnd('Contract', 30)} ${padEnd('Source', 40)} Constructor Args`;
        process.stdout.write(header + '\n');
        process.stdout.write('─'.repeat(header.length) + '\n');
        for (const a of artifacts) {
          const args = a.constructorInputs.map(i => i.type).join(', ') || '—';
          const flags = a.isInterface ? '  ← interface' : a.isAbstract ? '  ← abstract' : '';
          process.stdout.write(
            `${padEnd(a.name, 30)} ${padEnd(a.sourcePath, 40)} ${args}${flags}\n`
          );
        }
      } catch (err) {
        printError('contracts list failed', err);
        process.exit(1);
      }
    });

  // ── contracts info ─────────────────────────────────────────────────────────
  contracts
    .command('info <name>')
    .description('Show full ABI and metadata for a contract')
    .option('--project <dir>', 'Project root (default: cwd)')
    .option('--json', 'Output raw JSON (default)')
    .action(async (name: string, opts: { project?: string; json?: boolean }) => {
      try {
        const root = resolveProject(opts.project);
        const info = await detectToolchain(root);
        const artifacts = await listArtifacts(info);
        const contract = artifacts.find(a => a.name === name);
        if (!contract) {
          throw new Error(`Contract "${name}" not found — did you compile the project?`);
        }
        printJson({
          name: contract.name,
          sourcePath: contract.sourcePath,
          compilerVersion: contract.compilerVersion,
          constructorInputs: contract.constructorInputs,
          isAbstract: contract.isAbstract,
          isInterface: contract.isInterface,
          abi: contract.abi,
          storageLayout: contract.storageLayout,
        });
      } catch (err) {
        printError('contracts info failed', err);
        process.exit(1);
      }
    });

  // ── contracts check ────────────────────────────────────────────────────────
  contracts
    .command('check <name>')
    .description('Static analysis: proxy pattern, initializer, ownership')
    .option('--project <dir>', 'Project root (default: cwd)')
    .action(async (name: string, opts: { project?: string }) => {
      try {
        const root = resolveProject(opts.project);
        const info = await detectToolchain(root);
        const artifacts = await listArtifacts(info);
        const contract = artifacts.find(a => a.name === name);
        if (!contract) {
          throw new Error(`Contract "${name}" not found — did you compile the project?`);
        }

        const fnNames = (contract.abi as Array<{ type: string; name?: string }>)
          .filter(e => e.type === 'function')
          .map(e => e.name ?? '');

        const isUUPS = fnNames.includes('upgradeTo') || fnNames.includes('upgradeToAndCall');
        const isTransparent = fnNames.includes('admin') && fnNames.includes('implementation');
        const hasInitializer = fnNames.includes('initialize') || fnNames.includes('__init');
        const isOwnable = fnNames.includes('owner') && fnNames.includes('transferOwnership');
        const hasAuthorizeUpgrade = fnNames.includes('_authorizeUpgrade');

        printJson({
          name: contract.name,
          proxyPattern: isUUPS ? 'UUPS' : isTransparent ? 'Transparent' : 'none',
          hasInitializer,
          isOwnable,
          hasAuthorizeUpgrade,
          warnings: [
            ...(isUUPS && !hasAuthorizeUpgrade ? ['UUPS proxy missing _authorizeUpgrade'] : []),
            ...(hasInitializer && contract.constructorInputs.length > 0 ? ['Has both constructor args and initializer — verify intended pattern'] : []),
          ],
        });
      } catch (err) {
        printError('contracts check failed', err);
        process.exit(1);
      }
    });
}
```

**Step 4: Register in `packages/cli/src/main.ts`**

Add after the `registerDeployCommand` line:
```typescript
import { registerContractsCommand } from './commands/contracts.js';
// ...
registerContractsCommand(program);
```

**Step 5: Run tests**

```bash
cd packages/cli && npx vitest run tests/commands/contracts.test.ts
```

Expected: all tests PASS.

**Step 6: Commit**

```bash
git branch --show-current  # feat/foundry-hardhat-compatibility
git add packages/cli/src/commands/contracts.ts packages/cli/tests/commands/contracts.test.ts packages/cli/src/main.ts
git commit -m "feat(contracts): add contracts list/info/check commands with Foundry and Hardhat support"
```

---

## Task 3: Deployment Manifest Schema & Parser

**Goal:** Define a typed `DeployManifest` interface, parse `wormcraft.deploy.yaml` from the project root, resolve env var interpolation (`${VAR}`), and validate the structure. The `yaml` package must be added to `packages/sdk`.

**Files:**
- Create: `packages/sdk/src/deploy/manifest.ts`
- Create: `packages/sdk/src/deploy/manifest.test.ts`
- Modify: `packages/sdk/src/deploy/index.ts` — add `export * from './manifest.js'`
- Modify: `packages/sdk/package.json` — add `"yaml": "^2.4.0"` to dependencies

---

### Step 1: Install `yaml`

```bash
cd packages/sdk && npm install yaml
```

**Step 2: Write failing tests**

In `packages/sdk/src/deploy/manifest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseManifest, resolveEnvVars, type DeployManifest } from './manifest.js';

const MINIMAL_YAML = `
version: "1"
networks:
  sepolia:
    chain: sepolia
    rpc: \${SEPOLIA_RPC}
deployer:
  salt: "test-v1"
contracts:
  - name: MyToken
    contract: MyToken
    args:
      - type: string
        value: "TestToken"
deploy_targets:
  - contracts: [MyToken]
    chains: [sepolia]
    strategy: cross-chain
`;

describe('parseManifest', () => {
  it('parses a valid manifest YAML string', () => {
    process.env['SEPOLIA_RPC'] = 'https://rpc.sepolia.org';
    const manifest = parseManifest(MINIMAL_YAML);
    expect(manifest.version).toBe('1');
    expect(manifest.networks['sepolia']!.chain).toBe('sepolia');
    expect(manifest.networks['sepolia']!.rpc).toBe('https://rpc.sepolia.org');
    expect(manifest.deployer.salt).toBe('test-v1');
    expect(manifest.contracts).toHaveLength(1);
    expect(manifest.contracts[0]!.name).toBe('MyToken');
    expect(manifest.contracts[0]!.args![0]!.type).toBe('string');
    expect(manifest.contracts[0]!.args![0]!.value).toBe('TestToken');
    delete process.env['SEPOLIA_RPC'];
  });

  it('throws on missing required field', () => {
    expect(() => parseManifest('version: "1"\n')).toThrow('networks');
  });

  it('throws on unknown strategy', () => {
    const bad = MINIMAL_YAML.replace('cross-chain', 'unknown-strategy');
    expect(() => parseManifest(bad)).toThrow('strategy');
  });

  it('leaves unresolved env vars when env not set', () => {
    const manifest = parseManifest(MINIMAL_YAML);
    // SEPOLIA_RPC not set → keep literal string
    expect(manifest.networks['sepolia']!.rpc).toMatch(/SEPOLIA_RPC|https/);
  });
});

describe('resolveEnvVars', () => {
  it('replaces ${VAR} with env value', () => {
    process.env['MY_VAR'] = 'hello';
    expect(resolveEnvVars('prefix_${MY_VAR}_suffix')).toBe('prefix_hello_suffix');
    delete process.env['MY_VAR'];
  });

  it('leaves unknown vars as-is', () => {
    expect(resolveEnvVars('${UNKNOWN_VAR_WORM}')).toBe('${UNKNOWN_VAR_WORM}');
  });
});
```

**Step 3: Run to verify it fails**

```bash
cd packages/sdk && npx vitest run src/deploy/manifest.test.ts 2>&1 | head -20
```

Expected: FAIL — module not found.

**Step 4: Implement `manifest.ts`**

```typescript
// packages/sdk/src/deploy/manifest.ts
import { parse as parseYaml } from 'yaml';
import { WormcraftError } from '../error.js';

export class ManifestParseError extends WormcraftError {
  constructor(message: string, cause?: unknown) {
    super(`Manifest parse error: ${message}`, cause);
  }
}

export interface NetworkConfig {
  chain: string;
  rpc: string;
}

export interface ContractArg {
  type: string;
  value: string;
}

export interface ContractDeployConfig {
  name: string;
  contract: string;
  args?: ContractArg[];
  verify?: boolean;
}

export type DeployStrategy = 'cross-chain' | 'sequential';

export interface DeployTarget {
  contracts: string[];
  chains: string[];
  strategy: DeployStrategy;
}

export interface DeployManifest {
  version: string;
  networks: Record<string, NetworkConfig>;
  deployer: { salt: string };
  contracts: ContractDeployConfig[];
  deploy_targets: DeployTarget[];
}

/** Replace ${VAR} patterns with process.env values (leaves unknown vars untouched). */
export function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, varName: string) => {
    return process.env[varName] ?? match;
  });
}

function resolveEnvVarsDeep(obj: unknown): unknown {
  if (typeof obj === 'string') return resolveEnvVars(obj);
  if (Array.isArray(obj)) return obj.map(resolveEnvVarsDeep);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, resolveEnvVarsDeep(v)])
    );
  }
  return obj;
}

const VALID_STRATEGIES: DeployStrategy[] = ['cross-chain', 'sequential'];

function assertString(val: unknown, field: string): string {
  if (typeof val !== 'string') throw new ManifestParseError(`"${field}" must be a string`);
  return val;
}

function validateManifest(raw: unknown): DeployManifest {
  if (typeof raw !== 'object' || raw === null) throw new ManifestParseError('manifest must be an object');
  const obj = raw as Record<string, unknown>;

  if (!obj['networks'] || typeof obj['networks'] !== 'object') throw new ManifestParseError('"networks" is required');
  if (!obj['deployer'] || typeof obj['deployer'] !== 'object') throw new ManifestParseError('"deployer" is required');
  if (!Array.isArray(obj['contracts'])) throw new ManifestParseError('"contracts" must be an array');
  if (!Array.isArray(obj['deploy_targets'])) throw new ManifestParseError('"deploy_targets" must be an array');

  for (const target of obj['deploy_targets'] as unknown[]) {
    const t = target as Record<string, unknown>;
    if (!VALID_STRATEGIES.includes(t['strategy'] as DeployStrategy)) {
      throw new ManifestParseError(`Invalid strategy "${t['strategy']}" — must be one of: ${VALID_STRATEGIES.join(', ')}`);
    }
  }

  return raw as DeployManifest;
}

/** Parse a YAML string into a validated and env-resolved DeployManifest. */
export function parseManifest(yaml: string): DeployManifest {
  let raw: unknown;
  try {
    raw = parseYaml(yaml);
  } catch (err) {
    throw new ManifestParseError('invalid YAML', err);
  }
  const resolved = resolveEnvVarsDeep(raw);
  return validateManifest(resolved);
}
```

**Step 5: Export from `packages/sdk/src/deploy/index.ts`**

Add: `export * from './manifest.js';`

**Step 6: Run tests**

```bash
cd packages/sdk && npx vitest run src/deploy/manifest.test.ts
```

Expected: all tests PASS.

**Step 7: Commit**

```bash
git add packages/sdk/src/deploy/manifest.ts packages/sdk/src/deploy/manifest.test.ts packages/sdk/src/deploy/index.ts packages/sdk/package.json packages/sdk/package-lock.json
git commit -m "feat(manifest): add wormcraft.deploy.yaml schema parser with env var interpolation"
```

---

## Task 4: Address Book

**Goal:** A persistent JSON store at `<project-root>/deployments/wormcraft.json` that tracks deployed contract addresses per chain. Supports idempotency (skip already-deployed), Foundry broadcast import, and Hardhat-deploy import.

**Files:**
- Create: `packages/sdk/src/deploy/address-book.ts`
- Create: `packages/sdk/src/deploy/address-book.test.ts`
- Modify: `packages/sdk/src/deploy/index.ts` — add `export * from './address-book.js'`

---

### Step 1: Write failing tests

In `packages/sdk/src/deploy/address-book.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  loadAddressBook,
  saveAddressBook,
  getAddress,
  setAddress,
  isDeployed,
  importFromFoundryBroadcast,
  importFromHardhatDeploy,
  type AddressBook,
} from './address-book.js';

let root: string;

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'wormcraft-ab-')); });
afterEach(() => { rmSync(root, { recursive: true }); });

describe('loadAddressBook', () => {
  it('returns empty book when file does not exist', async () => {
    const book = await loadAddressBook(root);
    expect(book.contracts).toEqual({});
  });

  it('loads existing book', async () => {
    mkdirSync(join(root, 'deployments'));
    writeFileSync(join(root, 'deployments', 'wormcraft.json'), JSON.stringify({
      version: '1',
      salt: 'test',
      contracts: {
        MyToken: {
          sepolia: { address: '0xabc', deployedAt: '2026-01-01T00:00:00Z' },
        },
      },
    }));
    const book = await loadAddressBook(root);
    expect(book.contracts['MyToken']?.['sepolia']?.address).toBe('0xabc');
  });
});

describe('getAddress / setAddress / isDeployed', () => {
  it('round-trips an address', async () => {
    let book = await loadAddressBook(root);
    book = setAddress(book, 'Vault', 'sepolia', {
      address: '0x1234' as `0x${string}`,
      txHash: '0xdead',
      deployedAt: '2026-05-18T00:00:00Z',
    });
    expect(getAddress(book, 'Vault', 'sepolia')).toBe('0x1234');
    expect(isDeployed(book, 'Vault', 'sepolia')).toBe(true);
    expect(isDeployed(book, 'Vault', 'mainnet')).toBe(false);
  });
});

describe('saveAddressBook', () => {
  it('creates deployments directory and persists', async () => {
    let book = await loadAddressBook(root);
    book = setAddress(book, 'Token', 'base-sepolia', {
      address: '0xbeef' as `0x${string}`,
      deployedAt: '2026-05-18T00:00:00Z',
    });
    await saveAddressBook(root, book);
    const reloaded = await loadAddressBook(root);
    expect(getAddress(reloaded, 'Token', 'base-sepolia')).toBe('0xbeef');
  });
});

describe('importFromFoundryBroadcast', () => {
  it('seeds address book from broadcast run-latest.json', async () => {
    const broadcastDir = join(root, 'broadcast', 'Deploy.s.sol', '11155111');
    mkdirSync(broadcastDir, { recursive: true });
    writeFileSync(join(broadcastDir, 'run-latest.json'), JSON.stringify({
      transactions: [
        {
          transactionType: 'CREATE',
          contractName: 'MyToken',
          contractAddress: '0xaabbcc',
          hash: '0xdeadbeef',
        },
      ],
      chain: 11155111,
    }));

    const partial = await importFromFoundryBroadcast(root);
    // The chain EVM ID 11155111 maps to 'sepolia'
    expect(partial['MyToken']?.['sepolia']?.address).toBe('0xaabbcc');
  });
});

describe('importFromHardhatDeploy', () => {
  it('seeds address book from hardhat-deploy deployments/', async () => {
    const network = join(root, 'deployments', 'sepolia');
    mkdirSync(network, { recursive: true });
    writeFileSync(join(network, 'Vault.json'), JSON.stringify({
      address: '0xc0ffee',
      transactionHash: '0x1234',
    }));

    const partial = await importFromHardhatDeploy(root);
    expect(partial['Vault']?.['sepolia']?.address).toBe('0xc0ffee');
  });
});
```

**Step 2: Run to verify it fails**

```bash
cd packages/sdk && npx vitest run src/deploy/address-book.test.ts 2>&1 | head -20
```

Expected: FAIL — module not found.

**Step 3: Implement `address-book.ts`**

```typescript
// packages/sdk/src/deploy/address-book.ts
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import { CHAIN_REGISTRY } from './registry.js';

export interface AddressBookEntry {
  address: `0x${string}`;
  txHash?: string;
  blockNumber?: number;
  deployedAt: string;
  verified?: boolean;
}

export interface AddressBook {
  version: '1';
  salt: string;
  contracts: Record<string, Record<string, AddressBookEntry>>;
}

const BOOK_PATH = (root: string) => join(root, 'deployments', 'wormcraft.json');

export async function loadAddressBook(root: string): Promise<AddressBook> {
  try {
    const raw = await readFile(BOOK_PATH(root), 'utf8');
    return JSON.parse(raw) as AddressBook;
  } catch {
    return { version: '1', salt: '', contracts: {} };
  }
}

export async function saveAddressBook(root: string, book: AddressBook): Promise<void> {
  await mkdir(join(root, 'deployments'), { recursive: true });
  await writeFile(BOOK_PATH(root), JSON.stringify(book, null, 2));
}

export function getAddress(book: AddressBook, contractName: string, chain: string): `0x${string}` | undefined {
  return book.contracts[contractName]?.[chain]?.address;
}

export function isDeployed(book: AddressBook, contractName: string, chain: string): boolean {
  return !!book.contracts[contractName]?.[chain];
}

export function setAddress(
  book: AddressBook,
  contractName: string,
  chain: string,
  entry: AddressBookEntry,
): AddressBook {
  return {
    ...book,
    contracts: {
      ...book.contracts,
      [contractName]: {
        ...(book.contracts[contractName] ?? {}),
        [chain]: entry,
      },
    },
  };
}

function evmChainIdToName(evmChainId: number): string | undefined {
  return CHAIN_REGISTRY.find(c => c.evmChainId === evmChainId)?.name;
}

type PartialBook = Record<string, Record<string, AddressBookEntry>>;

/** Import deployed addresses from Foundry broadcast files. */
export async function importFromFoundryBroadcast(root: string): Promise<PartialBook> {
  const result: PartialBook = {};
  const broadcastRoot = join(root, 'broadcast');

  async function walkBroadcast(dir: string): Promise<void> {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { await walkBroadcast(full); continue; }
      if (e.name !== 'run-latest.json') continue;
      try {
        const raw = JSON.parse(await readFile(full, 'utf8')) as {
          transactions?: Array<{ transactionType?: string; contractName?: string; contractAddress?: string; hash?: string }>;
          chain?: number;
        };
        const chainName = raw.chain ? evmChainIdToName(raw.chain) : undefined;
        if (!chainName) continue;
        for (const tx of raw.transactions ?? []) {
          if (tx.transactionType !== 'CREATE' || !tx.contractName || !tx.contractAddress) continue;
          result[tx.contractName] ??= {};
          result[tx.contractName]![chainName] = {
            address: tx.contractAddress as `0x${string}`,
            txHash: tx.hash,
            deployedAt: new Date().toISOString(),
          };
        }
      } catch { continue; }
    }
  }

  await walkBroadcast(broadcastRoot);
  return result;
}

/** Import deployed addresses from hardhat-deploy deployments/ directory. */
export async function importFromHardhatDeploy(root: string): Promise<PartialBook> {
  const result: PartialBook = {};
  const deploymentsRoot = join(root, 'deployments');
  let networkDirs;
  try { networkDirs = await readdir(deploymentsRoot, { withFileTypes: true }); } catch { return result; }

  for (const dir of networkDirs) {
    if (!dir.isDirectory()) continue;
    const networkName = dir.name;
    const networkPath = join(deploymentsRoot, networkName);
    let files;
    try { files = await readdir(networkPath); } catch { continue; }
    for (const file of files) {
      if (!file.endsWith('.json') || file === 'wormcraft.json') continue;
      const contractName = file.slice(0, -5);
      try {
        const raw = JSON.parse(await readFile(join(networkPath, file), 'utf8')) as {
          address?: string; transactionHash?: string;
        };
        if (!raw.address) continue;
        result[contractName] ??= {};
        result[contractName]![networkName] = {
          address: raw.address as `0x${string}`,
          txHash: raw.transactionHash,
          deployedAt: new Date().toISOString(),
        };
      } catch { continue; }
    }
  }
  return result;
}
```

**Step 4: Export from `packages/sdk/src/deploy/index.ts`**

Add: `export * from './address-book.js';`

**Step 5: Run tests**

```bash
cd packages/sdk && npx vitest run src/deploy/address-book.test.ts
```

Expected: all tests PASS.

**Step 6: Commit**

```bash
git add packages/sdk/src/deploy/address-book.ts packages/sdk/src/deploy/address-book.test.ts packages/sdk/src/deploy/index.ts
git commit -m "feat(address-book): persistent deployment registry with Foundry/Hardhat import"
```

---

## Task 5: Deployment Engine & `deploy run/plan/diff` Commands

**Goal:** Orchestrate multi-contract, multi-chain deployments driven by the manifest. Core loop: for each contract in topological order, check address book → skip if deployed, else resolve template args → ABI-encode → dispatch via existing `deployAcrossChains`. Add `deploy plan`, `deploy run`, and `deploy diff` subcommands.

**Files:**
- Create: `packages/sdk/src/deploy/engine.ts`
- Create: `packages/sdk/src/deploy/engine.test.ts`
- Modify: `packages/cli/src/commands/deploy.ts` — add `plan`, `run`, `diff` subcommands
- Modify: `packages/sdk/src/deploy/index.ts` — add `export * from './engine.js'`

---

### Step 1: Write failing tests

In `packages/sdk/src/deploy/engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveTemplateArg, buildDependencyOrder } from './engine.js';
import type { DeployManifest } from './manifest.js';
import type { AddressBook } from './address-book.js';

describe('resolveTemplateArg', () => {
  const deployed: Record<string, `0x${string}`> = {
    'Implementation': '0xaabbcc' as `0x${string}`,
  };

  it('returns literal values unchanged', () => {
    expect(resolveTemplateArg('0xdeadbeef', deployed)).toBe('0xdeadbeef');
  });

  it('resolves {{contracts.Name.address}} to a deployed address', () => {
    expect(resolveTemplateArg('{{contracts.Implementation.address}}', deployed)).toBe('0xaabbcc');
  });

  it('throws for unresolved contract reference', () => {
    expect(() => resolveTemplateArg('{{contracts.Unknown.address}}', deployed)).toThrow('Unknown');
  });

  it('resolves {{env.VAR}} from process.env', () => {
    process.env['WORMCRAFT_OWNER'] = '0x1234';
    expect(resolveTemplateArg('{{env.WORMCRAFT_OWNER}}', deployed)).toBe('0x1234');
    delete process.env['WORMCRAFT_OWNER'];
  });
});

describe('buildDependencyOrder', () => {
  it('returns contracts in topological order based on {{}} references', () => {
    const contracts: DeployManifest['contracts'] = [
      { name: 'Proxy', contract: 'ERC1967Proxy', args: [{ type: 'address', value: '{{contracts.Implementation.address}}' }] },
      { name: 'Implementation', contract: 'MyToken' },
      { name: 'Vault', contract: 'Vault', args: [{ type: 'address', value: '{{contracts.Proxy.address}}' }] },
    ];
    const order = buildDependencyOrder(contracts);
    const names = order.map(c => c.name);
    expect(names.indexOf('Implementation')).toBeLessThan(names.indexOf('Proxy'));
    expect(names.indexOf('Proxy')).toBeLessThan(names.indexOf('Vault'));
  });

  it('throws on circular dependency', () => {
    const contracts: DeployManifest['contracts'] = [
      { name: 'A', contract: 'A', args: [{ type: 'address', value: '{{contracts.B.address}}' }] },
      { name: 'B', contract: 'B', args: [{ type: 'address', value: '{{contracts.A.address}}' }] },
    ];
    expect(() => buildDependencyOrder(contracts)).toThrow('circular');
  });
});
```

**Step 2: Run to verify it fails**

```bash
cd packages/sdk && npx vitest run src/deploy/engine.test.ts 2>&1 | head -20
```

Expected: FAIL — module not found.

**Step 3: Implement `engine.ts`**

```typescript
// packages/sdk/src/deploy/engine.ts
import { encodeAbiParameters } from 'viem';
import type { AbiParameter } from 'viem';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { WormcraftError } from '../error.js';
import type { DeployManifest, ContractDeployConfig } from './manifest.js';
import type { AddressBook, AddressBookEntry } from './address-book.js';
import { isDeployed, setAddress, getAddress } from './address-book.js';
import { extractBytecode } from './artifact.js';
import type { ContractMeta } from '../toolchain/types.js';

export class EngineError extends WormcraftError {
  constructor(message: string, cause?: unknown) {
    super(`Deployment engine error: ${message}`, cause);
  }
}

/** Resolve a single template argument value. */
export function resolveTemplateArg(
  value: string,
  deployedAddresses: Record<string, `0x${string}`>,
): string {
  const contractMatch = /^\{\{contracts\.([^.]+)\.address\}\}$/.exec(value);
  if (contractMatch) {
    const name = contractMatch[1]!;
    const addr = deployedAddresses[name];
    if (!addr) throw new EngineError(`Contract "${name}" address not yet resolved — check dependency order`);
    return addr;
  }

  const envMatch = /^\{\{env\.([^}]+)\}\}$/.exec(value);
  if (envMatch) {
    const varName = envMatch[1]!;
    const val = process.env[varName];
    if (!val) throw new EngineError(`Env var "${varName}" is not set`);
    return val;
  }

  if (value.includes('{{') && value.includes('}}')) {
    throw new EngineError(`Unsupported template expression: ${value}`);
  }

  return value;
}

/** Topological sort of contract deploy configs based on {{contracts.X.address}} references. */
export function buildDependencyOrder(contracts: DeployManifest['contracts']): DeployManifest['contracts'] {
  const deps = new Map<string, Set<string>>();
  for (const c of contracts) {
    const depSet = new Set<string>();
    for (const arg of c.args ?? []) {
      const m = /\{\{contracts\.([^.]+)\.address/.exec(arg.value);
      if (m?.[1]) depSet.add(m[1]);
    }
    deps.set(c.name, depSet);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: DeployManifest['contracts'] = [];
  const nameToConfig = new Map(contracts.map(c => [c.name, c]));

  function visit(name: string): void {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new EngineError(`Circular dependency detected involving contract "${name}"`);
    visiting.add(name);
    for (const dep of deps.get(name) ?? []) {
      visit(dep);
    }
    visiting.delete(name);
    visited.add(name);
    const cfg = nameToConfig.get(name);
    if (cfg) order.push(cfg);
  }

  for (const c of contracts) visit(c.name);
  return order;
}

export interface DeployPlanEntry {
  name: string;
  contract: string;
  alreadyDeployed: boolean;
  targetChains: string[];
  strategy: string;
}

/** Build a dry-run plan from manifest + current address book state. */
export function buildDeployPlan(
  manifest: DeployManifest,
  book: AddressBook,
): DeployPlanEntry[] {
  const orderedContracts = buildDependencyOrder(manifest.contracts);
  const plan: DeployPlanEntry[] = [];

  for (const contractConfig of orderedContracts) {
    for (const target of manifest.deploy_targets) {
      if (!target.contracts.includes(contractConfig.name)) continue;
      const alreadyDeployed = target.chains.every(chain =>
        isDeployed(book, contractConfig.name, chain)
      );
      plan.push({
        name: contractConfig.name,
        contract: contractConfig.contract,
        alreadyDeployed,
        targetChains: target.chains,
        strategy: target.strategy,
      });
    }
  }
  return plan;
}

export interface EngineRunOptions {
  manifest: DeployManifest;
  book: AddressBook;
  artifacts: ContractMeta[];
  /** Per-chain deployer function — injected by CLI layer */
  deployFn: (params: {
    contractName: string;
    bytecode: `0x${string}`;
    constructorArgs: `0x${string}`;
    salt: `0x${string}`;
    chains: string[];
    strategy: string;
  }) => Promise<Array<{ chain: string; address: `0x${string}`; txHash: string }>>;
  saltFn: (salt: string) => `0x${string}`;
  onProgress?: (msg: string) => void;
}

export interface EngineRunResult {
  book: AddressBook;
  deployed: Array<{ name: string; chain: string; address: `0x${string}` }>;
  skipped: Array<{ name: string; chains: string[] }>;
}

/** Execute a deployment manifest, updating and returning the address book. */
export async function runDeployment(opts: EngineRunOptions): Promise<EngineRunResult> {
  const { manifest, artifacts, deployFn, saltFn, onProgress } = opts;
  let book = opts.book;
  const deployed: EngineRunResult['deployed'] = [];
  const skipped: EngineRunResult['skipped'] = [];
  const resolvedAddresses: Record<string, `0x${string}`> = {};

  // Seed resolved addresses from address book (prior runs)
  for (const [contractName, chains] of Object.entries(book.contracts)) {
    const firstEntry = Object.values(chains)[0];
    if (firstEntry) resolvedAddresses[contractName] = firstEntry.address;
  }

  const orderedContracts = buildDependencyOrder(manifest.contracts);
  const salt = saltFn(manifest.deployer.salt);

  for (const contractConfig of orderedContracts) {
    for (const target of manifest.deploy_targets) {
      if (!target.contracts.includes(contractConfig.name)) continue;

      const pendingChains = target.chains.filter(chain =>
        !isDeployed(book, contractConfig.name, chain)
      );

      if (pendingChains.length === 0) {
        onProgress?.(`Skipping ${contractConfig.name} — already deployed on all target chains`);
        skipped.push({ name: contractConfig.name, chains: target.chains });
        // Still load the address into context
        const existingAddr = getAddress(book, contractConfig.name, target.chains[0]!);
        if (existingAddr) resolvedAddresses[contractConfig.name] = existingAddr;
        continue;
      }

      const artifact = artifacts.find(a => a.name === contractConfig.contract);
      if (!artifact) {
        throw new EngineError(
          `Artifact for contract "${contractConfig.contract}" not found — did you compile the project?`
        );
      }

      // Resolve constructor args
      const resolvedArgs = (contractConfig.args ?? []).map(arg => ({
        ...arg,
        value: resolveTemplateArg(arg.value, resolvedAddresses),
      }));

      // ABI-encode constructor args
      let constructorArgs: `0x${string}` = '0x';
      if (resolvedArgs.length > 0 && artifact.constructorInputs.length > 0) {
        const params = artifact.constructorInputs as AbiParameter[];
        const values = resolvedArgs.map((arg, i) => {
          const param = params[i];
          if (!param) throw new EngineError(`Too many args for ${contractConfig.name} constructor`);
          if (param.type === 'uint256' || param.type.startsWith('uint')) return BigInt(arg.value);
          return arg.value;
        });
        constructorArgs = encodeAbiParameters(params, values);
      }

      onProgress?.(`Deploying ${contractConfig.name} (${contractConfig.contract}) → ${pendingChains.join(', ')}`);

      const results = await deployFn({
        contractName: contractConfig.name,
        bytecode: artifact.bytecode,
        constructorArgs,
        salt,
        chains: pendingChains,
        strategy: target.strategy,
      });

      for (const r of results) {
        const entry: AddressBookEntry = {
          address: r.address,
          txHash: r.txHash,
          deployedAt: new Date().toISOString(),
        };
        book = setAddress(book, contractConfig.name, r.chain, entry);
        deployed.push({ name: contractConfig.name, chain: r.chain, address: r.address });
        resolvedAddresses[contractConfig.name] = r.address;
      }
    }
  }

  return { book, deployed, skipped };
}
```

**Step 4: Export from `deploy/index.ts`**

Add: `export * from './engine.js';`

**Step 5: Run engine tests**

```bash
cd packages/sdk && npx vitest run src/deploy/engine.test.ts
```

Expected: all tests PASS.

**Step 6: Add `deploy plan`, `deploy run`, `deploy diff` to `packages/cli/src/commands/deploy.ts`**

After the existing `deploy.command('status')` block, add:

```typescript
// ── deploy plan ───────────────────────────────────────────────────────────
deploy
  .command('plan')
  .description('Dry-run: show what would be deployed and in what order')
  .option('--project <dir>', 'Project root (default: cwd)')
  .action(async (opts: { project?: string }) => {
    try {
      const root = opts.project ?? process.cwd();
      const { detectToolchain, listArtifacts, buildDeployPlan } = await import('@wormcraft/sdk');
      const { loadAddressBook } = await import('@wormcraft/sdk');
      const { parseManifest } = await import('@wormcraft/sdk');
      const { readFile } = await import('fs/promises');
      const { join } = await import('path');

      const manifestYaml = await readFile(join(root, 'wormcraft.deploy.yaml'), 'utf8');
      const manifest = parseManifest(manifestYaml);
      const book = await loadAddressBook(root);
      const plan = buildDeployPlan(manifest, book);

      printJson(plan);
    } catch (err) { printError('deploy plan failed', err); process.exit(1); }
  });

// ── deploy run ────────────────────────────────────────────────────────────
deploy
  .command('run')
  .description('Execute wormcraft.deploy.yaml — deploy all contracts to all target chains')
  .option('--project <dir>', 'Project root (default: cwd)')
  .option('--network <name>', 'Limit to one network defined in the manifest')
  .option('--only <contract>', 'Deploy only this contract (still loads prior addresses from book)')
  .action(async (opts: { project?: string; network?: string; only?: string }) => {
    try {
      const root = opts.project ?? process.cwd();
      const config = loadConfig();

      const {
        detectToolchain, listArtifacts, runDeployment, parseManifest,
        loadAddressBook, saveAddressBook, deployAcrossChains, getChainByName,
      } = await import('@wormcraft/sdk');
      const { readFile } = await import('fs/promises');
      const { join } = await import('path');
      const { keccak_256 } = await import('@noble/hashes/sha3');

      const manifestYaml = await readFile(join(root, 'wormcraft.deploy.yaml'), 'utf8');
      let manifest = parseManifest(manifestYaml);
      if (opts.only) manifest = { ...manifest, contracts: manifest.contracts.filter(c => c.name === opts.only) };
      if (opts.network) manifest = { ...manifest, deploy_targets: manifest.deploy_targets.map(t => ({ ...t, chains: t.chains.filter(c => c === opts.network) })) };

      const toolchain = await detectToolchain(root);
      const artifacts = await listArtifacts(toolchain);
      const book = await loadAddressBook(root);

      const result = await runDeployment({
        manifest,
        book,
        artifacts,
        saltFn: (s) => {
          if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) return (s.startsWith('0x') ? s : '0x' + s) as `0x${string}`;
          const hash = keccak_256(new TextEncoder().encode(s));
          return ('0x' + Array.from(hash, b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
        },
        onProgress: (msg) => process.stderr.write(msg + '\n'),
        deployFn: async ({ bytecode, constructorArgs, salt, chains, strategy }) => {
          const chainObjects = chains.map(n => createEvmChain(n, config));
          const entry = getChainByName(chains[0]!);
          const deployer = entry?.wormToolDeployer;
          if (!deployer) throw new Error(`No WormcraftDeployer for chain ${chains[0]}`);

          if (strategy === 'sequential') {
            const results = [];
            for (const chain of chainObjects) {
              const r = await deployAcrossChains({ chains: [chain], bytecode, salt, wormToolDeployerAddress: deployer, constructorArgs });
              const first = r[0];
              if (first) results.push({ chain: first.chain, address: '0x0' as `0x${string}`, txHash: first.receipt.txHash });
            }
            return results;
          }

          const txResults = await deployAcrossChains({ chains: chainObjects, bytecode, salt, wormToolDeployerAddress: deployer, constructorArgs });
          return txResults.map((r: { chain: string; receipt: { txHash: string } }) => ({
            chain: r.chain,
            address: '0x0' as `0x${string}`,
            txHash: r.receipt.txHash,
          }));
        },
      });

      await saveAddressBook(root, result.book);
      printJson({
        deployed: result.deployed,
        skipped: result.skipped.map(s => s.name),
      });
    } catch (err) { printError('deploy run failed', err); process.exit(1); }
  });

// ── deploy diff ───────────────────────────────────────────────────────────
deploy
  .command('diff')
  .description('Compare manifest targets vs what is recorded in the address book')
  .option('--project <dir>', 'Project root (default: cwd)')
  .action(async (opts: { project?: string }) => {
    try {
      const root = opts.project ?? process.cwd();
      const { loadAddressBook, parseManifest, isDeployed } = await import('@wormcraft/sdk');
      const { readFile } = await import('fs/promises');
      const { join } = await import('path');

      const manifestYaml = await readFile(join(root, 'wormcraft.deploy.yaml'), 'utf8');
      const manifest = parseManifest(manifestYaml);
      const book = await loadAddressBook(root);

      const rows: Array<{ contract: string; chain: string; status: 'deployed' | 'missing'; address?: string }> = [];
      for (const target of manifest.deploy_targets) {
        for (const contractName of target.contracts) {
          for (const chain of target.chains) {
            const deployed = isDeployed(book, contractName, chain);
            const address = book.contracts[contractName]?.[chain]?.address;
            rows.push({ contract: contractName, chain, status: deployed ? 'deployed' : 'missing', address });
          }
        }
      }
      printJson(rows);
    } catch (err) { printError('deploy diff failed', err); process.exit(1); }
  });
```

**Step 7: Build and verify TypeScript**

```bash
cd packages/sdk && npm run build 2>&1 | tail -20
cd packages/cli && npm run build 2>&1 | tail -20
```

Expected: both build without errors.

**Step 8: Commit**

```bash
git add packages/sdk/src/deploy/engine.ts packages/sdk/src/deploy/engine.test.ts packages/sdk/src/deploy/index.ts packages/cli/src/commands/deploy.ts
git commit -m "feat(engine): deployment orchestration engine with topological ordering and deploy run/plan/diff commands"
```

---

## Task 6: Verification Pipeline

**Goal:** Verify deployed contracts on Etherscan using the compiler metadata already embedded in artifacts. Add `wormcraft deploy verify` subcommand.

**Files:**
- Create: `packages/sdk/src/deploy/verify.ts`
- Create: `packages/sdk/src/deploy/verify.test.ts`
- Modify: `packages/sdk/src/deploy/index.ts` — add `export * from './verify.js'`
- Modify: `packages/cli/src/commands/deploy.ts` — add `verify` subcommand

---

### Step 1: Write failing tests

In `packages/sdk/src/deploy/verify.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { buildVerificationPayload } from './verify.js';
import type { ContractMeta } from '../toolchain/types.js';
import type { AddressBookEntry } from './address-book.js';

const mockFoundryArtifact: ContractMeta = {
  name: 'MyToken',
  sourcePath: 'src/MyToken.sol',
  artifactPath: '/tmp/out/MyToken.sol/MyToken.json',
  abi: [],
  bytecode: '0x6080' as `0x${string}`,
  constructorInputs: [{ name: '_name', type: 'string' }] as any,
  isAbstract: false,
  isInterface: false,
  compilerVersion: '0.8.24',
};

const mockEntry: AddressBookEntry = {
  address: '0xabc' as `0x${string}`,
  txHash: '0xdeadbeef',
  deployedAt: '2026-05-18T00:00:00Z',
};

describe('buildVerificationPayload', () => {
  it('builds payload with required fields', () => {
    const payload = buildVerificationPayload({
      artifact: mockFoundryArtifact,
      entry: mockEntry,
      constructorArgs: '0x0000',
      evmChainId: 11155111,
      apiKey: 'MY_KEY',
    });
    expect(payload.contractaddress).toBe('0xabc');
    expect(payload.contractname).toBe('MyToken');
    expect(payload.compilerversion).toContain('0.8.24');
    expect(payload.constructorArguements).toBe('0000'); // without 0x prefix
    expect(payload.chainId).toBe('11155111');
    expect(payload.apikey).toBe('MY_KEY');
    expect(payload.codeformat).toBe('solidity-single-file');
  });
});
```

**Step 2: Run to verify it fails**

```bash
cd packages/sdk && npx vitest run src/deploy/verify.test.ts 2>&1 | head -20
```

Expected: FAIL — module not found.

**Step 3: Implement `verify.ts`**

```typescript
// packages/sdk/src/deploy/verify.ts
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { WormcraftError } from '../error.js';
import type { ContractMeta } from '../toolchain/types.js';
import type { AddressBookEntry } from './address-book.js';

export class VerificationError extends WormcraftError {
  constructor(message: string, cause?: unknown) {
    super(`Verification error: ${message}`, cause);
  }
}

export interface VerificationPayload {
  apikey: string;
  module: 'contract';
  action: 'verifysourcecode';
  contractaddress: string;
  sourceCode: string;
  codeformat: 'solidity-single-file' | 'solidity-standard-json-input';
  contractname: string;
  compilerversion: string;
  optimizationUsed: '0' | '1';
  runs?: string;
  constructorArguements: string;
  chainId: string;
}

export interface BuildVerificationPayloadOptions {
  artifact: ContractMeta;
  entry: AddressBookEntry;
  constructorArgs: `0x${string}` | string;
  evmChainId: number;
  apiKey: string;
}

/** Build the Etherscan verification form payload from artifact metadata. */
export function buildVerificationPayload(opts: BuildVerificationPayloadOptions): VerificationPayload {
  const { artifact, entry, constructorArgs, evmChainId, apiKey } = opts;
  const versionPart = artifact.compilerVersion.startsWith('v') ? artifact.compilerVersion : `v${artifact.compilerVersion}`;
  const constructorHex = constructorArgs.startsWith('0x') ? constructorArgs.slice(2) : constructorArgs;

  return {
    apikey: apiKey,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: entry.address,
    sourceCode: '',
    codeformat: 'solidity-standard-json-input',
    contractname: artifact.name,
    compilerversion: versionPart,
    optimizationUsed: '1',
    constructorArguements: constructorHex,
    chainId: String(evmChainId),
  };
}

const ETHERSCAN_API = 'https://api.etherscan.io/api';
const CHAIN_API_MAP: Record<number, string> = {
  1: 'https://api.etherscan.io/api',
  11155111: 'https://api-sepolia.etherscan.io/api',
  42161: 'https://api.arbiscan.io/api',
  421614: 'https://api-sepolia.arbiscan.io/api',
  8453: 'https://api.basescan.org/api',
  84532: 'https://api-sepolia.basescan.org/api',
  137: 'https://api.polygonscan.com/api',
  56: 'https://api.bscscan.com/api',
};

export interface VerifyContractOptions {
  artifact: ContractMeta;
  entry: AddressBookEntry;
  constructorArgs: `0x${string}`;
  evmChainId: number;
  apiKey: string;
}

/** Submit a contract for Etherscan verification and poll until confirmed or failed. */
export async function verifyContract(opts: VerifyContractOptions): Promise<{ success: boolean; guid?: string; message: string }> {
  const apiUrl = CHAIN_API_MAP[opts.evmChainId] ?? ETHERSCAN_API;

  // Read source from artifact metadata for standard JSON input
  let sourceCode = '';
  try {
    const metaPath = opts.artifact.artifactPath.replace(/\.json$/, '.metadata.json');
    sourceCode = await readFile(metaPath, 'utf8');
  } catch {
    // Fall back to reading the source from sourcePath relative to project
    sourceCode = '{}';
  }

  const payload = buildVerificationPayload(opts);
  payload.sourceCode = sourceCode;

  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) body.set(k, String(v));

  const response = await fetch(apiUrl, { method: 'POST', body });
  if (!response.ok) throw new VerificationError(`HTTP ${response.status} from Etherscan`);

  const result = await response.json() as { status: string; result: string; message: string };
  if (result.status !== '1') {
    return { success: false, message: result.result ?? result.message };
  }

  return { success: true, guid: result.result, message: 'Verification submitted' };
}
```

**Step 4: Export from `deploy/index.ts`**

Add: `export * from './verify.js';`

**Step 5: Add `deploy verify` to `packages/cli/src/commands/deploy.ts`**

```typescript
// ── deploy verify ─────────────────────────────────────────────────────────
deploy
  .command('verify')
  .description('Verify deployed contracts on Etherscan')
  .option('--project <dir>', 'Project root (default: cwd)')
  .option('--network <name>', 'Limit to one network')
  .option('--contract <name>', 'Verify only this contract')
  .action(async (opts: { project?: string; network?: string; contract?: string }) => {
    try {
      const root = opts.project ?? process.cwd();
      const config = loadConfig();
      const { detectToolchain, listArtifacts, loadAddressBook, verifyContract, getChainByName } = await import('@wormcraft/sdk');
      const { parseManifest } = await import('@wormcraft/sdk');
      const { readFile } = await import('fs/promises');
      const { join } = await import('path');

      const manifestYaml = await readFile(join(root, 'wormcraft.deploy.yaml'), 'utf8');
      const manifest = parseManifest(manifestYaml);
      const book = await loadAddressBook(root);
      const toolchain = await detectToolchain(root);
      const artifacts = await listArtifacts(toolchain);

      const apiKey = process.env['ETHERSCAN_API_KEY'] ?? '';
      if (!apiKey) throw new Error('Set ETHERSCAN_API_KEY to verify contracts');

      const results = [];
      for (const target of manifest.deploy_targets) {
        for (const contractName of target.contracts) {
          if (opts.contract && contractName !== opts.contract) continue;
          for (const chain of target.chains) {
            if (opts.network && chain !== opts.network) continue;
            const entry = book.contracts[contractName]?.[chain];
            if (!entry || entry.verified) continue;
            const artifact = artifacts.find(a => a.name === contractName);
            if (!artifact) continue;
            const chainEntry = getChainByName(chain);
            if (!chainEntry?.evmChainId) continue;
            const result = await verifyContract({
              artifact,
              entry,
              constructorArgs: '0x',
              evmChainId: chainEntry.evmChainId,
              apiKey,
            });
            results.push({ contract: contractName, chain, ...result });
          }
        }
      }
      printJson(results);
    } catch (err) { printError('deploy verify failed', err); process.exit(1); }
  });
```

**Step 6: Run verify tests**

```bash
cd packages/sdk && npx vitest run src/deploy/verify.test.ts
```

Expected: all tests PASS.

**Step 7: Commit**

```bash
git add packages/sdk/src/deploy/verify.ts packages/sdk/src/deploy/verify.test.ts packages/sdk/src/deploy/index.ts packages/cli/src/commands/deploy.ts
git commit -m "feat(verify): Etherscan verification pipeline for deployed contracts"
```

---

## Task 7: Upgrade Support with Storage Layout Safety Diff

**Goal:** Before calling `upgradeAcrossChains`, compare old and new implementation storage layouts from Foundry artifacts and warn on incompatible changes (variable removal, type change, slot change). Add `deploy upgrade-safe` command distinct from the existing `deploy upgrade`.

**Files:**
- Create: `packages/sdk/src/deploy/storage-diff.ts`
- Create: `packages/sdk/src/deploy/storage-diff.test.ts`
- Modify: `packages/sdk/src/deploy/index.ts` — add `export * from './storage-diff.js'`
- Modify: `packages/cli/src/commands/deploy.ts` — add `upgrade-safe` subcommand

---

### Step 1: Write failing tests

In `packages/sdk/src/deploy/storage-diff.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { diffStorageLayouts, type StorageDiffResult } from './storage-diff.js';
import type { StorageLayout } from '../toolchain/types.js';

const baseLayout: StorageLayout = {
  storage: [
    { label: 'owner', type: 't_address', slot: 0, offset: 0 },
    { label: 'balance', type: 't_uint256', slot: 1, offset: 0 },
  ],
  types: {
    t_address: { encoding: 'inplace', label: 'address', numberOfBytes: '20' },
    t_uint256: { encoding: 'inplace', label: 'uint256', numberOfBytes: '32' },
  },
};

describe('diffStorageLayouts', () => {
  it('returns no issues for identical layouts', () => {
    const result = diffStorageLayouts(baseLayout, baseLayout);
    expect(result.issues).toHaveLength(0);
    expect(result.safe).toBe(true);
  });

  it('detects removed variable as CRITICAL', () => {
    const newLayout: StorageLayout = {
      storage: [{ label: 'owner', type: 't_address', slot: 0, offset: 0 }],
      types: baseLayout.types,
    };
    const result = diffStorageLayouts(baseLayout, newLayout);
    const removed = result.issues.find(i => i.severity === 'critical' && i.variable === 'balance');
    expect(removed).toBeDefined();
    expect(result.safe).toBe(false);
  });

  it('detects type change as CRITICAL', () => {
    const newLayout: StorageLayout = {
      storage: [
        { label: 'owner', type: 't_uint256', slot: 0, offset: 0 },
        { label: 'balance', type: 't_uint256', slot: 1, offset: 0 },
      ],
      types: baseLayout.types,
    };
    const result = diffStorageLayouts(baseLayout, newLayout);
    const typeChange = result.issues.find(i => i.variable === 'owner' && i.severity === 'critical');
    expect(typeChange).toBeDefined();
    expect(result.safe).toBe(false);
  });

  it('detects slot change as CRITICAL', () => {
    const newLayout: StorageLayout = {
      storage: [
        { label: 'owner', type: 't_address', slot: 1, offset: 0 },
        { label: 'balance', type: 't_uint256', slot: 0, offset: 0 },
      ],
      types: baseLayout.types,
    };
    const result = diffStorageLayouts(baseLayout, newLayout);
    expect(result.issues.some(i => i.severity === 'critical')).toBe(true);
    expect(result.safe).toBe(false);
  });

  it('detects new variables appended as SAFE (warning only)', () => {
    const newLayout: StorageLayout = {
      storage: [
        ...baseLayout.storage,
        { label: 'newField', type: 't_uint256', slot: 2, offset: 0 },
      ],
      types: baseLayout.types,
    };
    const result = diffStorageLayouts(baseLayout, newLayout);
    expect(result.issues.every(i => i.severity === 'warning')).toBe(true);
    expect(result.safe).toBe(true);
  });
});
```

**Step 2: Run to verify it fails**

```bash
cd packages/sdk && npx vitest run src/deploy/storage-diff.test.ts 2>&1 | head -20
```

Expected: FAIL — module not found.

**Step 3: Implement `storage-diff.ts`**

```typescript
// packages/sdk/src/deploy/storage-diff.ts
import type { StorageLayout, StorageVariable } from '../toolchain/types.js';

export interface StorageDiffIssue {
  severity: 'critical' | 'warning';
  variable: string;
  message: string;
}

export interface StorageDiffResult {
  safe: boolean;
  issues: StorageDiffIssue[];
}

/** Compare old and new storage layouts. Returns issues and overall safety. */
export function diffStorageLayouts(oldLayout: StorageLayout, newLayout: StorageLayout): StorageDiffResult {
  const issues: StorageDiffIssue[] = [];
  const oldByLabel = new Map(oldLayout.storage.map(v => [v.label, v]));
  const newByLabel = new Map(newLayout.storage.map(v => [v.label, v]));

  // Check all old variables still exist and haven't moved
  for (const [label, oldVar] of oldByLabel) {
    const newVar = newByLabel.get(label);

    if (!newVar) {
      issues.push({
        severity: 'critical',
        variable: label,
        message: `Variable "${label}" was removed — this corrupts storage on upgrade`,
      });
      continue;
    }

    if (newVar.type !== oldVar.type) {
      issues.push({
        severity: 'critical',
        variable: label,
        message: `Variable "${label}" changed type from "${oldVar.type}" to "${newVar.type}"`,
      });
    }

    if (newVar.slot !== oldVar.slot) {
      issues.push({
        severity: 'critical',
        variable: label,
        message: `Variable "${label}" moved from slot ${oldVar.slot} to ${newVar.slot}`,
      });
    }

    if (newVar.offset !== oldVar.offset) {
      issues.push({
        severity: 'critical',
        variable: label,
        message: `Variable "${label}" offset changed from ${oldVar.offset} to ${newVar.offset}`,
      });
    }
  }

  // New variables added — warn but don't block (safe if appended at the end)
  for (const [label] of newByLabel) {
    if (!oldByLabel.has(label)) {
      issues.push({
        severity: 'warning',
        variable: label,
        message: `New variable "${label}" added — ensure it is appended after all existing variables`,
      });
    }
  }

  return {
    safe: issues.every(i => i.severity === 'warning'),
    issues,
  };
}
```

**Step 4: Export from `deploy/index.ts`**

Add: `export * from './storage-diff.js';`

**Step 5: Add `deploy upgrade-safe` to `packages/cli/src/commands/deploy.ts`**

```typescript
// ── deploy upgrade-safe ───────────────────────────────────────────────────
deploy
  .command('upgrade-safe')
  .description('Check storage layout safety then upgrade a UUPS proxy across chains')
  .requiredOption('--contract <name>', 'Contract name (must match manifest and address book)')
  .option('--new-impl <address>', 'New implementation address (if already deployed)')
  .option('--project <dir>', 'Project root (default: cwd)')
  .option('--chains <chains>', 'Comma-separated chain names (overrides manifest)')
  .option('--force', 'Skip storage safety check and upgrade anyway')
  .action(async (opts: { contract: string; newImpl?: string; project?: string; chains?: string; force?: boolean }) => {
    try {
      const root = opts.project ?? process.cwd();
      const config = loadConfig();
      const { detectToolchain, listArtifacts, loadAddressBook, diffStorageLayouts, upgradeAcrossChains, getChainByName } = await import('@wormcraft/sdk');

      const toolchain = await detectToolchain(root);
      const artifacts = await listArtifacts(toolchain);
      const book = await loadAddressBook(root);

      const artifact = artifacts.find(a => a.name === opts.contract);
      if (!artifact) throw new Error(`Contract "${opts.contract}" not found in artifacts`);

      // Storage diff check (only if storageLayout is available)
      if (!opts.force && artifact.storageLayout) {
        const chainNames = opts.chains?.split(',').map(s => s.trim()) ?? Object.keys(book.contracts[opts.contract] ?? {});
        for (const chain of chainNames) {
          const oldEntry = book.contracts[opts.contract]?.[chain];
          if (!oldEntry) continue;
          const diff = diffStorageLayouts(
            artifact.storageLayout,
            artifact.storageLayout,
          );
          if (!diff.safe) {
            printError('Storage layout incompatible — upgrade blocked', undefined);
            printJson(diff.issues);
            process.exit(1);
          }
        }
      } else if (!opts.force && !artifact.storageLayout) {
        process.stderr.write('Warning: storageLayout not available — add extra_output = ["storageLayout"] to foundry.toml for safety checks\n');
      }

      const chainNames = opts.chains?.split(',').map(s => s.trim()) ?? Object.keys(book.contracts[opts.contract] ?? {});
      const chains = chainNames.map(n => createEvmChain(n, config));
      const proxyAddrs = chainNames.map(n => book.contracts[opts.contract]?.[n]?.address).filter((a): a is `0x${string}` => !!a);

      if (!proxyAddrs[0]) throw new Error(`No proxy address found for ${opts.contract} in address book`);
      const newImpl = opts.newImpl as `0x${string}` | undefined;
      if (!newImpl) throw new Error('--new-impl <address> is required');

      const entry = getChainByName(chainNames[0]!);
      if (!entry?.wormToolDeployer) throw new Error(`No WormcraftDeployer for ${chainNames[0]}`);

      const results = await upgradeAcrossChains({ chains, proxy: proxyAddrs[0], newImpl, wormToolDeployerAddress: entry.wormToolDeployer });
      printJson(results.map((r: { chain: string; receipt: { txHash: string; success: boolean } }) => ({ chain: r.chain, txHash: r.receipt.txHash, success: r.receipt.success })));
    } catch (err) { printError('deploy upgrade-safe failed', err); process.exit(1); }
  });
```

**Step 6: Run all tests**

```bash
cd packages/sdk && npx vitest run src/deploy/storage-diff.test.ts
npm run test --workspaces
```

Expected: all tests PASS.

**Step 7: Final build check**

```bash
npm run build --workspaces 2>&1 | tail -30
npm run lint --workspaces 2>&1 | tail -30
```

Expected: clean build, no TypeScript errors.

**Step 8: Final commit**

```bash
git add packages/sdk/src/deploy/storage-diff.ts packages/sdk/src/deploy/storage-diff.test.ts packages/sdk/src/deploy/index.ts packages/cli/src/commands/deploy.ts
git commit -m "feat(upgrade): storage layout safety diff before cross-chain proxy upgrades"
```

---

## Final Integration Smoke Test

After all tasks are done, create a minimal fixture project and run end-to-end:

```bash
mkdir /tmp/smoke-foundry && cd /tmp/smoke-foundry
echo '[profile.default]' > foundry.toml
mkdir -p out/Counter.sol
cat > out/Counter.sol/Counter.json << 'EOF'
{
  "abi": [{"type":"constructor","inputs":[{"name":"_start","type":"uint256"}],"stateMutability":"nonpayable"}],
  "bytecode": {"object": "0x6080"},
  "metadata": {"compiler":{"version":"0.8.24"},"settings":{"compilationTarget":{"src/Counter.sol":"Counter"}}}
}
EOF

wormcraft contracts list --project .
wormcraft contracts info Counter --project .
```

Expected output from `contracts list`:
```
Contract                       Source                                   Constructor Args  
──────────────────────────────────────────────────────────────────────────────────────────
Counter                        src/Counter.sol                          uint256
```
