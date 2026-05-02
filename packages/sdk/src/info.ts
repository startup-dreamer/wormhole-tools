import { getChainById, getChainByName } from './deploy/registry.js';
import { ChainNotSupportedError } from './error.js';

export interface ChainInfoSummary {
  name: string;
  wormholeChainId: number;
  evmChainId: number | undefined;
  rpcUrl: string | undefined;
  wormholeCore: string | undefined;
  finality: string;
  isTestnet: boolean;
}

const FINALITY_MAP: Record<number, string> = {
  1:  'confirmed (~32 slots, ~13s)',
  2:  'finalized (~15 min)',
  4:  'finalized (~15 min)',
  5:  'finalized (~2 min)',
  6:  'finalized (~20s)',
  10: 'finalized (~1s)',
  13: 'finalized (~1s)',
  14: 'finalized (~12s)',
  16: 'finalized (~24s)',
  22: 'finalized (~1s)',
  23: 'safe (~2 min)',
  24: 'safe (~2 min)',
  30: 'safe (~2 min)',
};

/** Look up chain metadata by name or wormhole chain ID. */
export function getChainInfo(nameOrId: string | number): ChainInfoSummary {
  const entry =
    typeof nameOrId === 'number'
      ? getChainById(nameOrId)
      : getChainByName(nameOrId);

  if (!entry) throw new ChainNotSupportedError(String(nameOrId));

  return {
    name: entry.name,
    wormholeChainId: entry.wormholeChainId,
    evmChainId: entry.evmChainId,
    rpcUrl: entry.defaultRpc,
    wormholeCore: entry.wormholeCore,
    finality: FINALITY_MAP[entry.wormholeChainId] ?? 'unknown',
    isTestnet: entry.isTestnet ?? false,
  };
}
