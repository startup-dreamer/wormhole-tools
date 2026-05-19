import type { Command } from 'commander';
import { initiateTransfer } from '@wormcraft/sdk';
import { loadConfig } from '../config.js';
import { createEvmChain } from '../providers/evm.js';
import { printJson, printError } from '../output.js';

export function registerTransferCommand(program: Command): void {
  program
    .command('transfer')
    .description('Initiate a Wormhole Token Bridge transfer')
    .requiredOption('--token <address>', 'ERC-20 token address (0x-prefixed)')
    .requiredOption('--amount <n>', 'Amount in token base units')
    .requiredOption('--dst-chain <id>', 'Destination Wormhole chain ID', parseInt)
    .requiredOption('--recipient <hex>', '32-byte recipient address on destination chain (0x-prefixed hex)')
    .requiredOption('--token-bridge <address>', 'Token Bridge contract address')
    .option('--chain <name>', 'Source EVM chain name', 'ethereum')
    .option('--relayer-fee <n>', 'Relayer fee in token base units (default 0)', '0')
    .option('--nonce <n>', 'Transfer nonce (default 0)', '0')
    .action(async (opts: {
      token: string;
      amount: string;
      dstChain: number;
      recipient: string;
      tokenBridge: string;
      chain: string;
      relayerFee: string;
      nonce: string;
    }) => {
      try {
        const config = loadConfig();
        const chain = createEvmChain(opts.chain, config);

        const result = await initiateTransfer({
          sourceChain: chain,
          tokenBridgeAddress: opts.tokenBridge,
          tokenAddress: opts.token,
          amount: BigInt(opts.amount),
          recipientChain: opts.dstChain,
          recipientAddress: opts.recipient as `0x${string}`,
          relayerFee: BigInt(opts.relayerFee),
          nonce: parseInt(opts.nonce, 10),
        });

        printJson({ txHash: result.receipt.txHash, success: result.receipt.success });
      } catch (err) {
        printError('transfer failed', err);
        process.exit(1);
      }
    });
}
