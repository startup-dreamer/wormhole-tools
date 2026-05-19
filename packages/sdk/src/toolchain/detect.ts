import { access, readFile } from 'fs/promises';
import { join } from 'path';
import { WormToolError } from '../error.js';
import type { ToolchainInfo } from './types.js';

/** Thrown when a directory contains neither a Foundry nor Hardhat project. */
export class ToolchainNotFoundError extends WormToolError {
  constructor(root: string) {
    super(`${root} is not a Foundry or Hardhat project (no foundry.toml or hardhat.config.ts/js found)`);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function foundryArtifactDir(root: string): Promise<string> {
  const toml = await readFile(join(root, 'foundry.toml'), 'utf8');
  const match = /^\s*out\s*=\s*"([^"]+)"/m.exec(toml);
  return join(root, match?.[1] ?? 'out');
}

/**
 * Detect the toolchain used in a project directory.
 * Foundry takes precedence over Hardhat when both configs are present.
 */
export async function detectToolchain(root: string): Promise<ToolchainInfo> {
  const hasFoundry = await exists(join(root, 'foundry.toml'));
  if (hasFoundry) {
    return { type: 'foundry', root, artifactDir: await foundryArtifactDir(root) };
  }

  const hasHardhatTs = await exists(join(root, 'hardhat.config.ts'));
  const hasHardhatJs = await exists(join(root, 'hardhat.config.js'));
  if (hasHardhatTs || hasHardhatJs) {
    return { type: 'hardhat', root, artifactDir: join(root, 'artifacts') };
  }

  throw new ToolchainNotFoundError(root);
}
