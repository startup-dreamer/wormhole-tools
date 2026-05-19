import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Command } from 'commander';
import { printJson, printError } from '../output.js';

export interface DoctorCheck {
  check: string;
  passed: boolean;
  message: string;
}

export interface RunChecksOptions {
  root: string;
  skipManifest?: boolean;
  skipToolchain?: boolean;
}

export async function runChecks(opts: RunChecksOptions): Promise<DoctorCheck[]> {
  const { root, skipManifest, skipToolchain } = opts;
  const results: DoctorCheck[] = [];

  const pk = process.env['WORMCRAFT_PRIVATE_KEY'];
  const keyValid = typeof pk === 'string' && /^0x[0-9a-fA-F]{64}$/.test(pk);
  results.push({
    check: 'private-key',
    passed: keyValid,
    message: keyValid
      ? 'Private key configured'
      : pk === undefined
        ? 'WORMCRAFT_PRIVATE_KEY is not set'
        : 'WORMCRAFT_PRIVATE_KEY is set but has invalid format (expected 0x + 64 hex chars)',
  });

  if (!skipToolchain) {
    const { detectToolchain, ToolchainNotFoundError } = await import('@wormcraft/sdk');
    try {
      await detectToolchain(root);
      results.push({ check: 'toolchain', passed: true, message: 'Project toolchain detected (Foundry or Hardhat)' });
    } catch (err) {
      results.push({
        check: 'toolchain',
        passed: false,
        message: err instanceof ToolchainNotFoundError
          ? `No toolchain found in ${root} (add foundry.toml or hardhat.config.ts)`
          : `Toolchain detection failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  if (!skipManifest) {
    try {
      const { parseManifest, detectToolchain, listArtifacts, CHAIN_REGISTRY } = await import('@wormcraft/sdk');
      const yaml = await readFile(join(root, 'wormcraft.deploy.yaml'), 'utf8');
      const manifest = parseManifest(yaml);
      results.push({ check: 'manifest', passed: true, message: 'wormcraft.deploy.yaml found and valid' });

      try {
        const toolchain = await detectToolchain(root);
        const artifacts = await listArtifacts(toolchain);
        const artifactNames = new Set(artifacts.map(a => a.name));
        const allContractNames = new Set(manifest.deploy_targets.flatMap(t => t.contracts));
        const missing = [...allContractNames].filter(n => !artifactNames.has(n));
        if (missing.length === 0) {
          results.push({ check: 'artifacts', passed: true, message: `All manifest contracts found in artifacts (${[...allContractNames].join(', ')})` });
        } else {
          results.push({ check: 'artifacts', passed: false, message: `Missing artifacts: ${missing.join(', ')} — run forge build / npx hardhat compile` });
        }
      } catch (err) {
        results.push({ check: 'artifacts', passed: false, message: `Could not list artifacts: ${err instanceof Error ? err.message : String(err)}` });
      }

      const allChains = [...new Set(manifest.deploy_targets.flatMap(t => t.chains))];
      const unknownChains = allChains.filter(c => {
        const net = manifest.networks[c];
        const chainName = net?.chain ?? c;
        return !CHAIN_REGISTRY.find(entry => entry.name === chainName);
      });
      if (unknownChains.length === 0) {
        results.push({ check: 'chains', passed: true, message: `All chains recognized (${allChains.join(', ')})` });
      } else {
        results.push({ check: 'chains', passed: false, message: `Unknown chains: ${unknownChains.join(', ')} — check wormcraft.deploy.yaml networks section` });
      }

    } catch (err) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        results.push({ check: 'manifest', passed: false, message: 'wormcraft.deploy.yaml not found — run `wormcraft deploy init` to create one' });
      } else {
        results.push({ check: 'manifest', passed: false, message: `wormcraft.deploy.yaml invalid: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
  }

  return results;
}

/** Register the `doctor` command onto the given Commander program. */
export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check environment configuration before deploying')
    .option('--project <dir>', 'Project root (default: cwd)')
    .option('--json', 'Output as JSON array')
    .action(async (opts: { project?: string; json?: boolean }) => {
      try {
        const root = opts.project ?? process.cwd();
        const results = await runChecks({ root });

        if (opts.json) {
          printJson(results);
        } else {
          for (const r of results) {
            const icon = r.passed ? '✓' : '✗';
            process.stdout.write(`${icon} ${r.message}\n`);
          }
          const allPassed = results.every(r => r.passed);
          if (!allPassed) process.exit(1);
        }
      } catch (err) {
        printError('doctor failed', err);
        process.exit(1);
      }
    });
}
