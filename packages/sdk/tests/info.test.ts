import { describe, it, expect } from 'vitest';
import { getChainInfo } from '../src/info.js';
import { ChainNotSupportedError } from '../src/error.js';

describe('getChainInfo', () => {
  it('returns info for ethereum by name', () => {
    const info = getChainInfo('ethereum');
    expect(info.name).toBe('ethereum');
    expect(info.wormholeChainId).toBe(2);
    expect(info.evmChainId).toBe(1);
    expect(info.finality).toContain('15 min');
  });

  it('returns info for solana by ID', () => {
    const info = getChainInfo(1);
    expect(info.name).toBe('solana');
    expect(info.evmChainId).toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(getChainInfo('Ethereum').wormholeChainId).toBe(getChainInfo('ethereum').wormholeChainId);
  });

  it('throws ChainNotSupportedError for unknown name', () => {
    expect(() => getChainInfo('nonexistentchain')).toThrow(ChainNotSupportedError);
  });

  it('throws ChainNotSupportedError for unknown ID', () => {
    expect(() => getChainInfo(9999)).toThrow(ChainNotSupportedError);
  });
});
