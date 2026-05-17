import { describe, it, expect, vi } from 'vitest';
import { checkContractDeployed } from './status.js';
import type { WormToolChain } from '../chain.js';

function makeChain(code: `0x${string}`): WormToolChain {
  return {
    chainId: 2n,
    chainName: 'ethereum',
    getBalance: vi.fn(),
    call: vi.fn(),
    sendTransaction: vi.fn(),
    waitForTransaction: vi.fn(),
    getCode: vi.fn().mockResolvedValue(code),
  };
}

describe('checkContractDeployed', () => {
  it('returns true when getCode returns non-empty bytecode', async () => {
    const chain = makeChain('0x6001');
    expect(await checkContractDeployed(chain, '0x' + 'ab'.repeat(20))).toBe(true);
  });

  it('returns false when getCode returns 0x (not deployed)', async () => {
    const chain = makeChain('0x');
    expect(await checkContractDeployed(chain, '0x' + 'ab'.repeat(20))).toBe(false);
  });

  it('calls getCode with the given address', async () => {
    const chain = makeChain('0x1234');
    const addr = '0x' + 'cc'.repeat(20);
    await checkContractDeployed(chain, addr);
    expect(chain.getCode).toHaveBeenCalledWith(addr);
  });
});
