import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import { CHAIN_REGISTRY } from './registry.js';

/** A single deployed contract record. */
export interface AddressBookEntry {
  address: `0x${string}`;
  txHash?: string;
  blockNumber?: number;
  /** ISO 8601 timestamp of when the entry was recorded. */
  deployedAt: string;
  verified?: boolean;
}

/**
 * Persistent address book stored at `<root>/deployments/worm-tool.json`.
 * `contracts` is keyed by contractName → chainName → entry.
 */
export interface AddressBook {
  version: '1';
  salt: string;
  contracts: Record<string, Record<string, AddressBookEntry>>;
}

/** Partial address book returned by import functions (no version/salt wrapper). */
export type PartialBook = Record<string, Record<string, AddressBookEntry>>;

const BOOK_PATH = (root: string) => join(root, 'deployments', 'worm-tool.json');

/**
 * Load the address book from `<root>/deployments/worm-tool.json`.
 * Returns an empty book when the file does not exist.
 */
export async function loadAddressBook(root: string): Promise<AddressBook> {
  const path = BOOK_PATH(root);
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed['contracts'] !== 'object' || parsed['contracts'] === null) {
      process.stderr.write(`Warning: ${path} has unexpected format, starting fresh\n`);
      return { version: '1', salt: '', contracts: {} };
    }
    return parsed as unknown as AddressBook;
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return { version: '1', salt: '', contracts: {} };
    }
    throw err;
  }
}

/**
 * Persist the address book to `<root>/deployments/worm-tool.json`.
 * Creates the `deployments/` directory if it does not exist.
 */
export async function saveAddressBook(root: string, book: AddressBook): Promise<void> {
  const dir = join(root, 'deployments');
  await mkdir(dir, { recursive: true });
  await writeFile(BOOK_PATH(root), JSON.stringify(book, null, 2), 'utf8');
}

/**
 * Retrieve the deployed address for a contract on a given chain.
 * Returns `undefined` if no entry exists.
 */
export function getAddress(
  book: AddressBook,
  contractName: string,
  chain: string,
): `0x${string}` | undefined {
  return book.contracts[contractName]?.[chain]?.address;
}

/**
 * Return `true` if a deployment entry exists for the contract on the given chain.
 */
export function isDeployed(book: AddressBook, contractName: string, chain: string): boolean {
  return getAddress(book, contractName, chain) !== undefined;
}

/**
 * Pure function: return a new address book with the entry set for
 * `contractName` on `chain`. Does not mutate the original book.
 */
export function setAddress(
  book: AddressBook,
  contractName: string,
  chain: string,
  entry: AddressBookEntry,
): AddressBook {
  return {
    ...book,
    contracts: {
      ...book.contracts,
      [contractName]: {
        ...book.contracts[contractName],
        [chain]: entry,
      },
    },
  };
}

/**
 * Merge a {@link PartialBook} (from {@link importFromFoundryBroadcast} or
 * {@link importFromHardhatDeploy}) into an {@link AddressBook}.
 * Existing entries are NOT overwritten — only new contract/chain pairs are added.
 */
export function mergePartialBook(book: AddressBook, partial: PartialBook): AddressBook {
  let result = book;
  for (const [contractName, chains] of Object.entries(partial)) {
    for (const [chain, entry] of Object.entries(chains)) {
      if (!isDeployed(result, contractName, chain)) {
        result = setAddress(result, contractName, chain, entry);
      }
    }
  }
  return result;
}

/**
 * Walk `<root>/broadcast/` recursively, find every `run-latest.json`, and
 * extract CREATE transactions. Uses `CHAIN_REGISTRY` to map EVM chain ID →
 * chain name. Returns a `PartialBook` ready to merge into an `AddressBook`.
 */
export async function importFromFoundryBroadcast(root: string): Promise<PartialBook> {
  const broadcastRoot = join(root, 'broadcast');
  const result: PartialBook = {};

  const files = await collectFiles(broadcastRoot, 'run-latest.json');
  for (const file of files) {
    try {
      const raw = await readFile(file, 'utf8');
      const data = JSON.parse(raw) as FoundryBroadcast;
      const chainEntry = CHAIN_REGISTRY.find(c => c.evmChainId === data.chain);
      const chainName = chainEntry?.name;
      if (!chainName) continue;

      for (const tx of data.transactions ?? []) {
        if (tx.transactionType !== 'CREATE') continue;
        const name = tx.contractName;
        const addr = tx.contractAddress as `0x${string}`;
        if (!name || !addr) continue;

        const nameEntry = result[name] ?? (result[name] = {});
        nameEntry[chainName] = {
          address: addr,
          ...(tx.hash !== undefined ? { txHash: tx.hash } : {}),
          deployedAt: new Date().toISOString(),
        };
      }
    } catch (err) {
      if (err instanceof SyntaxError) continue; // Skip malformed JSON files
      throw err;
    }
  }

  return result;
}

/**
 * Walk `<root>/deployments/<networkName>/<Contract>.json` (hardhat-deploy
 * layout), skipping `worm-tool.json`. Returns a `PartialBook` ready to merge
 * into an `AddressBook`.
 */
export async function importFromHardhatDeploy(root: string): Promise<PartialBook> {
  const deploymentsRoot = join(root, 'deployments');
  const result: PartialBook = {};

  let networks: string[];
  try {
    const entries = await readdir(deploymentsRoot, { withFileTypes: true });
    networks = entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') return result;
    throw err;
  }

  for (const network of networks) {
    const networkDir = join(deploymentsRoot, network);
    let files: string[];
    try {
      const entries = await readdir(networkDir, { withFileTypes: true });
      files = entries
        .filter(e => e.isFile() && e.name.endsWith('.json') && e.name !== 'worm-tool.json')
        .map(e => e.name);
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') continue;
      throw err;
    }

    for (const file of files) {
      const contractName = file.slice(0, -5); // strip .json
      try {
        const raw = await readFile(join(networkDir, file), 'utf8');
        const data = JSON.parse(raw) as HardhatDeployArtifact;
        if (!data.address) continue;

        const contractEntry = result[contractName] ?? (result[contractName] = {});
        contractEntry[network] = {
          address: data.address as `0x${string}`,
          ...(data.transactionHash !== undefined ? { txHash: data.transactionHash } : {}),
          deployedAt: new Date().toISOString(),
        };
      } catch (err) {
        if (err instanceof SyntaxError) continue; // Skip malformed JSON files
        throw err;
      }
    }
  }

  return result;
}

interface FoundryBroadcast {
  chain: number;
  transactions?: Array<{
    transactionType: string;
    contractName?: string;
    contractAddress?: string;
    hash?: string;
  }>;
}

interface HardhatDeployArtifact {
  address?: string;
  transactionHash?: string;
}

/** Recursively collect all files with a given basename under `dir`. */
async function collectFiles(dir: string, basename: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') return results;
    throw err;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await collectFiles(full, basename);
      results.push(...sub);
    } else if (entry.isFile() && entry.name === basename) {
      results.push(full);
    }
  }

  return results;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
