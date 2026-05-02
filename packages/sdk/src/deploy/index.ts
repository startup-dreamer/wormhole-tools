import type { WormToolChain, TransactionReceipt } from '../chain.js';
import { encodeDeployMessage, encodeCallMessage, encodeUpgradeMessage } from './abi.js';

export { extractBytecode } from './artifact.js';
export { computeCreate2Address } from './create2.js';
export { getChainById, getChainByName, CHAIN_REGISTRY } from './registry.js';
export type { ChainEntry } from './registry.js';
export { checkContractDeployed } from './status.js';
export * from './abi.js';

export interface ChainDeployResult {
  chain: string;
  chainId: bigint;
  receipt: TransactionReceipt;
}

export interface DeployAcrossChainsParams {
  chains: WormToolChain[];
  bytecode: `0x${string}`;
  constructorArgs?: `0x${string}`;
  salt: `0x${string}`;
  wormToolDeployerAddress: string;
}

/** Deploy bytecode to multiple chains in parallel via WormToolDeployer. */
export async function deployAcrossChains(
  params: DeployAcrossChainsParams,
): Promise<ChainDeployResult[]> {
  const { chains, bytecode, constructorArgs = '0x', salt, wormToolDeployerAddress } = params;
  const targetChains = chains.map(c => Number(c.chainId));
  const data = encodeDeployMessage({ bytecode, constructorArgs, salt, targetChains });

  return Promise.all(
    chains.map(async (chain): Promise<ChainDeployResult> => {
      const receipt = await chain.sendTransaction(wormToolDeployerAddress, data);
      return { chain: chain.chainName, chainId: chain.chainId, receipt };
    }),
  );
}

export interface CallAcrossChainsParams {
  chains: WormToolChain[];
  target: `0x${string}`;
  calldata: `0x${string}`;
  wormToolDeployerAddress: string;
}

/** Call a function on a deployed contract across multiple chains in parallel. */
export async function callAcrossChains(
  params: CallAcrossChainsParams,
): Promise<ChainDeployResult[]> {
  const { chains, target, calldata, wormToolDeployerAddress } = params;
  const targetChains = chains.map(c => Number(c.chainId));
  const data = encodeCallMessage({ target, calldata, targetChains });

  return Promise.all(
    chains.map(async (chain): Promise<ChainDeployResult> => {
      const receipt = await chain.sendTransaction(wormToolDeployerAddress, data);
      return { chain: chain.chainName, chainId: chain.chainId, receipt };
    }),
  );
}

export interface UpgradeAcrossChainsParams {
  chains: WormToolChain[];
  proxy: `0x${string}`;
  newImpl: `0x${string}`;
  wormToolDeployerAddress: string;
}

/** Upgrade a proxy contract to a new implementation across multiple chains in parallel. */
export async function upgradeAcrossChains(
  params: UpgradeAcrossChainsParams,
): Promise<ChainDeployResult[]> {
  const { chains, proxy, newImpl, wormToolDeployerAddress } = params;
  const targetChains = chains.map(c => Number(c.chainId));
  const data = encodeUpgradeMessage({ proxy, newImpl, targetChains });

  return Promise.all(
    chains.map(async (chain): Promise<ChainDeployResult> => {
      const receipt = await chain.sendTransaction(wormToolDeployerAddress, data);
      return { chain: chain.chainName, chainId: chain.chainId, receipt };
    }),
  );
}
