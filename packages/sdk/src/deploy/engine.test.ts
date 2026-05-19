import { describe, it, expect, vi } from 'vitest';
import { resolveTemplateArg, buildDependencyOrder, buildDeployPlan, runDeployment } from './engine.js';
import type { DeployManifest } from './manifest.js';
import type { AddressBook } from './address-book.js';
import type { ContractMeta } from '../toolchain/types.js';

const deployed: Record<string, `0x${string}`> = {
  Implementation: '0xaabbcc' as `0x${string}`,
};

describe('resolveTemplateArg', () => {
  it('returns literal values unchanged', () => {
    expect(resolveTemplateArg('0xdeadbeef', deployed)).toBe('0xdeadbeef');
  });

  it('resolves {{contracts.Name.address}} to deployed address', () => {
    expect(resolveTemplateArg('{{contracts.Implementation.address}}', deployed)).toBe('0xaabbcc');
  });

  it('throws for unresolved contract reference', () => {
    expect(() => resolveTemplateArg('{{contracts.Unknown.address}}', deployed)).toThrow('Unknown');
  });

  it('resolves {{env.VAR}} from process.env', () => {
    process.env['WORM_TEST_VAR'] = '0x1234';
    expect(resolveTemplateArg('{{env.WORM_TEST_VAR}}', deployed)).toBe('0x1234');
    delete process.env['WORM_TEST_VAR'];
  });

  it('throws for unsupported template expression', () => {
    expect(() => resolveTemplateArg('{{unknown.thing}}', deployed)).toThrow('Unsupported');
  });
});

describe('buildDependencyOrder', () => {
  it('returns contracts in topological order', () => {
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

  it('resolves contract whose dep is externally provided (already in address book)', () => {
    // Vault depends on Counter, but Counter is not in contracts — it's already deployed
    const contracts: DeployManifest['contracts'] = [
      { name: 'Vault', contract: 'Vault', args: [{ type: 'address', value: '{{contracts.Counter.address}}' }] },
    ];
    const resolved = buildDependencyOrder(contracts, new Set(['Counter']));
    expect(resolved.map(c => c.name)).toEqual(['Vault']);
  });
});

describe('buildDeployPlan', () => {
  const manifest: DeployManifest = {
    version: '1',
    networks: { sepolia: { chain: 'sepolia', rpc: 'http://localhost' } },
    deployer: { salt: 'test' },
    contracts: [{ name: 'Token', contract: 'MyToken' }],
    deploy_targets: [{ contracts: ['Token'], chains: ['sepolia'], strategy: 'cross-chain' }],
  };

  it('marks contract as alreadyDeployed when in address book', () => {
    const book: AddressBook = {
      version: '1', salt: 'test',
      contracts: { Token: { sepolia: { address: '0xabc' as `0x${string}`, deployedAt: '2026-01-01T00:00:00Z' } } },
    };
    const plan = buildDeployPlan(manifest, book);
    expect(plan[0]!.alreadyDeployed).toBe(true);
  });

  it('marks contract as not deployed when missing from book', () => {
    const book: AddressBook = { version: '1', salt: '', contracts: {} };
    const plan = buildDeployPlan(manifest, book);
    expect(plan[0]!.alreadyDeployed).toBe(false);
  });
});

describe('runDeployment', () => {
  const manifest: DeployManifest = {
    version: '1',
    networks: { sepolia: { chain: 'sepolia', rpc: 'http://localhost' } },
    deployer: { salt: 'my-salt' },
    contracts: [{ name: 'Token', contract: 'MyToken', args: [{ type: 'string', value: 'TestToken' }] }],
    deploy_targets: [{ contracts: ['Token'], chains: ['sepolia'], strategy: 'cross-chain' }],
  };

  const artifact: ContractMeta = {
    name: 'MyToken',
    sourcePath: 'src/MyToken.sol',
    artifactPath: '/tmp/MyToken.json',
    abi: [{ type: 'constructor', inputs: [{ name: '_name', type: 'string' }], stateMutability: 'nonpayable' }],
    bytecode: '0x6080' as `0x${string}`,
    constructorInputs: [{ name: '_name', type: 'string' }],
    isAbstract: false,
    isInterface: false,
    compilerVersion: '0.8.24',
  };

  const emptyBook: AddressBook = { version: '1', salt: '', contracts: {} };

  it('calls deployFn and records result in address book', async () => {
    const deployFn = vi.fn().mockResolvedValue([{ chain: 'sepolia', address: '0xdeployed' as `0x${string}`, txHash: '0xtx' }]);
    const result = await runDeployment({
      manifest,
      book: emptyBook,
      artifacts: [artifact],
      deployFn,
      saltFn: () => ('0x' + '00'.repeat(32)) as `0x${string}`,
    });
    expect(deployFn).toHaveBeenCalledOnce();
    expect(result.deployed).toHaveLength(1);
    expect(result.deployed[0]!.address).toBe('0xdeployed');
    expect(result.book.contracts['Token']?.['sepolia']?.address).toBe('0xdeployed');
  });

  it('skips contract already in address book', async () => {
    const bookWithToken: AddressBook = {
      version: '1', salt: '',
      contracts: { Token: { sepolia: { address: '0xexisting' as `0x${string}`, deployedAt: '2026-01-01T00:00:00Z' } } },
    };
    const deployFn = vi.fn();
    const result = await runDeployment({
      manifest,
      book: bookWithToken,
      artifacts: [artifact],
      deployFn,
      saltFn: () => ('0x' + '00'.repeat(32)) as `0x${string}`,
    });
    expect(deployFn).not.toHaveBeenCalled();
    expect(result.skipped).toHaveLength(1);
  });

  it('throws EngineError when artifact not found', async () => {
    await expect(runDeployment({
      manifest,
      book: emptyBook,
      artifacts: [],
      deployFn: vi.fn(),
      saltFn: () => ('0x' + '00'.repeat(32)) as `0x${string}`,
    })).rejects.toThrow('MyToken');
  });
});

describe('runDeployment dry-run', () => {
  it('dry-run skips deployFn and returns computed addresses', async () => {
    const manifest: DeployManifest = {
      version: '1',
      networks: { sepolia: { chain: 'sepolia', rpc: 'http://localhost' } },
      deployer: { salt: 'test' },
      contracts: [{ name: 'Counter', contract: 'Counter' }],
      deploy_targets: [{ contracts: ['Counter'], chains: ['sepolia'], strategy: 'sequential' }],
    };
    const book: AddressBook = { version: '1', salt: '', contracts: {} };
    const artifacts: ContractMeta[] = [
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
      saltFn: _s => ('0x' + '00'.repeat(32)) as `0x${string}`,
      deployFn: async () => { deployFnCalled = true; return []; },
      dryRun: true,
      dryRunDeployerAddress: '0x4e59b44847b379578588920cA78FbF26c0B4956C',
    });

    expect(deployFnCalled).toBe(false);
    expect(result.deployed.length).toBe(1);
    expect(result.deployed[0]?.name).toBe('Counter');
    expect(result.deployed[0]?.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

describe('bool constructor arg encoding', () => {
  it('correctly encodes bool constructor arg', async () => {
    const boolArtifact: ContractMeta = {
      name: 'Toggle',
      sourcePath: 'src/Toggle.sol',
      artifactPath: '/tmp/Toggle.json',
      abi: [{ type: 'constructor', inputs: [{ name: '_enabled', type: 'bool' }], stateMutability: 'nonpayable' }],
      bytecode: '0x6080' as `0x${string}`,
      constructorInputs: [{ name: '_enabled', type: 'bool' }],
      isAbstract: false,
      isInterface: false,
      compilerVersion: '0.8.24',
    };
    const boolManifest: DeployManifest = {
      version: '1',
      networks: { sepolia: { chain: 'sepolia', rpc: 'http://localhost' } },
      deployer: { salt: 'test' },
      contracts: [{ name: 'Toggle', contract: 'Toggle', args: [{ type: 'bool', value: 'true' }] }],
      deploy_targets: [{ contracts: ['Toggle'], chains: ['sepolia'], strategy: 'cross-chain' }],
    };
    const deployFn = vi.fn().mockResolvedValue([{ chain: 'sepolia', address: '0xfeed' as `0x${string}`, txHash: '0xtx' }]);
    const result = await runDeployment({
      manifest: boolManifest,
      book: { version: '1', salt: '', contracts: {} },
      artifacts: [boolArtifact],
      deployFn,
      saltFn: () => '0x' + '00'.repeat(32) as `0x${string}`,
    });
    expect(deployFn).toHaveBeenCalledOnce();
    const callArgs = deployFn.mock.calls[0]![0];
    // constructorArgs should be ABI-encoded bool(true) = 32 bytes of 0x...01
    expect(callArgs.constructorArgs).not.toBe('0x');
    expect(result.deployed[0]!.address).toBe('0xfeed');
  });
});
