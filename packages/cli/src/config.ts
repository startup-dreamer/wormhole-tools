import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import { homedir } from 'os';

export interface WormToolConfig {
  privateKey: `0x${string}` | undefined;
  rpcUrls: Record<string, string>;
  network: 'mainnet' | 'testnet';
}

/** Load config from ~/.worm-tool/.env then process.env (process.env wins). */
export function loadConfig(): WormToolConfig {
  loadDotenv({ path: resolve(homedir(), '.worm-tool', '.env'), override: false });

  const pk = process.env['WORM_TOOL_PRIVATE_KEY'];

  const rpcUrls: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    const match = /^WORM_TOOL_RPC_(.+)$/.exec(key);
    if (match?.[1] && value) rpcUrls[match[1].toLowerCase()] = value;
  }

  return {
    privateKey: pk ? (pk as `0x${string}`) : undefined,
    rpcUrls,
    network: (process.env['WORM_TOOL_NETWORK'] === 'testnet' ? 'testnet' : 'mainnet'),
  };
}
