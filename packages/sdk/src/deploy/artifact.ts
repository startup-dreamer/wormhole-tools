import { ArtifactParseError } from '../error.js';

interface FoundryBytecodeField {
  object: string;
  linkReferences?: Record<string, unknown>;
}

interface ArtifactLike {
  bytecode?: string | FoundryBytecodeField;
  abi?: unknown[];
  [key: string]: unknown;
}

/** Extract deployable bytecode from a Hardhat or Foundry artifact JSON. */
export function extractBytecode(artifact: unknown, path = '<artifact>'): `0x${string}` {
  const a = artifact as ArtifactLike;

  if (!a.bytecode) {
    throw new ArtifactParseError(path, new Error('no bytecode field'));
  }

  let raw: string;
  if (typeof a.bytecode === 'string') {
    raw = a.bytecode;
  } else if (typeof a.bytecode === 'object' && typeof a.bytecode.object === 'string') {
    if (a.bytecode.linkReferences && Object.keys(a.bytecode.linkReferences).length > 0) {
      throw new ArtifactParseError(path, new Error('bytecode has unresolved link references'));
    }
    raw = a.bytecode.object;
  } else {
    throw new ArtifactParseError(path, new Error('unrecognised bytecode format'));
  }

  const hex = raw.startsWith('0x') ? raw : '0x' + raw;
  if (hex === '0x' || hex.length < 4) {
    throw new ArtifactParseError(path, new Error('bytecode is empty'));
  }
  return hex as `0x${string}`;
}
