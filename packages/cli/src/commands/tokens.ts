import type { Command } from 'commander';
import { getTokenInfo, getTokenBalance } from '@worm-tool/sdk';
import { loadConfig } from '../config.js';
import { createEvmChain } from '../providers/evm.js';
import { printJson, printError } from '../output.js';

export function registerTokensCommand(program: Command): void {
  const tokens = program
    .command('tokens')
    .description('Query ERC-20 token information on EVM chains');

  tokens
    .command('info <tokenAddress>')
    .description('Fetch ERC-20 token metadata (name, symbol, decimals)')
    .requiredOption('--chain <name>', 'EVM chain name (e.g. ethereum)')
    .action(async (tokenAddress: string, opts: { chain: string }) => {
      try {
        const config = loadConfig();
        const chain = createEvmChain(opts.chain, config);
        const info = await getTokenInfo(chain, tokenAddress);
        printJson(info);
      } catch (err) { printError('tokens info failed', err); process.exit(1); }
    });

  tokens
    .command('balance <tokenAddress> <walletAddress>')
    .description('Fetch ERC-20 token balance for a wallet')
    .requiredOption('--chain <name>', 'EVM chain name')
    .action(async (tokenAddress: string, walletAddress: string, opts: { chain: string }) => {
      try {
        const config = loadConfig();
        const chain = createEvmChain(opts.chain, config);
        const balance = await getTokenBalance(chain, tokenAddress, walletAddress);
        printJson(balance);
      } catch (err) { printError('tokens balance failed', err); process.exit(1); }
    });
}
