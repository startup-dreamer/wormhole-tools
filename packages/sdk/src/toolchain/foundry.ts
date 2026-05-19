import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import type { ContractMeta, StorageLayout } from './types.js';
import { extractConstructorInputs } from './utils.js';

interface FoundryArtifact {
  abi?: unknown[];
  bytecode?: { object: string; linkReferences?: Record<string, unknown> };
  metadata?: {
    compiler?: { version?: string };
    settings?: { compilationTarget?: Record<string, string> };
  };
  storageLayout?: StorageLayout;
}

/**
 * Read all compiled Foundry artifacts from the given artifact directory
 * and return normalized ContractMeta objects.
 */
export async function readFoundryArtifacts(artifactDir: string): Promise<ContractMeta[]> {
  const results: ContractMeta[] = [];

  let solDirs: string[];
  try {
    const entries = await readdir(artifactDir, { withFileTypes: true });
    solDirs = entries
      .filter(e => e.isDirectory() && e.name.endsWith('.sol'))
      .map(e => join(artifactDir, e.name));
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  for (const solDir of solDirs) {
    const files = await readdir(solDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const contractName = basename(file, '.json');
      const artifactPath = join(solDir, file);

      let raw: FoundryArtifact;
      try {
        raw = JSON.parse(await readFile(artifactPath, 'utf8')) as FoundryArtifact;
      } catch (err) {
        process.stderr.write(`Warning: failed to parse artifact ${artifactPath}: ${err instanceof Error ? err.message : String(err)}\n`);
        continue;
      }

      const bytecodeObj = raw.bytecode?.object ?? '';
      const bytecodeHex = (bytecodeObj.startsWith('0x') ? bytecodeObj : '0x' + bytecodeObj) as `0x${string}`;
      const isEmpty = bytecodeHex === '0x';

      const compilationTarget = raw.metadata?.settings?.compilationTarget ?? {};
      const sourcePath = Object.keys(compilationTarget)[0] ?? `${contractName}.sol`;
      const compilerVersion = raw.metadata?.compiler?.version ?? 'unknown';

      const abi: unknown[] = raw.abi ?? [];
      const isInterface =
        isEmpty &&
        abi.length > 0 &&
        (abi as { type: string }[]).every(
          e => e.type === 'function' || e.type === 'event' || e.type === 'error',
        );

      results.push({
        name: contractName,
        sourcePath,
        artifactPath,
        abi,
        bytecode: bytecodeHex,
        constructorInputs: extractConstructorInputs(abi),
        isAbstract: isEmpty,
        isInterface,
        compilerVersion,
        ...(raw.storageLayout !== undefined && { storageLayout: raw.storageLayout }),
      });
    }
  }

  return results;
}
