import type { Command } from 'commander';
import { getChainInfo, WORMHOLESCAN_MAINNET, WORMHOLESCAN_TESTNET } from '@wormcraft/sdk';
import { printJson, printError } from '../output.js';

export function registerLatencyCommand(program: Command): void {
  program
    .command('latency <chain>')
    .description('Measure guardian signing latency for a source chain')
    .option('--network <network>', 'mainnet or testnet', 'mainnet')
    .option('--count <n>', 'Number of recent VAAs to sample', '20')
    .action(async (chain: string, opts: { network: string; count: string }) => {
      const count = parseInt(opts.count, 10);
      if (Number.isNaN(count) || count <= 0) {
        printError('--count must be a positive integer');
        process.exit(1);
      }

      try {
        const info = getChainInfo(chain);
        const network = opts.network === 'testnet' ? 'testnet' : 'mainnet';
        const base = network === 'testnet' ? WORMHOLESCAN_TESTNET : WORMHOLESCAN_MAINNET;

        const url = `${base}/api/v1/vaas/${info.wormholeChainId}?pageSize=${count}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Wormholescan returned ${res.status}`);

        const data = await res.json() as { data?: Array<{ indexedAt?: string; timestamp?: string }> };
        const vaas = data.data ?? [];

        const latencies: number[] = [];
        for (const vaa of vaas) {
          if (vaa.indexedAt && vaa.timestamp) {
            const indexed = new Date(vaa.indexedAt).getTime();
            const emitted = new Date(vaa.timestamp).getTime();
            if (!Number.isNaN(indexed) && !Number.isNaN(emitted) && indexed > emitted) {
              latencies.push((indexed - emitted) / 1000);
            }
          }
        }

        latencies.sort((a, b) => a - b);
        const p = (pct: number): number | null => {
          if (latencies.length === 0) return null;
          const idx = Math.floor(latencies.length * pct);
          return latencies[Math.min(idx, latencies.length - 1)] ?? null;
        };

        printJson({
          chain,
          wormholeChainId: info.wormholeChainId,
          sampleCount: latencies.length,
          p50Secs: p(0.5),
          p95Secs: p(0.95),
          minSecs: latencies[0] ?? null,
          maxSecs: latencies[latencies.length - 1] ?? null,
        });
      } catch (err) {
        printError('latency fetch failed', err);
        process.exit(1);
      }
    });
}
