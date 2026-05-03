import type { Command } from 'commander';
import { loadConfig } from '../config.js';
import { createEvmChain } from '../providers/evm.js';
import { printJson, printError } from '../output.js';

export function registerEvmCommand(program: Command): void {
  const evm = program
    .command('evm')
    .description('Interact with Wormhole contracts on EVM chains');

  evm
    .command('balance <address>')
    .description('Get the native balance of an address')
    .requiredOption('--chain <name>', 'EVM chain name')
    .action(async (address: string, opts: { chain: string }) => {
      try {
        const config = loadConfig();
        const chain = createEvmChain(opts.chain, config);
        const balance = await chain.getBalance(address);
        printJson({ address, chain: opts.chain, balanceWei: balance.toString() });
      } catch (err) { printError('evm balance failed', err); process.exit(1); }
    });

  evm
    .command('code <address>')
    .description('Get the bytecode deployed at an address')
    .requiredOption('--chain <name>', 'EVM chain name')
    .action(async (address: string, opts: { chain: string }) => {
      try {
        const config = loadConfig();
        const chain = createEvmChain(opts.chain, config);
        const code = await chain.getCode(address);
        printJson({ address, chain: opts.chain, bytecode: code, deployed: code !== '0x' && code.length > 2 });
      } catch (err) { printError('evm code failed', err); process.exit(1); }
    });

  evm
    .command('call <to> <data>')
    .description('Make a read-only eth_call to a contract')
    .requiredOption('--chain <name>', 'EVM chain name')
    .action(async (to: string, data: string, opts: { chain: string }) => {
      try {
        const config = loadConfig();
        const chain = createEvmChain(opts.chain, config);
        const result = await chain.call(to, data as `0x${string}`);
        printJson({ to, chain: opts.chain, result });
      } catch (err) { printError('evm call failed', err); process.exit(1); }
    });
}
