import type { Command } from 'commander';
import { getMessageStatus, MessageStatus } from '@worm-tool/sdk';
import { printJson, printError } from '../output.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status <txHash>')
    .description('Track a Wormhole message by its source transaction hash')
    .option('--network <network>', 'mainnet or testnet', 'mainnet')
    .action(async (txHash: string, opts: { network: string }) => {
      if (!txHash.startsWith('0x') || txHash.length !== 66) {
        printError('txHash must be 0x-prefixed and 66 characters (32 bytes)');
        process.exit(1);
      }
      const network = opts.network === 'testnet' ? 'testnet' : 'mainnet';
      try {
        // Derive emitter info from wormholescan tx endpoint
        const base = network === 'testnet'
          ? 'https://api.testnet.wormholescan.io'
          : 'https://api.wormholescan.io';
        const res = await fetch(`${base}/api/v1/transactions/${txHash}`);
        if (!res.ok) {
          if (res.status === 404) {
            printJson({ txHash, status: MessageStatus.Pending, message: 'Transaction not yet indexed' });
            return;
          }
          throw new Error(`Wormholescan returned ${res.status}`);
        }
        const data = await res.json() as Record<string, unknown>;
        printJson(data);
      } catch (err) {
        printError('status lookup failed', err);
        process.exit(1);
      }
    });
}
