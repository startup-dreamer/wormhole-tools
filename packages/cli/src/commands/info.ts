import type { Command } from 'commander';
import { getChainInfo, getChainById, getChainByName, getChainByEvmId, CHAIN_REGISTRY } from '@worm-tool/sdk';
import { printJson, printError } from '../output.js';

export function registerInfoCommand(program: Command): void {
  const info = program
    .command('info')
    .description('Query Wormhole chain and contract metadata');

  info
    .command('chain-id <chain>')
    .description('Print the Wormhole chain ID for a named chain or numeric ID')
    .action((chain: string) => {
      try {
        const asNum = parseInt(chain, 10);
        let entry;
        if (Number.isNaN(asNum)) {
          entry = getChainByName(chain);
        } else {
          entry = getChainById(asNum) ?? getChainByEvmId(asNum);
        }
        if (!entry) { printError(`Unknown chain: ${chain}`); process.exit(1); }
        printJson({ chain: entry.name, wormholeChainId: entry.wormholeChainId });
      } catch (err) { printError('chain-id failed', err); process.exit(1); }
    });

  info
    .command('contract-address <chain>')
    .description('Print known contract addresses for a chain')
    .option('--network <network>', 'mainnet or testnet', 'mainnet')
    .action((chain: string) => {
      try {
        const asNum = parseInt(chain, 10);
        const entry = Number.isNaN(asNum)
          ? getChainByName(chain)
          : (getChainById(asNum) ?? getChainByEvmId(asNum));
        if (!entry) { printError(`Unknown chain: ${chain}`); process.exit(1); }
        printJson({
          chain: entry.name,
          wormholeChainId: entry.wormholeChainId,
          wormholeCore: entry.wormholeCore ?? null,
          wormToolDeployer: entry.wormToolDeployer ?? null,
        });
      } catch (err) { printError('contract-address failed', err); process.exit(1); }
    });

  info
    .command('chains')
    .description('List all supported chains')
    .option('--testnet', 'Include testnet chains alongside mainnet chains')
    .option('--testnet-only', 'Show only testnet chains')
    .action((opts: { testnet?: boolean; testnetOnly?: boolean }) => {
      let chains = CHAIN_REGISTRY;
      if (opts.testnetOnly) {
        chains = CHAIN_REGISTRY.filter(c => c.isTestnet === true);
      } else if (!opts.testnet) {
        chains = CHAIN_REGISTRY.filter(c => !c.isTestnet);
      }
      printJson(chains.map(c => ({
        name: c.name,
        wormholeChainId: c.wormholeChainId,
        evmChainId: c.evmChainId ?? null,
        isTestnet: c.isTestnet ?? false,
      })));
    });

  info
    .command('summary <chain>')
    .description('Print a full summary for a chain (name, IDs, finality, contracts)')
    .action((chain: string) => {
      try {
        // Support lookup by numeric ID or name
        const asNum = parseInt(chain, 10);
        const summary = Number.isNaN(asNum) ? getChainInfo(chain) : getChainInfo(asNum);
        printJson(summary);
      } catch (err) { printError('summary failed', err); process.exit(1); }
    });
}
