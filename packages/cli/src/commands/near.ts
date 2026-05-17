import type { Command } from 'commander';
import { printJson, printError } from '../output.js';

export function registerNearCommand(program: Command): void {
  const near = program
    .command('near')
    .description('Interact with Wormhole contracts on NEAR');

  near
    .command('info')
    .description('Print NEAR Wormhole chain info')
    .action(() => {
      printJson({ chain: 'near', wormholeChainId: 15, status: 'read-only support (full SDK coming soon)' });
    });

  near
    .command('balance <accountId>')
    .description('Get NEAR balance of an account (not yet implemented)')
    .action(async (_accountId: string) => {
      printError('NEAR balance not yet implemented — contributions welcome');
      process.exit(1);
    });
}
