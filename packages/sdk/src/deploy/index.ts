import { encodeFunctionData } from 'viem';
import type { WormToolChain, TransactionReceipt } from '../chain.js';
import { WormToolError } from '../error.js';

export { extractBytecode } from './artifact.js';
export { computeCreate2Address } from './create2.js';
export { getChainById, getChainByName, getChainByEvmId, CHAIN_REGISTRY } from './registry.js';
export type { ChainEntry } from './registry.js';
export { checkContractDeployed } from './status.js';
export * from './abi.js';
export * from './manifest.js';
export * from './address-book.js';
export * from './engine.js';
export * from './verify.js';
export * from './storage-diff.js';

/** Minimal ABI fragment for WormToolDeployer.deployAcrossChains. */
const DEPLOY_ABI = [{
  name: 'deployAcrossChains',
  type: 'function',
  inputs: [
    { name: 'targetChains', type: 'uint16[]' },
    { name: 'bytecode', type: 'bytes' },
    { name: 'salt', type: 'bytes32' },
    { name: 'initCalldata', type: 'bytes' },
    { name: 'deployOnCurrentChain', type: 'bool' },
  ],
  stateMutability: 'payable',
}] as const;

/** Minimal ABI fragment for WormToolDeployer.callAcrossChains. */
const CALL_ABI = [{
  name: 'callAcrossChains',
  type: 'function',
  inputs: [
    { name: 'targetChains', type: 'uint16[]' },
    { name: 'target', type: 'address' },
    { name: 'callData', type: 'bytes' },
    { name: 'gasLimit', type: 'uint256' },
  ],
  stateMutability: 'payable',
}] as const;

/** Minimal ABI fragment for WormToolDeployer.upgradeAcrossChains. */
const UPGRADE_ABI = [{
  name: 'upgradeAcrossChains',
  type: 'function',
  inputs: [
    { name: 'targetChains', type: 'uint16[]' },
    { name: 'proxy', type: 'address' },
    { name: 'newImpl', type: 'address' },
    { name: 'upgradeOnCurrentChain', type: 'bool' },
  ],
  stateMutability: 'payable',
}] as const;

export interface ChainDeployResult {
  chain: string;
  chainId: bigint;
  receipt: TransactionReceipt;
}

export interface DeployAcrossChainsParams {
  /** chains[0] is the source (where the tx is sent). Remaining are cross-chain targets. */
  chains: WormToolChain[];
  bytecode: `0x${string}`;
  constructorArgs?: `0x${string}`;
  salt: `0x${string}`;
  wormToolDeployerAddress: string;
  /**
   * ETH value to send for Wormhole relayer fees (required when chains.length > 1).
   * Omit or pass 0n for local-only deployments (chains.length === 1).
   */
  value?: bigint;
}

/**
 * Deploy bytecode via WormToolDeployer.
 *
 * Sends one transaction from chains[0]. The contract deploys locally on chains[0]
 * (deployOnCurrentChain=true) and sends Wormhole messages to any additional chains.
 * If chains has only one entry, no relayer fees are needed.
 */
export async function deployAcrossChains(
  params: DeployAcrossChainsParams,
): Promise<ChainDeployResult[]> {
  const { chains, bytecode, constructorArgs = '0x', salt, wormToolDeployerAddress, value = 0n } = params;
  const [sourceChain, ...rest] = chains;
  if (!sourceChain) throw new WormToolError('deployAcrossChains: at least one chain required');

  const targetChainIds = rest.map(c => Number(c.chainId));

  const data = encodeFunctionData({
    abi: DEPLOY_ABI,
    functionName: 'deployAcrossChains',
    args: [targetChainIds, bytecode, salt, constructorArgs, true],
  });

  const receipt = await sourceChain.sendTransaction(wormToolDeployerAddress, data, value);
  return [{ chain: sourceChain.chainName, chainId: sourceChain.chainId, receipt }];
}

export interface CallAcrossChainsParams {
  chains: WormToolChain[];
  target: `0x${string}`;
  calldata: `0x${string}`;
  wormToolDeployerAddress: string;
  value?: bigint;
}

/** Call a function on a deployed contract across multiple chains. */
export async function callAcrossChains(
  params: CallAcrossChainsParams,
): Promise<ChainDeployResult[]> {
  const { chains, target, calldata, wormToolDeployerAddress, value = 0n } = params;
  const [sourceChain, ...rest] = chains;
  if (!sourceChain) throw new WormToolError('callAcrossChains: at least one chain required');

  const targetChainIds = rest.map(c => Number(c.chainId));

  const data = encodeFunctionData({
    abi: CALL_ABI,
    functionName: 'callAcrossChains',
    args: [targetChainIds, target, calldata, 3_000_000n],
  });

  const receipt = await sourceChain.sendTransaction(wormToolDeployerAddress, data, value);
  return [{ chain: sourceChain.chainName, chainId: sourceChain.chainId, receipt }];
}

export interface UpgradeAcrossChainsParams {
  chains: WormToolChain[];
  proxy: `0x${string}`;
  newImpl: `0x${string}`;
  wormToolDeployerAddress: string;
  value?: bigint;
}

/** Upgrade a proxy contract to a new implementation. */
export async function upgradeAcrossChains(
  params: UpgradeAcrossChainsParams,
): Promise<ChainDeployResult[]> {
  const { chains, proxy, newImpl, wormToolDeployerAddress, value = 0n } = params;
  const [sourceChain, ...rest] = chains;
  if (!sourceChain) throw new WormToolError('upgradeAcrossChains: at least one chain required');

  const targetChainIds = rest.map(c => Number(c.chainId));

  const data = encodeFunctionData({
    abi: UPGRADE_ABI,
    functionName: 'upgradeAcrossChains',
    args: [targetChainIds, proxy, newImpl, true],
  });

  const receipt = await sourceChain.sendTransaction(wormToolDeployerAddress, data, value);
  return [{ chain: sourceChain.chainName, chainId: sourceChain.chainId, receipt }];
}
