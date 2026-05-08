import type { Command } from 'commander';
import { detectToolchain, listArtifacts, ToolchainNotFoundError } from '@worm-tool/sdk';
import type { ContractMeta } from '@worm-tool/sdk';
import { printJson, printError } from '../output.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve the project root: explicit --project flag or cwd. */
function resolveRoot(opts: { project?: string }): string {
  return opts.project ?? process.cwd();
}

/** Load and return all artifacts from the detected toolchain. */
async function loadContracts(root: string): Promise<ContractMeta[]> {
  const info = await detectToolchain(root);
  return listArtifacts(info);
}

/**
 * Render a text table for `contracts list`.
 * Column widths are dynamic to fit content.
 */
function renderTable(contracts: ContractMeta[]): string {
  const rows: Array<[string, string, string]> = contracts.map((c) => {
    const args =
      c.constructorInputs.length === 0
        ? '—'
        : `(${c.constructorInputs.map((p) => p.type).join(', ')})`;
    const suffix = c.isInterface ? '  ← interface' : c.isAbstract ? '  ← abstract' : '';
    return [c.name + suffix, c.sourcePath, args];
  });

  const headers: [string, string, string] = ['Contract', 'Source', 'Constructor Args'];

  const col0 = Math.max(headers[0].length, ...rows.map((r) => r[0].length));
  const col1 = Math.max(headers[1].length, ...rows.map((r) => r[1].length));

  const pad = (s: string, n: number): string => s.padEnd(n);
  const col2 = Math.max(headers[2]!.length, ...rows.map((r) => r[2]!.length));
  const sep = `${'─'.repeat(col0 + 2)}${'─'.repeat(col1 + 2)}${'─'.repeat(col2 + 2)}`;

  const lines: string[] = [
    `${pad(headers[0], col0)}  ${pad(headers[1], col1)}  ${headers[2]}`,
    sep,
    ...rows.map((r) => `${pad(r[0], col0)}  ${pad(r[1], col1)}  ${r[2]}`),
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Proxy / upgrade analysis
// ---------------------------------------------------------------------------

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
  proxyPattern: 'UUPS' | 'Transparent' | 'none';
  hasInitializer: boolean;
  isOwnable: boolean;
  hasAuthorizeUpgrade: boolean;
  warnings: string[];
}

function analyzeContract(contract: ContractMeta): CheckResult {
  const names = abiNames(contract.abi);

  const isUUPS = names.has('upgradeTo') || names.has('upgradeToAndCall');
  const isTransparent = names.has('admin') && names.has('implementation');
  const proxyPattern: 'UUPS' | 'Transparent' | 'none' = isUUPS
    ? 'UUPS'
    : isTransparent
    ? 'Transparent'
    : 'none';

  const hasInitializer = names.has('initialize') || [...names].some((n) => n.includes('__init'));
  const isOwnable = names.has('owner') && names.has('transferOwnership');
  const hasAuthorizeUpgrade = names.has('_authorizeUpgrade');

  const warnings: string[] = [];
  if (proxyPattern === 'UUPS' && !hasAuthorizeUpgrade) {
    warnings.push('UUPS proxy missing _authorizeUpgrade');
  }

  return { name: contract.name, proxyPattern, hasInitializer, isOwnable, hasAuthorizeUpgrade, warnings };
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/** Register the `contracts` command group onto the given Commander program. */
export function registerContractsCommand(program: Command): void {
  const contracts = program
    .command('contracts')
    .description('Inspect compiled smart contracts in a Foundry or Hardhat project');

  // ── contracts list ────────────────────────────────────────────────────────
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
          if (all.length === 0) {
            console.log('No contracts found.');
          } else {
            console.log(renderTable(all));
          }
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

  // ── contracts info ────────────────────────────────────────────────────────
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

  // ── contracts check ───────────────────────────────────────────────────────
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
