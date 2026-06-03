import { encodeFunctionData } from 'viem';
import type { WormcraftChain, TransactionReceipt } from '../chain.js';
import { WormcraftError } from '../error.js';
import { encodeScheduleUpgradeMessage, encodeExecuteUpgradeMessage } from './abi.js';

export { extractBytecode } from './artifact.js';
export { computeCreate2Address, keccak256Hex, bytesToHex } from './create2.js';
export { getChainById, getChainByName, getChainByEvmId, CHAIN_REGISTRY } from './registry.js';
export type { ChainEntry } from './registry.js';
export { checkContractDeployed } from './status.js';
export * from './abi.js';
export * from './manifest.js';
export * from './address-book.js';
export * from './engine.js';
export * from './verify.js';
export * from './storage-diff.js';

/** Minimal ABI fragment for WormcraftDeployer.deployAcrossChains. */
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

/** Minimal ABI fragment for WormcraftDeployer.callAcrossChains. */
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

/** Minimal ABI fragment for WormcraftDeployer.upgradeAcrossChains. */
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
  chains: WormcraftChain[];
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
 * Deploy bytecode via WormcraftDeployer.
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
  if (!sourceChain) throw new WormcraftError('deployAcrossChains: at least one chain required');

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
  chains: WormcraftChain[];
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
  if (!sourceChain) throw new WormcraftError('callAcrossChains: at least one chain required');

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
  chains: WormcraftChain[];
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
  if (!sourceChain) throw new WormcraftError('upgradeAcrossChains: at least one chain required');

  const targetChainIds = rest.map(c => Number(c.chainId));

  const data = encodeFunctionData({
    abi: UPGRADE_ABI,
    functionName: 'upgradeAcrossChains',
    args: [targetChainIds, proxy, newImpl, true],
  });

  const receipt = await sourceChain.sendTransaction(wormToolDeployerAddress, data, value);
  return [{ chain: sourceChain.chainName, chainId: sourceChain.chainId, receipt }];
}

/** Minimal ABI fragment for WormcraftDeployer.executeViaModule. */
const EXECUTE_VIA_MODULE_ABI = [{
  name: 'executeViaModule',
  type: 'function',
  inputs: [
    { name: 'targetChains',  type: 'uint16[]' },
    { name: 'moduleAddress', type: 'address'  },
    { name: 'safe',          type: 'address'  },
    { name: 'target',        type: 'address'  },
    { name: 'callData',      type: 'bytes'    },
  ],
  stateMutability: 'payable',
}] as const;

export interface ExecuteViaModuleParams {
  chains: WormcraftChain[];
  /** WormcraftModule address — same on all chains via CREATE2. */
  moduleAddress: `0x${string}`;
  /** Gnosis Safe address on each target chain. */
  safe: `0x${string}`;
  /** Contract to call inside the Safe transaction (e.g. the proxy). */
  target: `0x${string}`;
  /** ABI-encoded function call to execute (e.g. upgradeToAndCall calldata). */
  calldata: `0x${string}`;
  wormToolDeployerAddress: string;
  value?: bigint;
}

/**
 * Execute a call on a target contract via WormcraftModule + Safe.execTransactionFromModule.
 *
 * Requires one-time setup on each target chain:
 *   1. Safe.enableModule(wormcraftModuleAddress)
 *   2. WormcraftModule.authorize(sourceChainId, callerAddressBytes32)
 *      — called as a Safe transaction so Safe owners govern the whitelist.
 *
 * After setup, this is the only function needed for all cross-chain upgrades.
 * The Safe handles all governance (thresholds, timelocks, veto).
 */
export async function executeViaModule(
  params: ExecuteViaModuleParams,
): Promise<ChainDeployResult[]> {
  const { chains, moduleAddress, safe, target, calldata, wormToolDeployerAddress, value = 0n } = params;
  const [sourceChain, ...rest] = chains;
  if (!sourceChain) throw new WormcraftError('executeViaModule: at least one chain required');

  const targetChainIds = rest.map(c => Number(c.chainId));

  const data = encodeFunctionData({
    abi: EXECUTE_VIA_MODULE_ABI,
    functionName: 'executeViaModule',
    args: [targetChainIds, moduleAddress, safe, target, calldata],
  });

  const receipt = await sourceChain.sendTransaction(wormToolDeployerAddress, data, value);
  return [{ chain: sourceChain.chainName, chainId: sourceChain.chainId, receipt }];
}

export interface ManagedUpgradeParams {
  chains: WormcraftChain[];
  /** WormcraftAdminModule address — same on all chains via deterministic CREATE2. */
  adminModule: `0x${string}`;
  proxy:   `0x${string}`;
  newImpl: `0x${string}`;
  /** Arbitrary bytes32 salt that identifies this upgrade operation. Used by TimelockController. */
  salt:    `0x${string}`;
  wormToolDeployerAddress: string;
  value?: bigint;
}

/**
 * Schedule (or directly execute, if no timelock is configured) a proxy upgrade
 * via WormcraftAdminModule. No inheritance required in the proxy contract.
 *
 * Routes through callAcrossChains — WormcraftDeployer itself is unchanged.
 * If the proxy is registered with a TimelockController, the upgrade is only
 * scheduled here; call executeUpgradeViaManagedAdmin after the delay.
 */
export async function scheduleUpgradeViaManagedAdmin(
  params: ManagedUpgradeParams,
): Promise<ChainDeployResult[]> {
  const { chains, adminModule, proxy, newImpl, salt, wormToolDeployerAddress, value = 0n } = params;
  const calldata = encodeScheduleUpgradeMessage({ proxy, newImpl, salt });
  return callAcrossChains({ chains, target: adminModule, calldata, wormToolDeployerAddress, value });
}

/**
 * Execute a previously scheduled timelock upgrade via WormcraftAdminModule.
 * Call this after the TimelockController's getMinDelay() has elapsed.
 */
export async function executeUpgradeViaManagedAdmin(
  params: ManagedUpgradeParams,
): Promise<ChainDeployResult[]> {
  const { chains, adminModule, proxy, newImpl, salt, wormToolDeployerAddress, value = 0n } = params;
  const calldata = encodeExecuteUpgradeMessage({ proxy, newImpl, salt });
  return callAcrossChains({ chains, target: adminModule, calldata, wormToolDeployerAddress, value });
}
