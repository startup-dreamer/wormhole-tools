import type { AbiParameter } from 'viem';

export type ToolchainType = 'foundry' | 'hardhat';

/** Detected toolchain with resolved artifact directory. */
export interface ToolchainInfo {
  type: ToolchainType;
  root: string;
  artifactDir: string;
}

/** A single storage variable from the Solidity compiler's storage layout output. */
export interface StorageVariable {
  label: string;
  type: string;
  slot: string;
  offset: number;
}

/** Storage layout as emitted by solc (Foundry passes this through directly). */
export interface StorageLayout {
  storage: StorageVariable[];
  types: Record<string, { encoding: string; label: string; numberOfBytes: string }>;
}

/** Normalized contract metadata, toolchain-agnostic. */
export interface ContractMeta {
  name: string;
  sourcePath: string;
  artifactPath: string;
  abi: readonly unknown[];
  bytecode: `0x${string}`;
  constructorInputs: readonly AbiParameter[];
  /** True when bytecode is empty (abstract contract or interface). */
  isAbstract: boolean;
  /** True when the artifact appears to be a pure interface (empty bytecode + only function/event/error entries). */
  isInterface: boolean;
  compilerVersion: string;
  storageLayout?: StorageLayout;
}
