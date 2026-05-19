import { describe, it, expect } from 'vitest';
import { EvmChain } from '../../src/chains/evm.js';

describe('EvmChain', () => {
  it('constructs with rpc url and wormhole chain id', () => {
    const chain = new EvmChain({ rpcUrl: 'http://localhost:8545', wormholeChainId: 2n, evmChainId: 1 });
    expect(chain.chainId).toBe(2n);
    expect(chain.chainName).toBe('ethereum');
  });

  it('chainName defaults to "evm-{id}" for unknown wormhole chain IDs', () => {
    const chain = new EvmChain({ rpcUrl: 'http://localhost:8545', wormholeChainId: 999n, evmChainId: 1337 });
    expect(chain.chainName).toBe('evm-999');
  });

  it('satisfies WormToolChain interface', () => {
    const chain = new EvmChain({ rpcUrl: 'http://localhost:8545', wormholeChainId: 4n, evmChainId: 56 });
    expect(chain.chainId).toBe(4n);
    expect(chain.chainName).toBe('bsc');
    expect(typeof chain.getBalance).toBe('function');
    expect(typeof chain.call).toBe('function');
    expect(typeof chain.sendTransaction).toBe('function');
    expect(typeof chain.waitForTransaction).toBe('function');
    expect(typeof chain.getCode).toBe('function');
  });
});
