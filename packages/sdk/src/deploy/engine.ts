import { encodeAbiParameters } from 'viem';
import type { AbiParameter } from 'viem';
import { WormToolError } from '../error.js';
import type { DeployManifest } from './manifest.js';
import type { AddressBook } from './address-book.js';
import { isDeployed, setAddress } from './address-book.js';
import type { ContractMeta } from '../toolchain/types.js';

/** Thrown when the deployment engine encounters an unrecoverable error. */
export class EngineError extends WormToolError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/**
 * Resolve a single template expression in a constructor arg value.
 *
 * Supported patterns:
 * - `{{contracts.Name.address}}` — look up `Name` in `deployedAddresses`
 * - `{{env.VAR}}` — read `process.env[VAR]`
 * - Literal (no `{{`) — returned as-is
 *
 * @throws {EngineError} when a referenced contract or env var is missing,
 *   or when the template pattern is not recognised.
 */
export function resolveTemplateArg(
  value: string,
  deployedAddresses: Record<string, `0x${string}`>,
): string {
  if (!value.includes('{{')) return value;

  const contractMatch = /^\{\{contracts\.([^}]+)\.address\}\}$/.exec(value);
  if (contractMatch) {
    const name = contractMatch[1];
    if (!name) throw new EngineError(`Invalid contract template expression: ${value}`);
    const addr = deployedAddresses[name];
    if (!addr) throw new EngineError(`Contract "${name}" has not been deployed yet (referenced in template)`);
    return addr;
  }

  const envMatch = /^\{\{env\.([^}]+)\}\}$/.exec(value);
  if (envMatch) {
    const varName = envMatch[1];
    if (!varName) throw new EngineError(`Invalid env template expression: ${value}`);
    const envVal = process.env[varName];
    if (envVal === undefined) throw new EngineError(`Environment variable "${varName}" is not set`);
    return envVal;
  }

  throw new EngineError(`Unsupported template expression: ${value}`);
}

/**
 * Extract `{{contracts.X.address}}` dependency names from a list of args.
 */
function extractDeps(args: DeployManifest['contracts'][number]['args']): string[] {
  if (!args) return [];
  const deps: string[] = [];
  for (const arg of args) {
    const m = /^\{\{contracts\.([^}]+)\.address\}\}$/.exec(arg.value);
    if (m && m[1]) deps.push(m[1]);
  }
  return deps;
}

/**
 * Sort contracts in topological (dependency-first) order.
 *
 * Reads `{{contracts.X.address}}` references from each contract's args to
 * build a dependency graph, then performs a depth-first topological sort.
 *
 * @throws {EngineError} containing the word `"circular"` when a dependency
 *   cycle is detected.
 */
export function buildDependencyOrder(
  contracts: DeployManifest['contracts'],
): DeployManifest['contracts'] {
  const byName = new Map<string, DeployManifest['contracts'][number]>();
  for (const c of contracts) byName.set(c.name, c);

  // Kahn's algorithm
  const deps = new Map<string, string[]>();
  const reverseDeps = new Map<string, string[]>();
  for (const c of contracts) {
    const d = extractDeps(c.args);
    deps.set(c.name, d);
    if (!reverseDeps.has(c.name)) reverseDeps.set(c.name, []);
    for (const dep of d) {
      const rev = reverseDeps.get(dep) ?? [];
      rev.push(c.name);
      reverseDeps.set(dep, rev);
    }
  }

  // In-degree = number of deps each node has
  const inDegree = new Map<string, number>();
  for (const c of contracts) {
    inDegree.set(c.name, (deps.get(c.name) ?? []).length);
  }

  const queue: string[] = [];
  for (const c of contracts) {
    if ((inDegree.get(c.name) ?? 0) === 0) queue.push(c.name);
  }

  const result: DeployManifest['contracts'] = [];
  while (queue.length > 0) {
    const name = queue.shift();
    if (!name) break;
    const contract = byName.get(name);
    if (!contract) throw new EngineError(`Contract "${name}" referenced but not defined`);
    result.push(contract);

    for (const dependent of reverseDeps.get(name) ?? []) {
      const newDeg = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, newDeg);
      if (newDeg === 0) queue.push(dependent);
    }
  }

  if (result.length !== contracts.length) {
    throw new EngineError('circular dependency detected in contract deployment graph');
  }

  return result;
}

/** A single entry in a deployment dry-run plan. */
export interface DeployPlanEntry {
  name: string;
  contract: string;
  alreadyDeployed: boolean;
  targetChains: string[];
  strategy: string;
}

/**
 * Build a dry-run deployment plan from a manifest and an address book.
 *
 * For each contract in each deploy_target, checks whether it is already
 * deployed on all target chains via the address book.
 */
export function buildDeployPlan(manifest: DeployManifest, book: AddressBook): DeployPlanEntry[] {
  const ordered = buildDependencyOrder(manifest.contracts);
  const entries: DeployPlanEntry[] = [];

  for (const contractConfig of ordered) {
    for (const target of manifest.deploy_targets) {
      if (!target.contracts.includes(contractConfig.name)) continue;

      const alreadyDeployed = target.chains.every(chain =>
        isDeployed(book, contractConfig.name, chain),
      );

      entries.push({
        name: contractConfig.name,
        contract: contractConfig.contract,
        alreadyDeployed,
        targetChains: target.chains,
        strategy: target.strategy,
      });
    }
  }

  return entries;
}

/** Options for {@link runDeployment}. */
export interface EngineRunOptions {
  manifest: DeployManifest;
  book: AddressBook;
  artifacts: ContractMeta[];
  /**
   * Callback that performs the actual deployment.
   * Called once per contract/target combination that needs deploying.
   */
  deployFn: (params: {
    contractName: string;
    bytecode: `0x${string}`;
    constructorArgs: `0x${string}`;
    salt: `0x${string}`;
    chains: string[];
    strategy: string;
  }) => Promise<Array<{ chain: string; address: `0x${string}`; txHash: string }>>;
  /**
   * Convert a string salt (from the manifest) into a 32-byte hex salt.
   * Typically keccak256 of the string unless it is already 32-byte hex.
   */
  saltFn: (salt: string) => `0x${string}`;
  /** Optional progress callback written to stderr by callers. */
  onProgress?: (msg: string) => void;
}

/** Result returned by {@link runDeployment}. */
export interface EngineRunResult {
  book: AddressBook;
  deployed: Array<{ name: string; chain: string; address: `0x${string}` }>;
  skipped: Array<{ name: string; chains: string[] }>;
}

/**
 * Execute a full multi-contract, multi-chain deployment driven by the manifest.
 *
 * Algorithm:
 * 1. Seed `resolvedAddresses` from the existing address book.
 * 2. Topologically sort contracts so dependencies deploy first.
 * 3. For each contract × deploy_target pair:
 *    - If already deployed on all chains: skip and seed resolved address.
 *    - Otherwise: find artifact, resolve template args, ABI-encode constructor
 *      args, call `deployFn`, record results in the address book.
 * 4. Return the updated book plus `deployed` / `skipped` summaries.
 *
 * @throws {EngineError} when an artifact is missing, a template reference
 *   cannot be resolved, or a circular dependency exists.
 */
export async function runDeployment(opts: EngineRunOptions): Promise<EngineRunResult> {
  const { manifest, artifacts, deployFn, saltFn, onProgress } = opts;
  let book = opts.book;

  // Seed resolved addresses from the existing address book
  const resolvedAddresses: Record<string, `0x${string}`> = {};
  for (const [contractName, chains] of Object.entries(book.contracts)) {
    for (const [, entry] of Object.entries(chains)) {
      // Use the first available chain's address as the representative address
      if (!resolvedAddresses[contractName]) {
        resolvedAddresses[contractName] = entry.address;
      }
    }
  }

  const ordered = buildDependencyOrder(manifest.contracts);
  const salt = saltFn(manifest.deployer.salt);

  const deployed: EngineRunResult['deployed'] = [];
  const skipped: EngineRunResult['skipped'] = [];

  for (const contractConfig of ordered) {
    for (const target of manifest.deploy_targets) {
      if (!target.contracts.includes(contractConfig.name)) continue;

      const allDeployed = target.chains.every(chain =>
        isDeployed(book, contractConfig.name, chain),
      );

      if (allDeployed) {
        onProgress?.(`Skipping ${contractConfig.name} (already deployed on all target chains)`);
        // Seed resolved address from book
        const firstChain = target.chains[0];
        if (firstChain) {
          const addr = book.contracts[contractConfig.name]?.[firstChain]?.address;
          if (addr) resolvedAddresses[contractConfig.name] = addr;
        }
        skipped.push({ name: contractConfig.name, chains: target.chains });
        continue;
      }

      // Find the artifact
      const artifact = artifacts.find(a => a.name === contractConfig.contract);
      if (!artifact) {
        throw new EngineError(
          `Artifact not found for contract "${contractConfig.contract}" (used by "${contractConfig.name}")`,
        );
      }

      // Resolve template args
      const rawArgs = contractConfig.args ?? [];
      const resolvedArgs = rawArgs.map(arg => ({
        ...arg,
        value: resolveTemplateArg(arg.value, resolvedAddresses),
      }));

      // ABI-encode constructor args
      let constructorArgs: `0x${string}` = '0x';
      if (resolvedArgs.length > 0 && artifact.constructorInputs.length > 0) {
        const params = artifact.constructorInputs as AbiParameter[];
        const values = resolvedArgs.map((arg, i) => {
          const param = params[i];
          if (!param) {
            throw new EngineError(
              `Too many args for ${contractConfig.name} constructor (expected ${params.length}, got ${resolvedArgs.length})`,
            );
          }
          if (
            param.type === 'uint256' ||
            param.type.startsWith('uint') ||
            param.type.startsWith('int')
          ) {
            return BigInt(arg.value);
          }
          return arg.value;
        });
        constructorArgs = encodeAbiParameters(params, values);
      }

      onProgress?.(`Deploying ${contractConfig.name} (${contractConfig.contract}) to [${target.chains.join(', ')}]`);

      const results = await deployFn({
        contractName: contractConfig.contract,
        bytecode: artifact.bytecode,
        constructorArgs,
        salt,
        chains: target.chains,
        strategy: target.strategy,
      });

      for (const r of results) {
        book = setAddress(book, contractConfig.name, r.chain, {
          address: r.address,
          txHash: r.txHash,
          deployedAt: new Date().toISOString(),
        });
        deployed.push({ name: contractConfig.name, chain: r.chain, address: r.address });
        // Update resolved address (use first chain's address as representative)
        if (!resolvedAddresses[contractConfig.name]) {
          resolvedAddresses[contractConfig.name] = r.address;
        }
      }
    }
  }

  return { book, deployed, skipped };
}
