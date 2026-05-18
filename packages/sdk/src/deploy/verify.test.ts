import { describe, it, expect } from 'vitest';
import { buildVerificationPayload } from './verify.js';
import type { ContractMeta } from '../toolchain/types.js';
import type { AddressBookEntry } from './address-book.js';

const mockArtifact: ContractMeta = {
  name: 'MyToken',
  sourcePath: 'src/MyToken.sol',
  artifactPath: '/tmp/out/MyToken.sol/MyToken.json',
  abi: [],
  bytecode: '0x6080' as `0x${string}`,
  constructorInputs: [{ name: '_name', type: 'string' }] as any,
  isAbstract: false,
  isInterface: false,
  compilerVersion: '0.8.24',
};

const mockEntry: AddressBookEntry = {
  address: '0xabc' as `0x${string}`,
  txHash: '0xdeadbeef',
  deployedAt: '2026-05-18T00:00:00Z',
};

describe('buildVerificationPayload', () => {
  it('builds payload with required fields', () => {
    const payload = buildVerificationPayload({
      artifact: mockArtifact,
      entry: mockEntry,
      constructorArgs: '0x0000',
      evmChainId: 11155111,
      apiKey: 'MY_KEY',
    });
    expect(payload.contractaddress).toBe('0xabc');
    expect(payload.contractname).toBe('MyToken');
    expect(payload.compilerversion).toBe('v0.8.24');
    expect(payload.constructorArguements).toBe('0000'); // 0x stripped
    expect(payload.chainId).toBe('11155111');
    expect(payload.apikey).toBe('MY_KEY');
    expect(payload.codeformat).toBe('solidity-standard-json-input');
    expect(payload.module).toBe('contract');
    expect(payload.action).toBe('verifysourcecode');
  });

  it('does not double-prefix compiler version', () => {
    const payload = buildVerificationPayload({
      artifact: { ...mockArtifact, compilerVersion: 'v0.8.24' },
      entry: mockEntry,
      constructorArgs: '0x',
      evmChainId: 1,
      apiKey: 'K',
    });
    expect(payload.compilerversion).toBe('v0.8.24');
    expect(payload.constructorArguements).toBe('');
  });
});
