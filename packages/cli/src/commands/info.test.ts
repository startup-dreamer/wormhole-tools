import { describe, it, expect } from 'vitest';

describe('info chains filtering', () => {
  it('CHAIN_REGISTRY has distinct testnet and mainnet entries', async () => {
    const { CHAIN_REGISTRY } = await import('@worm-tool/sdk');
    const testnetOnly = CHAIN_REGISTRY.filter(c => c.isTestnet === true);
    const mainnetOnly = CHAIN_REGISTRY.filter(c => !c.isTestnet);
    expect(testnetOnly.every(c => c.isTestnet)).toBe(true);
    expect(mainnetOnly.every(c => !c.isTestnet)).toBe(true);
    expect(testnetOnly.some(c => c.name === 'sepolia')).toBe(true);
    expect(mainnetOnly.some(c => c.name === 'ethereum')).toBe(true);
  });
});
