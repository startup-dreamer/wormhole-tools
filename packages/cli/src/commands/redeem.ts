import type { Command } from 'commander';
import { parseVaa, getMessageStatus } from '@worm-tool/sdk';
import { loadConfig } from '../config.js';
import { createEvmChain } from '../providers/evm.js';
import { printJson, printError } from '../output.js';

function isTxHash(input: string): boolean {
  return input.startsWith('0x') && input.length === 66 && /^[0-9a-fA-F]+$/.test(input.slice(2));
}

export function registerRedeemCommand(program: Command): void {
  program
    .command('redeem <input>')
    .description('Manually redeem a Wormhole VAA on the destination EVM chain (input: tx hash or raw VAA hex/base64)')
    .requiredOption('--chain <name>', 'Destination EVM chain name (e.g. ethereum)')
    .option('--contract <address>', 'Target contract address (default: known core bridge)')
    .option('--network <network>', 'mainnet or testnet (used if input is a tx hash)', 'mainnet')
    .action(async (input: string, opts: { chain: string; contract?: string; network: string }) => {
      try {
        const config = loadConfig();
        const network = opts.network === 'testnet' ? 'testnet' : 'mainnet';

        let vaaHex: string;
        if (isTxHash(input)) {
          // Fetch VAA from wormholescan
          const base = network === 'testnet'
            ? 'https://api.testnet.wormholescan.io'
            : 'https://api.wormholescan.io';
          const res = await fetch(`${base}/api/v1/transactions/${input}`);
          if (!res.ok) throw new Error(`Failed to fetch VAA for tx ${input}: ${res.status}`);
          const data = await res.json() as { data?: { vaa?: { raw?: string } } };
          const raw = data.data?.vaa?.raw;
          if (!raw) throw new Error(`No VAA found for tx ${input} (not yet signed?)`);
          vaaHex = raw.startsWith('0x') ? raw : '0x' + raw;
        } else {
          // Treat as raw VAA
          const parsed = parseVaa(input);
          vaaHex = input.startsWith('0x') ? input : '0x' + input;
          void parsed; // validate it parses correctly
        }

        const chain = createEvmChain(opts.chain, config);
        const contract = opts.contract ?? (() => {
          throw new Error(`No default core bridge known for ${opts.chain} — provide --contract`);
        })();

        const submitSelector = '0x9981509f';
        const data = (submitSelector + vaaHex.slice(2)) as `0x${string}`;
        const receipt = await chain.sendTransaction(contract, data);
        printJson({ txHash: receipt.txHash, success: receipt.success, chain: opts.chain });
      } catch (err) {
        printError('redeem failed', err);
        process.exit(1);
      }
    });
}
