import type { Command } from 'commander';
import { generateTestVaaHex } from '@worm-tool/sdk';
import { printJson, printError } from '../output.js';

export function registerGenerateCommand(program: Command): void {
  const gen = program
    .command('generate')
    .description('Generate VAAs for devnet and testnet use');

  gen
    .command('test-vaa')
    .description('Generate a synthetic (unsigned) test VAA')
    .requiredOption('--emitter-chain <id>', 'Wormhole emitter chain ID', parseInt)
    .requiredOption('--emitter-address <hex>', '32-byte emitter address (0x-prefixed hex)')
    .option('--sequence <n>', 'Message sequence number (default: 0)', (v: string) => BigInt(v))
    .requiredOption('--payload <hex>', 'Payload bytes (0x-prefixed hex)')
    .option('--timestamp <n>', 'Unix timestamp (default: now)', parseInt)
    .option('--nonce <n>', 'Nonce (default: 0)', parseInt)
    .option('--consistency-level <n>', 'Consistency level (default: 1)', parseInt)
    .action((opts: {
      emitterChain: number;
      emitterAddress: string;
      sequence?: bigint;
      payload: string;
      timestamp?: number;
      nonce?: number;
      consistencyLevel?: number;
    }) => {
      try {
        const hex = generateTestVaaHex({
          emitterChain: opts.emitterChain,
          emitterAddress: opts.emitterAddress as `0x${string}`,
          sequence: opts.sequence ?? 0n,
          payload: opts.payload as `0x${string}`,
          ...(opts.timestamp !== undefined && { timestamp: opts.timestamp }),
          ...(opts.nonce !== undefined && { nonce: opts.nonce }),
          ...(opts.consistencyLevel !== undefined && { consistencyLevel: opts.consistencyLevel }),
        });
        printJson({ vaa: hex });
      } catch (err) {
        printError('generate test-vaa failed', err);
        process.exit(1);
      }
    });
}
