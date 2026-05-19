import { parse as parseYaml } from 'yaml';
import { WormcraftError } from '../error.js';

/** Thrown when a deploy manifest cannot be parsed or is structurally invalid. */
export class ManifestParseError extends WormcraftError {
  constructor(message: string, cause?: unknown) {
    super(`Manifest parse error: ${message}`, cause);
  }
}

/** RPC and chain identity for a single network entry. */
export interface NetworkConfig {
  chain: string;
  rpc: string;
}

/** A single constructor argument for a contract deployment. */
export interface ContractArg {
  type: string;
  value: string;
}

/** Configuration for deploying one contract. */
export interface ContractDeployConfig {
  name: string;
  contract: string;
  args?: ContractArg[];
  verify?: boolean;
}

/** Deployment execution strategy across chains. */
export type DeployStrategy = 'cross-chain' | 'sequential';

/** A group of contracts deployed together to a set of chains. */
export interface DeployTarget {
  contracts: string[];
  chains: string[];
  strategy: DeployStrategy;
}

/** Top-level structure of a `wormcraft.deploy.yaml` file. */
export interface DeployManifest {
  version: string;
  networks: Record<string, NetworkConfig>;
  deployer: { salt: string };
  contracts: ContractDeployConfig[];
  deploy_targets: DeployTarget[];
}

const VALID_STRATEGIES: DeployStrategy[] = ['cross-chain', 'sequential'];

/**
 * Replaces `${VAR}` placeholders in `value` with the corresponding
 * `process.env[VAR]` value. Unknown variables are left as the literal
 * `${VAR}` string.
 */
export function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, varName: string) => {
    return process.env[varName] ?? match;
  });
}

function resolveEnvVarsDeep(obj: unknown): unknown {
  if (typeof obj === 'string') return resolveEnvVars(obj);
  if (Array.isArray(obj)) return obj.map(resolveEnvVarsDeep);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, resolveEnvVarsDeep(v)]),
    );
  }
  return obj;
}

function validateManifest(raw: unknown): DeployManifest {
  if (typeof raw !== 'object' || raw === null) {
    throw new ManifestParseError('manifest must be an object');
  }
  const obj = raw as Record<string, unknown>;

  if (!obj['networks'] || typeof obj['networks'] !== 'object') {
    throw new ManifestParseError('"networks" is required');
  }
  if (!obj['deployer'] || typeof obj['deployer'] !== 'object') {
    throw new ManifestParseError('"deployer" is required');
  }
  const deployer = obj['deployer'] as Record<string, unknown>;
  if (typeof deployer['salt'] !== 'string' || deployer['salt'].length === 0) {
    throw new ManifestParseError('"deployer.salt" must be a non-empty string');
  }
  if (!Array.isArray(obj['contracts'])) {
    throw new ManifestParseError('"contracts" must be an array');
  }
  if (!Array.isArray(obj['deploy_targets'])) {
    throw new ManifestParseError('"deploy_targets" must be an array');
  }

  for (const target of obj['deploy_targets'] as unknown[]) {
    const t = target as Record<string, unknown>;
    if (!Array.isArray(t['contracts']) || !Array.isArray(t['chains'])) {
      throw new ManifestParseError('deploy_targets[] entries must have "contracts" and "chains" arrays');
    }
    if (!VALID_STRATEGIES.includes(t['strategy'] as DeployStrategy)) {
      throw new ManifestParseError(
        `Invalid strategy "${String(t['strategy'])}" — must be one of: ${VALID_STRATEGIES.join(', ')}`,
      );
    }
  }

  return raw as DeployManifest;
}

/**
 * Parse a `wormcraft.deploy.yaml` string into a validated {@link DeployManifest}.
 *
 * All string values have `${VAR}` placeholders resolved against `process.env`
 * before validation. Unknown placeholders are kept as-is.
 *
 * @throws {ManifestParseError} on invalid YAML, missing required fields, or
 *   an unrecognised `deploy_targets[].strategy` value.
 */
export function parseManifest(yaml: string): DeployManifest {
  let raw: unknown;
  try {
    raw = parseYaml(yaml);
  } catch (err) {
    throw new ManifestParseError('invalid YAML', err);
  }
  const resolved = resolveEnvVarsDeep(raw);
  return validateManifest(resolved);
}
