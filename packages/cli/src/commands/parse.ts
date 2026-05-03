import type { Command } from 'commander';
import { parseVaa } from '@worm-tool/sdk';
import { printJson, printError } from '../output.js';

export function registerParseCommand(program: Command): void {
  program
    .command('parse <vaa>')
    .description('Parse a VAA from hex or base64 and print its fields as JSON')
    .action((vaa: string) => {
      try {
        printJson(parseVaa(vaa));
      } catch (err) {
        printError('Failed to parse VAA', err);
        process.exit(1);
      }
    });
}
