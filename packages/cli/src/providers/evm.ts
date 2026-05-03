import { EvmChain, getChainByName, ChainNotSupportedError } from '@worm-tool/sdk';
import type { WormToolConfig } from '../config.js';

/** Create an EvmChain adapter for a named chain using the loaded config. */
export function createEvmChain(chainName: string, config: WormToolConfig): EvmChain {
  const entry = getChainByName(chainName);
  if (!entry) throw new ChainNotSupportedError(chainName);
  if (entry.evmChainId === undefined) {
    throw new ChainNotSupportedError(`${chainName} is not an EVM chain`);
  }

  const rpcUrl = config.rpcUrls[chainName] ?? entry.defaultRpc;
  if (!rpcUrl) {
    throw new Error(`No RPC URL for ${chainName} — set WORM_TOOL_RPC_${chainName.toUpperCase()} in ~/.worm-tool/.env`);
  }

  return new EvmChain({
    rpcUrl,
    wormholeChainId: BigInt(entry.wormholeChainId),
    evmChainId: entry.evmChainId,
    ...(config.privateKey !== undefined && { privateKey: config.privateKey }),
  });
}
