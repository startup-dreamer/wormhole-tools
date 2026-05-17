import type { Command } from 'commander';
import { printJson, printError } from '../output.js';

export function registerSuiCommand(program: Command): void {
  const sui = program
    .command('sui')
    .description('Interact with Wormhole contracts on Sui');

  sui
    .command('info')
    .description('Print Sui Wormhole chain info')
    .action(() => {
      printJson({ chain: 'sui', wormholeChainId: 21, status: 'read-only support (full SDK coming soon)' });
    });

  sui
    .command('balance <address>')
    .description('Get SUI balance of an address (not yet implemented)')
    .action(async (_address: string) => {
      printError('Sui balance not yet implemented — contributions welcome');
      process.exit(1);
    });
}
