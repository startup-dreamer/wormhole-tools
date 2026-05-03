import type { Command } from 'commander';
import { SolanaChain } from '@worm-tool/sdk';
import { printJson, printError } from '../output.js';

export function registerSolanaCommand(program: Command): void {
  const solana = program
    .command('solana')
    .description('Interact with Wormhole contracts on Solana');

  solana
    .command('balance <address>')
    .description('Get the SOL balance of an account (in lamports)')
    .option('--rpc <url>', 'Solana RPC URL', 'https://api.mainnet-beta.solana.com')
    .action(async (address: string, opts: { rpc: string }) => {
      try {
        const chain = new SolanaChain({ rpcUrl: opts.rpc });
        const balance = await chain.getBalance(address);
        printJson({ address, balanceLamports: balance.toString(), balanceSol: (Number(balance) / 1e9).toFixed(9) });
      } catch (err) { printError('solana balance failed', err); process.exit(1); }
    });
}
