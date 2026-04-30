import { describe, it, expect } from 'vitest';
import { extractBytecode } from './artifact.js';
import { ArtifactParseError } from '../error.js';

describe('extractBytecode', () => {
  it('extracts bytecode from a Foundry artifact', () => {
    const artifact = { bytecode: { object: '0x6001600201' }, abi: [] };
    expect(extractBytecode(artifact)).toBe('0x6001600201');
  });

  it('extracts bytecode from a Hardhat artifact', () => {
    const artifact = { bytecode: '0xdeadbeef', abi: [] };
    expect(extractBytecode(artifact)).toBe('0xdeadbeef');
  });

  it('prepends 0x if missing', () => {
    const artifact = { bytecode: 'deadbeef', abi: [] };
    expect(extractBytecode(artifact)).toBe('0xdeadbeef');
  });

  it('throws ArtifactParseError on missing bytecode', () => {
    expect(() => extractBytecode({ abi: [] })).toThrow(ArtifactParseError);
  });

  it('throws ArtifactParseError on unresolved link references', () => {
    const artifact = {
      bytecode: { object: '0x__$abc$__6001', linkReferences: { 'Lib.sol': {} } },
      abi: [],
    };
    expect(() => extractBytecode(artifact)).toThrow(ArtifactParseError);
  });

  it('throws ArtifactParseError on empty bytecode', () => {
    expect(() => extractBytecode({ bytecode: '0x', abi: [] })).toThrow(ArtifactParseError);
  });
});
