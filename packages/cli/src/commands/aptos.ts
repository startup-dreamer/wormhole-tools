import type { Command } from 'commander';
import { printJson } from '../output.js';

export function registerAptosCommand(program: Command): void {
  const aptos = program
    .command('aptos')
    .description('Interact with Wormhole contracts on Aptos');

  aptos
    .command('info')
    .description('Print Aptos Wormhole chain info')
    .action(() => {
      printJson({ chain: 'aptos', wormholeChainId: 22 });
    });
}
