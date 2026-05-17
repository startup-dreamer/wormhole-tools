import type { Command } from 'commander';
import { printJson, printError } from '../output.js';

export function registerAptosCommand(program: Command): void {
  const aptos = program
    .command('aptos')
    .description('Interact with Wormhole contracts on Aptos');

  aptos
    .command('info')
    .description('Print Aptos Wormhole chain info')
    .action(() => {
      printJson({ chain: 'aptos', wormholeChainId: 22, status: 'read-only support (full SDK coming soon)' });
    });

  aptos
    .command('balance <address>')
    .description('Get APT balance of an account (not yet implemented)')
    .option('--rpc <url>', 'Aptos node URL', 'https://fullnode.mainnet.aptoslabs.com')
    .action(async (_address: string, _opts: { rpc: string }) => {
      printError('Aptos balance not yet implemented — contributions welcome');
      process.exit(1);
    });
}
