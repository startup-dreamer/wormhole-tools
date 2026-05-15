import { describe, it, expect } from 'vitest';
import { getChainById, getChainByName, getChainByEvmId, CHAIN_REGISTRY } from '../../src/deploy/registry.js';

describe('chain registry', () => {
  it('looks up Ethereum by wormhole chain ID 2', () => {
    const chain = getChainById(2);
    expect(chain).toBeDefined();
    expect(chain!.name).toBe('ethereum');
    expect(chain!.wormholeChainId).toBe(2);
  });

  it('looks up Solana by wormhole chain ID 1', () => {
    const chain = getChainById(1);
    expect(chain!.name).toBe('solana');
  });

  it('returns undefined for unknown chain ID', () => {
    expect(getChainById(9999)).toBeUndefined();
  });

  it('looks up by name case-insensitively', () => {
    expect(getChainByName('Ethereum')).toEqual(getChainByName('ethereum'));
  });

  it('has at least 10 chains', () => {
    expect(CHAIN_REGISTRY.length).toBeGreaterThanOrEqual(10);
  });

  it('EVM chains have evmChainId set', () => {
    const eth = getChainById(2);
    expect(eth!.evmChainId).toBe(1);
  });

  it('non-EVM chains have no evmChainId', () => {
    const solana = getChainById(1);
    expect(solana!.evmChainId).toBeUndefined();
  });

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
});
