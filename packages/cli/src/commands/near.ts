import type { Command } from 'commander';
import { printJson } from '../output.js';

export function registerNearCommand(program: Command): void {
  const near = program
    .command('near')
    .description('Interact with Wormhole contracts on NEAR');

  near
    .command('info')
    .description('Print NEAR Wormhole chain info')
    .action(() => {
      printJson({ chain: 'near', wormholeChainId: 15 });
    });
}
