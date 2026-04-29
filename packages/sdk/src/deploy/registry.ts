export interface ChainEntry {
  wormholeChainId: number;
  name: string;
  /** EVM chain ID (undefined for non-EVM chains) */
  evmChainId?: number;
  /** Default public RPC URL */
  defaultRpc?: string;
  /** Wormhole core contract address on this chain */
  wormholeCore?: `0x${string}`;
  /** WormToolDeployer contract address (set after deployment) */
  wormToolDeployer?: `0x${string}`;
  isTestnet?: boolean;
}

export const CHAIN_REGISTRY: ChainEntry[] = [
  { wormholeChainId: 1,  name: 'solana',       defaultRpc: 'https://api.mainnet-beta.solana.com' },
  { wormholeChainId: 2,  name: 'ethereum',      evmChainId: 1,       wormholeCore: '0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B' },
  { wormholeChainId: 4,  name: 'bsc',           evmChainId: 56,      wormholeCore: '0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B' },
  { wormholeChainId: 5,  name: 'polygon',       evmChainId: 137,     wormholeCore: '0x7A4B5a56153eda34EB8D93Bc0a5e3A3C3e3e4Bd6' },
  { wormholeChainId: 6,  name: 'avalanche',     evmChainId: 43114 },
  { wormholeChainId: 10, name: 'fantom',        evmChainId: 250 },
  { wormholeChainId: 13, name: 'klaytn',        evmChainId: 8217 },
  { wormholeChainId: 14, name: 'celo',          evmChainId: 42220 },
  { wormholeChainId: 16, name: 'moonbeam',      evmChainId: 1284 },
  { wormholeChainId: 22, name: 'aptos' },
  { wormholeChainId: 23, name: 'arbitrum',      evmChainId: 42161 },
  { wormholeChainId: 24, name: 'optimism',      evmChainId: 10 },
  { wormholeChainId: 30, name: 'base',          evmChainId: 8453 },
  // Testnets
  { wormholeChainId: 10002, name: 'sepolia',    evmChainId: 11155111, isTestnet: true },
  { wormholeChainId: 4,     name: 'bsc-testnet',evmChainId: 97,       isTestnet: true },
];

export function getChainById(wormholeChainId: number): ChainEntry | undefined {
  return CHAIN_REGISTRY.find(c => c.wormholeChainId === wormholeChainId && !c.isTestnet);
}

export function getChainByName(name: string): ChainEntry | undefined {
  return CHAIN_REGISTRY.find(c => c.name === name.toLowerCase());
}
