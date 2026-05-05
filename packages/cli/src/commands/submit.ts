import type { Command } from 'commander';
import { parseVaa, getChainByName } from '@worm-tool/sdk';
import { loadConfig } from '../config.js';
import { createEvmChain } from '../providers/evm.js';
import { printJson, printError } from '../output.js';

/** ABI-encode a single `bytes` argument: offset (32) + length (32) + data (padded). */
function abiEncodeBytes(hex: string): `0x${string}` {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  const byteLen = raw.length / 2;
  const paddedLen = Math.ceil(byteLen / 32) * 32;
  const offset = '0000000000000000000000000000000000000000000000000000000000000020';
  const len = byteLen.toString(16).padStart(64, '0');
  return `0x${offset}${len}${raw.padEnd(paddedLen * 2, '0')}` as `0x${string}`;
}

export function registerSubmitCommand(program: Command): void {
  program
    .command('submit <vaa>')
    .description('Submit a signed VAA to a Wormhole contract on an EVM chain')
    .requiredOption('--chain <name>', 'Target EVM chain name (e.g. ethereum)')
    .requiredOption('--selector <hex>', '4-byte function selector, e.g. 0x5cb8cae2 (submitContractUpgrade), 0xc6878519 (completeTransfer)')
    .option('--contract <address>', 'Target contract address (overrides default core bridge)')
    .action(async (vaa: string, opts: { chain: string; selector: string; contract?: string }) => {
      try {
        const config = loadConfig();
        const parsed = parseVaa(vaa);

        const chain = createEvmChain(opts.chain, config);

        const contract = opts.contract ?? (() => {
          const entry = getChainByName(opts.chain);
          if (!entry?.wormholeCore) throw new Error(`No known core bridge for ${opts.chain} — provide --contract`);
          return entry.wormholeCore;
        })();

        const selector = opts.selector.startsWith('0x') ? opts.selector : '0x' + opts.selector;
        const rawHex = vaa.startsWith('0x') ? vaa : '0x' + vaa;
        const data = (selector + abiEncodeBytes(rawHex).slice(2)) as `0x${string}`;

        const receipt = await chain.sendTransaction(contract, data);
        printJson({ txHash: receipt.txHash, success: receipt.success, chain: opts.chain, sequence: parsed.sequence.toString() });
      } catch (err) {
        printError('submit failed', err);
        process.exit(1);
      }
    });
}
