export interface ChainEntry {
  wormholeChainId: number;
  name: string;
  /** EVM chain ID (undefined for non-EVM chains) */
  evmChainId?: number;
  /** Default public RPC URL */
  defaultRpc?: string;
  /** Wormhole core contract address on this chain */
  wormholeCore?: `0x${string}`;
  /** WormcraftDeployer contract address (set after deployment) */
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
  // Testnets — WormcraftDeployer deployed at the same address on all chains via CREATE2
  // (salt = keccak256("wormcraft-deployer-v1"), factory = deployer wallet 0x68A2610f...)
  {
    wormholeChainId: 10002, name: 'sepolia', evmChainId: 11155111, isTestnet: true,
    defaultRpc: 'https://ethereum-sepolia.publicnode.com',
    wormholeCore: '0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78',
    wormToolDeployer: '0x0aA4B5899bAF7326397b1041db9c854056126F57',
  },
  {
    wormholeChainId: 10003, name: 'arbitrum-sepolia', evmChainId: 421614, isTestnet: true,
    defaultRpc: 'https://sepolia-rollup.arbitrum.io/rpc',
    wormholeCore: '0x6b9C8671cdDC8dEab9c719bB87cBd3e782bA6a35',
    wormToolDeployer: '0x0aA4B5899bAF7326397b1041db9c854056126F57',
  },
  {
    wormholeChainId: 10004, name: 'base-sepolia', evmChainId: 84532, isTestnet: true,
    defaultRpc: 'https://sepolia.base.org',
    wormholeCore: '0x79A1027a6A159502049F10906D333EC57E95F083',
    wormToolDeployer: '0x0aA4B5899bAF7326397b1041db9c854056126F57',
  },
  { wormholeChainId: 4, name: 'bsc-testnet', evmChainId: 97, isTestnet: true },
];

export function getChainById(wormholeChainId: number): ChainEntry | undefined {
  return CHAIN_REGISTRY.find(c => c.wormholeChainId === wormholeChainId);
}

export function getChainByName(name: string): ChainEntry | undefined {
  return CHAIN_REGISTRY.find(c => c.name === name.toLowerCase());
}

/** Look up a chain entry by its EVM chain ID (e.g. 1 for ethereum, 11155111 for sepolia). */
export function getChainByEvmId(evmChainId: number): ChainEntry | undefined {
  return CHAIN_REGISTRY.find(c => c.evmChainId === evmChainId);
}
