import { describe, it, expect } from 'vitest';
import { detectToolchain, listArtifacts } from './index.js';
import { join } from 'path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'wormcraft-test-'));
}

function writeJson(path: string, obj: unknown): void {
  writeFileSync(path, JSON.stringify(obj));
}

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
      storage: [{ label: 'owner', type: 't_address', slot: '0', offset: 0 }],
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
