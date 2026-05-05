import type { Command } from 'commander';
import { parseVaa } from '@worm-tool/sdk';
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

function isTxHash(input: string): boolean {
  return input.startsWith('0x') && input.length === 66 && /^[0-9a-fA-F]+$/.test(input.slice(2));
}

export function registerRedeemCommand(program: Command): void {
  program
    .command('redeem <input>')
    .description('Manually redeem a Wormhole VAA on the destination EVM chain (input: tx hash or raw VAA hex/base64)')
    .requiredOption('--chain <name>', 'Destination EVM chain name (e.g. ethereum)')
    .option('--contract <address>', 'Target contract address')
    .option('--selector <hex>', 'Function selector override (default: completeTransfer 0xc6878519)')
    .option('--network <network>', 'mainnet or testnet (used if input is a tx hash)', 'mainnet')
    .action(async (input: string, opts: { chain: string; contract?: string; selector?: string; network: string }) => {
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
          // Validate parses before sending
          parseVaa(input);
          vaaHex = input.startsWith('0x') ? input : '0x' + input;
        }

        const chain = createEvmChain(opts.chain, config);
        if (!opts.contract) throw new Error(`--contract is required for ${opts.chain}`);

        // Default selector: completeTransfer(bytes) = 0xc6878519
        const selectorRaw = opts.selector ?? '0xc6878519';
        const selector = selectorRaw.startsWith('0x') ? selectorRaw : '0x' + selectorRaw;
        const data = (selector + abiEncodeBytes(vaaHex).slice(2)) as `0x${string}`;
        const receipt = await chain.sendTransaction(opts.contract, data);
        printJson({ txHash: receipt.txHash, success: receipt.success, chain: opts.chain });
      } catch (err) {
        printError('redeem failed', err);
        process.exit(1);
      }
    });
}
