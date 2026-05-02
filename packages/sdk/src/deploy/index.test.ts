import { describe, it, expect, vi } from 'vitest';
import { deployAcrossChains, callAcrossChains, upgradeAcrossChains } from './index.js';
import type { WormToolChain, TransactionReceipt } from '../chain.js';

function makeMockChain(id: bigint, name: string): WormToolChain {
  return {
    chainId: id,
    chainName: name,
    getBalance: vi.fn().mockResolvedValue(1000n),
    call: vi.fn().mockResolvedValue('0x' as `0x${string}`),
    sendTransaction: vi.fn().mockResolvedValue({
      txHash: `0x${'ab'.repeat(32)}`,
      blockNumber: 1n,
      success: true,
    } satisfies TransactionReceipt),
    waitForTransaction: vi.fn().mockResolvedValue({
      txHash: `0x${'ab'.repeat(32)}`,
      blockNumber: 1n,
      success: true,
    } satisfies TransactionReceipt),
    getCode: vi.fn().mockResolvedValue('0x' as `0x${string}`),
  };
}

const DEPLOYER = `0x${'de'.repeat(20)}`;
const SALT = `0x${'00'.repeat(32)}` as `0x${string}`;

describe('deployAcrossChains', () => {
  it('dispatches a sendTransaction on each chain', async () => {
    const eth = makeMockChain(2n, 'ethereum');
    const bsc = makeMockChain(4n, 'bsc');
    const results = await deployAcrossChains({
      chains: [eth, bsc],
      bytecode: '0x6001',
      salt: SALT,
      wormToolDeployerAddress: DEPLOYER,
    });
    expect(results).toHaveLength(2);
    expect(eth.sendTransaction).toHaveBeenCalledOnce();
    expect(bsc.sendTransaction).toHaveBeenCalledOnce();
  });

  it('result entries carry chain name and id', async () => {
    const eth = makeMockChain(2n, 'ethereum');
    const [result] = await deployAcrossChains({
      chains: [eth],
      bytecode: '0x6001',
      salt: SALT,
      wormToolDeployerAddress: DEPLOYER,
    });
    expect(result!.chain).toBe('ethereum');
    expect(result!.chainId).toBe(2n);
    expect(result!.receipt.success).toBe(true);
  });
});

describe('callAcrossChains', () => {
  it('dispatches on each chain', async () => {
    const eth = makeMockChain(2n, 'ethereum');
    const results = await callAcrossChains({
      chains: [eth],
      target: `0x${'ff'.repeat(20)}`,
      calldata: '0xdeadbeef',
      wormToolDeployerAddress: DEPLOYER,
    });
    expect(results).toHaveLength(1);
    expect(eth.sendTransaction).toHaveBeenCalledOnce();
  });
});

describe('upgradeAcrossChains', () => {
  it('dispatches on each chain', async () => {
    const eth = makeMockChain(2n, 'ethereum');
    const results = await upgradeAcrossChains({
      chains: [eth],
      proxy: `0x${'11'.repeat(20)}`,
      newImpl: `0x${'22'.repeat(20)}`,
      wormToolDeployerAddress: DEPLOYER,
    });
    expect(results).toHaveLength(1);
    expect(eth.sendTransaction).toHaveBeenCalledOnce();
  });
});
