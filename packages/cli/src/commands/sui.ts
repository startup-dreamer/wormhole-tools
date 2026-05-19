import type { Command } from 'commander';
import { printJson } from '../output.js';

export function registerSuiCommand(program: Command): void {
  const sui = program
    .command('sui')
    .description('Interact with Wormhole contracts on Sui');

  sui
    .command('info')
    .description('Print Sui Wormhole chain info')
    .action(() => {
      printJson({ chain: 'sui', wormholeChainId: 21 });
    });
}
