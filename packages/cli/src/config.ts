import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import { homedir } from 'os';
import type { WormholeNetwork } from '@wormcraft/sdk';

export interface WormcraftConfig {
  privateKey: `0x${string}` | undefined;
  rpcUrls: Record<string, string>;
  network: WormholeNetwork;
}

/** Load config from ~/.wormcraft/.env then process.env (process.env wins). */
export function loadConfig(): WormcraftConfig {
  loadDotenv({ path: resolve(homedir(), '.wormcraft', '.env'), override: false });

  const pk = process.env['WORMCRAFT_PRIVATE_KEY'];

  const rpcUrls: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    const match = /^WORMCRAFT_RPC_(.+)$/.exec(key);
    if (match?.[1] && value) rpcUrls[match[1].toLowerCase()] = value;
  }

  return {
    privateKey: pk ? (pk as `0x${string}`) : undefined,
    rpcUrls,
    network: (process.env['WORMCRAFT_NETWORK'] === 'testnet' ? 'testnet' : 'mainnet'),
  };
}
