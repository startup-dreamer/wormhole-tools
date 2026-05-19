import { describe, it, expect } from 'vitest';
import { SolanaChain } from '../../src/chains/solana.js';
import { RpcError } from '../../src/error.js';

describe('SolanaChain', () => {
  it('has correct wormhole chain ID (1)', () => {
    const chain = new SolanaChain({ rpcUrl: 'https://api.devnet.solana.com' });
    expect(chain.chainId).toBe(1n);
    expect(chain.chainName).toBe('solana');
  });

  it('call() rejects — no eth_call equivalent on Solana', async () => {
    const chain = new SolanaChain({ rpcUrl: 'https://api.devnet.solana.com' });
    await expect(chain.call('addr', '0x')).rejects.toThrow(RpcError);
  });

  it('getCode() rejects — not applicable to Solana', async () => {
    const chain = new SolanaChain({ rpcUrl: 'https://api.devnet.solana.com' });
    await expect(chain.getCode('some-account')).rejects.toThrow(RpcError);
  });
});
