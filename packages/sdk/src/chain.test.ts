import { describe, it, expect } from 'vitest';
import type { WormToolChain, TransactionReceipt } from './chain.js';

class MockChain implements WormToolChain {
  readonly chainId = 2n;
  readonly chainName = 'ethereum';
  async getBalance(_address: string): Promise<bigint> { return 1000n; }
  async call(_to: string, _data: `0x${string}`): Promise<`0x${string}`> { return '0x'; }
  async sendTransaction(_to: string, _data: `0x${string}`, _value?: bigint): Promise<TransactionReceipt> {
    return { txHash: '0xabc', blockNumber: 1n, success: true };
  }
  async waitForTransaction(txHash: string): Promise<TransactionReceipt> {
    return { txHash, blockNumber: 2n, success: true };
  }
  async getCode(_address: string): Promise<`0x${string}`> { return '0x6001'; }
}

describe('WormToolChain interface', () => {
  it('mock satisfies the interface', async () => {
    const chain: WormToolChain = new MockChain();
    expect(chain.chainId).toBe(2n);
    const bal = await chain.getBalance('0x1234');
    expect(bal).toBe(1000n);
  });

  it('sendTransaction returns a receipt', async () => {
    const chain = new MockChain();
    const receipt = await chain.sendTransaction('0x1234', '0xdeadbeef');
    expect(receipt.success).toBe(true);
    expect(receipt.txHash).toBe('0xabc');
  });

  it('waitForTransaction returns receipt with correct txHash', async () => {
    const chain = new MockChain();
    const receipt = await chain.waitForTransaction('0xdeadbeef');
    expect(receipt.txHash).toBe('0xdeadbeef');
    expect(receipt.blockNumber).toBe(2n);
  });

  it('getCode returns bytecode', async () => {
    const chain = new MockChain();
    const code = await chain.getCode('0x1234');
    expect(code).toBe('0x6001');
  });
});
