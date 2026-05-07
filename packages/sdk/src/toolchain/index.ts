export type { ToolchainType, ToolchainInfo, ContractMeta, StorageLayout, StorageVariable } from './types.js';
export { detectToolchain, ToolchainNotFoundError } from './detect.js';

import { readFoundryArtifacts } from './foundry.js';
import { readHardhatArtifacts } from './hardhat.js';
import type { ToolchainInfo, ContractMeta } from './types.js';

/** Read all compiled contracts from a detected toolchain. */
export async function listArtifacts(info: ToolchainInfo): Promise<ContractMeta[]> {
  if (info.type === 'foundry') return readFoundryArtifacts(info.artifactDir);
  return readHardhatArtifacts(info.artifactDir);
}
