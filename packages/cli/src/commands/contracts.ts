import type { Command } from 'commander';
import { detectToolchain, listArtifacts, ToolchainNotFoundError } from '@worm-tool/sdk';
import type { ContractMeta } from '@worm-tool/sdk';
import { printJson, printError, formatTable } from '../output.js';

function resolveRoot(opts: { project?: string }): string {
  return opts.project ?? process.cwd();
}

async function loadContracts(root: string): Promise<ContractMeta[]> {
  const info = await detectToolchain(root);
  return listArtifacts(info);
}

interface AbiEntry {
  type: string;
  name?: string;
}

function abiNames(abi: readonly unknown[]): Set<string> {
  const names = new Set<string>();
  for (const entry of abi) {
    const e = entry as AbiEntry;
    if (e.name !== undefined) names.add(e.name);
  }
  return names;
}

interface CheckResult {
  name: string;
  proxyPattern: 'UUPS' | 'Transparent' | 'Beacon' | 'none';
  hasInitializer: boolean;
  isOwnable: boolean;
  hasAuthorizeUpgrade: boolean;
  warnings: string[];
}

/** Exported for tests. Detects proxy upgrade pattern from ABI function names. */
export function detectProxyPattern(
  names: Set<string>,
): 'UUPS' | 'Transparent' | 'Beacon' | 'none' {
  if (names.has('upgradeTo') || names.has('upgradeToAndCall')) return 'UUPS';
  if (names.has('admin') && names.has('implementation')) return 'Transparent';
  if (names.has('beacon')) return 'Beacon';
  return 'none';
}

function analyzeContract(contract: ContractMeta): CheckResult {
  const names = abiNames(contract.abi);
  const proxyPattern = detectProxyPattern(names);
  const hasInitializer = names.has('initialize') || [...names].some((n) => n.includes('__init'));
  const isOwnable = names.has('owner') && names.has('transferOwnership');
  const hasAuthorizeUpgrade = names.has('_authorizeUpgrade');

  const warnings: string[] = [];
  if (proxyPattern === 'UUPS' && !hasAuthorizeUpgrade) {
    warnings.push('UUPS proxy missing _authorizeUpgrade');
  }
  if (proxyPattern === 'Beacon' && !names.has('implementation')) {
    warnings.push('Beacon proxy missing implementation() view function');
  }

  return { name: contract.name, proxyPattern, hasInitializer, isOwnable, hasAuthorizeUpgrade, warnings };
}

/** Register the `contracts` command group onto the given Commander program. */
export function registerContractsCommand(program: Command): void {
  const contracts = program
    .command('contracts')
    .description('Inspect compiled smart contracts in a Foundry or Hardhat project');

  contracts
    .command('list')
    .description('List all compiled contracts')
    .option('--project <dir>', 'Project root directory (default: cwd)')
    .option('--deployable', 'Exclude abstract contracts and interfaces')
    .option('--json', 'Output as JSON array')
    .action(async (opts: { project?: string; deployable?: boolean; json?: boolean }) => {
      try {
        const root = resolveRoot(opts);
        let all = await loadContracts(root);

        if (opts.deployable) {
          all = all.filter((c) => !c.isAbstract);
        }

        if (opts.json) {
          const output = all.map((c) => ({
            name: c.name,
            sourcePath: c.sourcePath,
            constructorInputs: c.constructorInputs,
            isAbstract: c.isAbstract,
            isInterface: c.isInterface,
            compilerVersion: c.compilerVersion,
          }));
          printJson(output);
        } else {
          const rows = all.map(c => {
            const args = c.constructorInputs.length === 0
              ? '—'
              : `(${c.constructorInputs.map(p => p.type).join(', ')})`;
            const suffix = c.isInterface ? '  ← interface' : c.isAbstract ? '  ← abstract' : '';
            return [c.name + suffix, c.sourcePath, args];
          });
          console.log(formatTable(['Contract', 'Source', 'Constructor Args'], rows));
        }
      } catch (err) {
        if (err instanceof ToolchainNotFoundError) {
          printError(err.message);
        } else {
          printError('contracts list failed', err);
        }
        process.exit(1);
      }
    });

  contracts
    .command('info <name>')
    .description('Show full metadata for a named contract')
    .option('--project <dir>', 'Project root directory (default: cwd)')
    .action(async (name: string, opts: { project?: string }) => {
      try {
        const root = resolveRoot(opts);
        const all = await loadContracts(root);
        const contract = all.find((c) => c.name === name);

        if (contract === undefined) {
          printError(`Contract not found: ${name}`);
          process.exit(1);
        } else {
          printJson({
            name: contract.name,
            sourcePath: contract.sourcePath,
            compilerVersion: contract.compilerVersion,
            constructorInputs: contract.constructorInputs,
            isAbstract: contract.isAbstract,
            isInterface: contract.isInterface,
            abi: contract.abi,
            storageLayout: contract.storageLayout ?? null,
          });
        }
      } catch (err) {
        if (err instanceof ToolchainNotFoundError) {
          printError(err.message);
        } else {
          printError('contracts info failed', err);
        }
        process.exit(1);
      }
    });

  contracts
    .command('check <name>')
    .description('Analyse proxy patterns, upgradeability, and ownership of a contract')
    .option('--project <dir>', 'Project root directory (default: cwd)')
    .action(async (name: string, opts: { project?: string }) => {
      try {
        const root = resolveRoot(opts);
        const all = await loadContracts(root);
        const contract = all.find((c) => c.name === name);

        if (contract === undefined) {
          printError(`Contract not found: ${name}`);
          process.exit(1);
        } else {
          printJson(analyzeContract(contract));
        }
      } catch (err) {
        if (err instanceof ToolchainNotFoundError) {
          printError(err.message);
        } else {
          printError('contracts check failed', err);
        }
        process.exit(1);
      }
    });
}
