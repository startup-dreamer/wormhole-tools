import { describe, it, expect } from 'vitest';
import { parseManifest, resolveEnvVars } from './manifest.js';

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

  it('leaves unresolved env vars as literal when env not set', () => {
    delete process.env['SEPOLIA_RPC'];
    const manifest = parseManifest(MINIMAL_YAML);
    expect(manifest.networks['sepolia']!.rpc).toBe('${SEPOLIA_RPC}');
  });
});

describe('resolveEnvVars', () => {
  it('replaces ${VAR} with env value', () => {
    process.env['MY_VAR'] = 'hello';
    expect(resolveEnvVars('prefix_${MY_VAR}_suffix')).toBe('prefix_hello_suffix');
    delete process.env['MY_VAR'];
  });

  it('leaves unknown vars as-is', () => {
    expect(resolveEnvVars('${UNKNOWN_VAR_WORM_XYZ}')).toBe('${UNKNOWN_VAR_WORM_XYZ}');
  });
});
