import type { Command } from 'commander';
import { parseVaa, getChainByName } from '@worm-tool/sdk';
import { loadConfig } from '../config.js';
import { createEvmChain } from '../providers/evm.js';
import { printJson, printError } from '../output.js';

export function registerSubmitCommand(program: Command): void {
  program
    .command('submit <vaa>')
    .description('Submit a signed VAA to a Wormhole contract on an EVM chain')
    .requiredOption('--chain <name>', 'Target EVM chain name (e.g. ethereum)')
    .option('--contract <address>', 'Target contract address (overrides default core bridge)')
    .action(async (vaa: string, opts: { chain: string; contract?: string }) => {
      try {
        const config = loadConfig();
        const parsed = parseVaa(vaa);

        const chain = createEvmChain(opts.chain, config);

        const contract = opts.contract ?? (() => {
          const entry = getChainByName(opts.chain);
          if (!entry?.wormholeCore) throw new Error(`No known core bridge for ${opts.chain} — provide --contract`);
          return entry.wormholeCore;
        })();

        // submitVAA selector: 0x9981509f (parseAndVerifyVM is internal; use submitMessage or receiveMessage depending on contract)
        // The standard Wormhole core bridge uses submitContractUpgrade(bytes encodedVM)
        // For generic submission: encode the VAA as calldata to publishMessage target
        const rawHex = vaa.startsWith('0x') ? vaa : '0x' + vaa;
        const submitSelector = '0x9981509f'; // submitVAA on some implementations
        const data = (submitSelector + rawHex.slice(2)) as `0x${string}`;

        const receipt = await chain.sendTransaction(contract, data);
        printJson({ txHash: receipt.txHash, success: receipt.success, chain: opts.chain, sequence: parsed.sequence.toString() });
      } catch (err) {
        printError('submit failed', err);
        process.exit(1);
      }
    });
}
