import { readFile } from 'fs/promises';
import { WormcraftError } from '../error.js';
import type { ContractMeta } from '../toolchain/types.js';
import type { AddressBookEntry } from './address-book.js';

/** Etherscan API verification payload (note: `constructorArguements` is the API's typo). */
export interface VerificationPayload {
  apikey: string;
  module: 'contract';
  action: 'verifysourcecode';
  contractaddress: string;
  sourceCode: string;
  codeformat: 'solidity-single-file' | 'solidity-standard-json-input';
  contractname: string;
  compilerversion: string;
  optimizationUsed: '0' | '1';
  runs?: string;
  /** Etherscan API spells this with a typo — must match exactly. */
  constructorArguements: string;
  chainId: string;
}

/** Options passed to {@link buildVerificationPayload}. */
export interface BuildVerificationPayloadOptions {
  artifact: ContractMeta;
  entry: AddressBookEntry;
  constructorArgs: `0x${string}` | string;
  evmChainId: number;
  apiKey: string;
  /** Whether the compiler optimizer was enabled. Defaults to `true`. */
  optimizationUsed?: boolean;
  /** Number of optimizer runs. Defaults to 200. */
  optimizerRuns?: number;
}

/** Options passed to {@link verifyContract}. */
export interface VerifyContractOptions {
  artifact: ContractMeta;
  entry: AddressBookEntry;
  constructorArgs: `0x${string}`;
  evmChainId: number;
  apiKey: string;
}

/** Thrown when the Etherscan verification API returns a non-OK HTTP response. */
export class VerificationError extends WormcraftError {
  constructor(message: string, cause?: unknown) {
    super(`Verification error: ${message}`, cause);
  }
}

const CHAIN_API_MAP: Record<number, string> = {
  1: 'https://api.etherscan.io/api',
  11155111: 'https://api-sepolia.etherscan.io/api',
  42161: 'https://api.arbiscan.io/api',
  421614: 'https://api-sepolia.arbiscan.io/api',
  8453: 'https://api.basescan.org/api',
  84532: 'https://api-sepolia.basescan.org/api',
  137: 'https://api.polygonscan.com/api',
  56: 'https://api.bscscan.com/api',
};

const ETHERSCAN_API_DEFAULT = 'https://api.etherscan.io/api';

/**
 * Build an Etherscan-compatible verification payload from contract metadata.
 * The `sourceCode` field is left empty; callers must set it before submitting.
 */
export function buildVerificationPayload(opts: BuildVerificationPayloadOptions): VerificationPayload {
  const { artifact, entry, constructorArgs, evmChainId, apiKey } = opts;

  const compilerversion = artifact.compilerVersion.startsWith('v')
    ? artifact.compilerVersion
    : `v${artifact.compilerVersion}`;

  const constructorArguements = constructorArgs.startsWith('0x')
    ? constructorArgs.slice(2)
    : constructorArgs;

  return {
    apikey: apiKey,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: entry.address,
    sourceCode: '',
    codeformat: 'solidity-standard-json-input',
    contractname: artifact.name,
    compilerversion,
    optimizationUsed: (opts.optimizationUsed ?? true) ? '1' : '0',
    ...(opts.optimizerRuns !== undefined && { runs: String(opts.optimizerRuns) }),
    constructorArguements,
    chainId: String(evmChainId),
  };
}

/**
 * Submit a contract for Etherscan verification.
 *
 * Reads the Foundry metadata JSON (if present) to populate `sourceCode`.
 * Returns a result object with `success`, optional `guid`, and `message`.
 * Throws {@link VerificationError} on HTTP-level failures.
 */
export async function verifyContract(
  opts: VerifyContractOptions,
): Promise<{ success: boolean; guid?: string; message: string }> {
  const { artifact, entry, constructorArgs, evmChainId, apiKey } = opts;

  const apiUrl = CHAIN_API_MAP[evmChainId] ?? ETHERSCAN_API_DEFAULT;

  // Attempt to read Foundry metadata JSON (replace trailing .json with .metadata.json)
  let sourceCode = '{}';
  let optimizationUsed: boolean | undefined;
  let optimizerRuns: number | undefined;
  const metadataPath = artifact.artifactPath.replace(/\.json$/, '.metadata.json');
  try {
    sourceCode = await readFile(metadataPath, 'utf8');
    const metaRaw = JSON.parse(sourceCode) as {
      settings?: { optimizer?: { enabled?: boolean; runs?: number } }
    };
    optimizationUsed = metaRaw.settings?.optimizer?.enabled;
    optimizerRuns = metaRaw.settings?.optimizer?.runs;
  } catch {
    // Metadata not found — use empty JSON object as fallback
  }

  const payload = buildVerificationPayload({
    artifact, entry, constructorArgs, evmChainId, apiKey,
    ...(optimizationUsed !== undefined && { optimizationUsed }),
    ...(optimizerRuns !== undefined && { optimizerRuns }),
  });
  payload.sourceCode = sourceCode;

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) {
      body.set(key, String(value));
    }
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new VerificationError(`HTTP ${response.status} from ${apiUrl}`);
  }

  const result = (await response.json()) as { status?: string; result?: string; message?: string };

  if (result.status !== '1') {
    return { success: false, message: result.result ?? result.message ?? 'Unknown error' };
  }

  return result.result !== undefined
    ? { success: true, guid: result.result, message: 'Verification submitted' }
    : { success: true, message: 'Verification submitted' };
}
