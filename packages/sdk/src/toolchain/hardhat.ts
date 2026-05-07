import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import type { ContractMeta } from './types.js';
import { extractConstructorInputs } from './utils.js';

interface HardhatArtifact {
  _format?: string;
  contractName?: string;
  sourceName?: string;
  abi?: unknown[];
  bytecode?: string;
  deployedBytecode?: string;
}

async function walkArtifactDir(dir: string): Promise<string[]> {
  const paths: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        paths.push(...(await walkArtifactDir(full)));
      } else if (entry.name.endsWith('.json') && !entry.name.endsWith('.dbg.json')) {
        paths.push(full);
      }
    }
  } catch {
    /* skip unreadable dirs */
  }
  return paths;
}

/**
 * Read all compiled Hardhat artifacts from the given artifact directory
 * and return normalized ContractMeta objects.
 */
export async function readHardhatArtifacts(artifactDir: string): Promise<ContractMeta[]> {
  const results: ContractMeta[] = [];
  const files = await walkArtifactDir(artifactDir);

  for (const artifactPath of files) {
    let raw: HardhatArtifact;
    try {
      raw = JSON.parse(await readFile(artifactPath, 'utf8')) as HardhatArtifact;
    } catch (err) {
      process.stderr.write(`Warning: failed to parse artifact ${artifactPath}: ${err instanceof Error ? err.message : String(err)}\n`);
      continue;
    }

    if (!raw._format?.startsWith('hh-sol-artifact')) continue;

    const contractName = raw.contractName ?? basename(artifactPath, '.json');
    const sourcePath = raw.sourceName ?? `contracts/${contractName}.sol`;
    const bytecodeRaw = raw.bytecode ?? '0x';
    const bytecode = (bytecodeRaw.startsWith('0x') ? bytecodeRaw : '0x' + bytecodeRaw) as `0x${string}`;
    const isEmpty = bytecode === '0x';

    const abi: unknown[] = raw.abi ?? [];
    const allEntries = abi.filter((e): e is { type: string } => typeof e === 'object' && e !== null);
    const isInterface =
      isEmpty &&
      allEntries.length > 0 &&
      allEntries.every(e => e.type === 'function' || e.type === 'event' || e.type === 'error');

    results.push({
      name: contractName,
      sourcePath,
      artifactPath,
      abi,
      bytecode,
      constructorInputs: extractConstructorInputs(abi),
      isAbstract: isEmpty,
      isInterface,
      compilerVersion: 'unknown',
    });
  }

  return results;
}
