import { describe, it, expect, vi } from 'vitest';
import {
  deployAcrossChains,
  callAcrossChains,
  upgradeAcrossChains,
  executeViaModule,
  scheduleUpgradeViaManagedAdmin,
  executeUpgradeViaManagedAdmin,
} from '../../src/deploy/index.js';
import type { WormcraftChain, TransactionReceipt } from '../../src/chain.js';

function makeMockChain(id: bigint, name: string): WormcraftChain {
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
  it('sends exactly one tx from the source chain, encoding target chains in calldata', async () => {
    const eth = makeMockChain(2n, 'ethereum');
    const bsc = makeMockChain(4n, 'bsc');
    const results = await deployAcrossChains({
      chains: [eth, bsc],
      bytecode: '0x6001',
      salt: SALT,
      wormToolDeployerAddress: DEPLOYER,
    });
    // Only one result — the source chain receipt
    expect(results).toHaveLength(1);
    // Source chain sent the tx; target chain did NOT send a separate tx
    expect(eth.sendTransaction).toHaveBeenCalledOnce();
    expect(bsc.sendTransaction).not.toHaveBeenCalled();
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

const MODULE = `0x${'ee'.repeat(20)}` as `0x${string}`;
const SAFE   = `0x${'aa'.repeat(20)}` as `0x${string}`;
const PROXY  = `0x${'cc'.repeat(20)}` as `0x${string}`;

describe('executeViaModule', () => {
  it('sends one tx to WormcraftDeployer encoding the module address', async () => {
    const eth = makeMockChain(10002n, 'sepolia');
    const results = await executeViaModule({
      chains: [eth],
      moduleAddress: MODULE,
      safe: SAFE,
      target: PROXY,
      calldata: '0x12345678' as `0x${string}`,
      wormToolDeployerAddress: DEPLOYER,
    });
    expect(results).toHaveLength(1);
    expect(eth.sendTransaction).toHaveBeenCalledOnce();
    const [toAddr] = (eth.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0] as [string, ...unknown[]];
    expect(toAddr.toLowerCase()).toBe(DEPLOYER.toLowerCase());
  });

  it('throws when chains array is empty', async () => {
    await expect(executeViaModule({
      chains: [],
      moduleAddress: MODULE,
      safe: SAFE,
      target: PROXY,
      calldata: '0x' as `0x${string}`,
      wormToolDeployerAddress: DEPLOYER,
    })).rejects.toThrow();
  });
});

const ADMIN_MODULE = `0x${'ad'.repeat(20)}` as `0x${string}`;
const NEW_IMPL     = `0x${'bb'.repeat(20)}` as `0x${string}`;
const UPGRADE_SALT = `0x${'ff'.repeat(32)}` as `0x${string}`;

describe('scheduleUpgradeViaManagedAdmin', () => {
  it('sends tx to WormcraftDeployer with AdminModule as callAcrossChains target', async () => {
    const eth = makeMockChain(10002n, 'sepolia');
    await scheduleUpgradeViaManagedAdmin({
      chains: [eth],
      adminModule: ADMIN_MODULE,
      proxy: PROXY,
      newImpl: NEW_IMPL,
      salt: UPGRADE_SALT,
      wormToolDeployerAddress: DEPLOYER,
    });
    expect(eth.sendTransaction).toHaveBeenCalledTimes(1);
    const [toAddr] = (eth.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0] as [string, ...unknown[]];
    expect(toAddr.toLowerCase()).toBe(DEPLOYER.toLowerCase());
  });
});

describe('executeUpgradeViaManagedAdmin', () => {
  it('sends a different calldata selector than schedule', async () => {
    const eth1 = makeMockChain(10002n, 'sepolia');
    const eth2 = makeMockChain(10002n, 'sepolia');

    await scheduleUpgradeViaManagedAdmin({
      chains: [eth1], adminModule: ADMIN_MODULE, proxy: PROXY,
      newImpl: NEW_IMPL, salt: UPGRADE_SALT, wormToolDeployerAddress: DEPLOYER,
    });
    await executeUpgradeViaManagedAdmin({
      chains: [eth2], adminModule: ADMIN_MODULE, proxy: PROXY,
      newImpl: NEW_IMPL, salt: UPGRADE_SALT, wormToolDeployerAddress: DEPLOYER,
    });

    const scheduleData = (eth1.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    const executeData  = (eth2.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    // Both calls share the outer callAcrossChains selector but embed different inner calldata.
    expect(scheduleData).not.toBe(executeData);
  });
});
