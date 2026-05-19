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
