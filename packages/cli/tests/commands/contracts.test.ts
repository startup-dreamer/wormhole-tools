import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { registerContractsCommand } from '../../src/commands/contracts.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpFoundryProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'worm-tool-contracts-test-'));
  writeFileSync(join(root, 'foundry.toml'), '[profile.default]\n');

  // MyToken — concrete, constructor(string)
  const myTokenDir = join(root, 'out', 'MyToken.sol');
  mkdirSync(myTokenDir, { recursive: true });
  writeFileSync(
    join(myTokenDir, 'MyToken.json'),
    JSON.stringify({
      abi: [
        {
          type: 'constructor',
          inputs: [{ name: '_name', type: 'string' }],
          stateMutability: 'nonpayable',
        },
        { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
        { type: 'function', name: 'transferOwnership', inputs: [{ name: 'newOwner', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
      ],
      bytecode: { object: '0x6080' },
      metadata: {
        compiler: { version: '0.8.24' },
        settings: { compilationTarget: { 'src/MyToken.sol': 'MyToken' } },
      },
    }),
  );

  // Vault — concrete, constructor(address, uint256)
  const vaultDir = join(root, 'out', 'Vault.sol');
  mkdirSync(vaultDir, { recursive: true });
  writeFileSync(
    join(vaultDir, 'Vault.json'),
    JSON.stringify({
      abi: [
        {
          type: 'constructor',
          inputs: [
            { name: '_token', type: 'address' },
            { name: '_cap', type: 'uint256' },
          ],
          stateMutability: 'nonpayable',
        },
        { type: 'function', name: 'upgradeTo', inputs: [{ name: 'impl', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
        { type: 'function', name: 'initialize', inputs: [], outputs: [], stateMutability: 'nonpayable' },
      ],
      bytecode: { object: '0x6080feed' },
      metadata: {
        compiler: { version: '0.8.24' },
        settings: { compilationTarget: { 'src/Vault.sol': 'Vault' } },
      },
    }),
  );

  // IToken — interface (empty bytecode)
  const iTokenDir = join(root, 'out', 'IToken.sol');
  mkdirSync(iTokenDir, { recursive: true });
  writeFileSync(
    join(iTokenDir, 'IToken.json'),
    JSON.stringify({
      abi: [
        { type: 'function', name: 'transfer', inputs: [], outputs: [], stateMutability: 'nonpayable' },
      ],
      bytecode: { object: '0x' },
      metadata: {
        compiler: { version: '0.8.24' },
        settings: { compilationTarget: { 'src/IToken.sol': 'IToken' } },
      },
    }),
  );

  return root;
}

/** Create an empty temp directory (no toolchain files). */
function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'worm-tool-empty-'));
}

function makeProgram(): Command {
  const p = new Command();
  p.exitOverride();
  registerContractsCommand(p);
  return p;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let root: string;

beforeEach(() => {
  root = makeTmpFoundryProject();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null) => {
    throw new Error(`exit:${_code}`);
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper to collect output via commander's configureOutput
// ---------------------------------------------------------------------------

async function runContracts(args: string[]): Promise<string> {
  const output: string[] = [];
  const p = new Command();
  p.exitOverride();
  p.configureOutput({
    writeOut: (s) => output.push(s),
    writeErr: (s) => output.push(s),
  });
  // console.log is mocked; re-implement to capture JSON output
  (console.log as ReturnType<typeof vi.fn>).mockImplementation((s: string) => output.push(s));
  registerContractsCommand(p);
  await p.parseAsync(args, { from: 'user' });
  return output.join('');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('contracts command', () => {
  it('is registered with name "contracts"', () => {
    const p = makeProgram();
    expect(p.commands.map((c) => c.name())).toContain('contracts');
  });

  describe('contracts list --json', () => {
    it('returns all 3 contracts', async () => {
      const raw = await runContracts(['contracts', 'list', '--project', root, '--json']);
      const result = JSON.parse(raw) as Array<{ name: string; isAbstract: boolean; isInterface: boolean }>;
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      const names = result.map((c) => c.name).sort();
      expect(names).toEqual(['IToken', 'MyToken', 'Vault']);
    });

    it('each entry has required fields', async () => {
      const raw = await runContracts(['contracts', 'list', '--project', root, '--json']);
      const result = JSON.parse(raw) as Array<{
        name: string;
        sourcePath: string;
        constructorInputs: unknown[];
        isAbstract: boolean;
        isInterface: boolean;
        compilerVersion: string;
      }>;
      for (const c of result) {
        expect(typeof c.name).toBe('string');
        expect(typeof c.sourcePath).toBe('string');
        expect(Array.isArray(c.constructorInputs)).toBe(true);
        expect(typeof c.isAbstract).toBe('boolean');
        expect(typeof c.isInterface).toBe('boolean');
        expect(typeof c.compilerVersion).toBe('string');
      }
    });
  });

  describe('contracts list --deployable', () => {
    it('filters out abstract/interface contracts', async () => {
      const raw = await runContracts(['contracts', 'list', '--project', root, '--deployable', '--json']);
      const result = JSON.parse(raw) as Array<{ name: string; isAbstract: boolean }>;
      expect(result.every((c) => !c.isAbstract)).toBe(true);
      const names = result.map((c) => c.name).sort();
      expect(names).toEqual(['MyToken', 'Vault']);
    });
  });

  describe('contracts info', () => {
    it('returns full metadata for MyToken', async () => {
      const raw = await runContracts(['contracts', 'info', 'MyToken', '--project', root]);
      const result = JSON.parse(raw) as {
        name: string;
        sourcePath: string;
        compilerVersion: string;
        constructorInputs: Array<{ type: string }>;
        isAbstract: boolean;
        isInterface: boolean;
        abi: unknown[];
        storageLayout: unknown;
      };
      expect(result.name).toBe('MyToken');
      expect(result.sourcePath).toBe('src/MyToken.sol');
      expect(result.compilerVersion).toBe('0.8.24');
      expect(result.constructorInputs).toHaveLength(1);
      expect(result.constructorInputs[0]!.type).toBe('string');
      expect(result.isAbstract).toBe(false);
      expect(Array.isArray(result.abi)).toBe(true);
    });

    it('exits with code 1 for a non-existent contract', async () => {
      await expect(
        runContracts(['contracts', 'info', 'NonExistent', '--project', root]),
      ).rejects.toThrow('exit:1');
    });
  });

  describe('contracts check', () => {
    it('detects UUPS proxy pattern for Vault (has upgradeTo)', async () => {
      const raw = await runContracts(['contracts', 'check', 'Vault', '--project', root]);
      const result = JSON.parse(raw) as {
        name: string;
        proxyPattern: string;
        hasInitializer: boolean;
        isOwnable: boolean;
        hasAuthorizeUpgrade: boolean;
        warnings: string[];
      };
      expect(result.name).toBe('Vault');
      expect(result.proxyPattern).toBe('UUPS');
      expect(result.hasInitializer).toBe(true);
      expect(result.isOwnable).toBe(false);
      expect(result.hasAuthorizeUpgrade).toBe(false);
    });

    it('warns when UUPS proxy is missing _authorizeUpgrade', async () => {
      const raw = await runContracts(['contracts', 'check', 'Vault', '--project', root]);
      const result = JSON.parse(raw) as { warnings: string[] };
      expect(result.warnings.some((w) => w.includes('_authorizeUpgrade'))).toBe(true);
    });

    it('detects isOwnable on MyToken', async () => {
      const raw = await runContracts(['contracts', 'check', 'MyToken', '--project', root]);
      const result = JSON.parse(raw) as { isOwnable: boolean; proxyPattern: string };
      expect(result.isOwnable).toBe(true);
      expect(result.proxyPattern).toBe('none');
    });

    it('exits with code 1 for a non-existent contract', async () => {
      await expect(
        runContracts(['contracts', 'check', 'NonExistent', '--project', root]),
      ).rejects.toThrow('exit:1');
    });
  });

  it('contracts list exits with error for non-project directory', async () => {
    const empty = makeTmpDir();
    let exitCode: number | undefined;
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error(`exit:${code}`);
    }) as never;
    try {
      const program = new Command();
      program.exitOverride();
      registerContractsCommand(program);
      await program.parseAsync(['contracts', 'list', '--project', empty], { from: 'user' });
    } catch {
      // expected
    } finally {
      process.exit = origExit;
      rmSync(empty, { recursive: true });
    }
    expect(exitCode).toBe(1);
  });

  it('contracts list renders table when --json not given', async () => {
    const output: string[] = [];
    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeOut: (s) => output.push(s) });
    // capture console.log output (renderTable uses console.log)
    vi.spyOn(console, 'log').mockImplementation((s: string) => { output.push(s); });
    registerContractsCommand(program);
    await program.parseAsync(['contracts', 'list', '--project', root], { from: 'user' });
    const combined = output.join('');
    expect(combined).toContain('MyToken');
    expect(combined).toContain('─');
  });
});
