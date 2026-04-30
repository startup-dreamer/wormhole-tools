import { describe, it, expect } from 'vitest';
import { computeCreate2Address } from './create2.js';

describe('computeCreate2Address', () => {
  it('matches EIP-1014 known vector (empty init code)', () => {
    // keccak256(0x) = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
    const deployer = '0x0000000000000000000000000000000000000000';
    const salt = '0x' + '00'.repeat(32);
    const initCodeHash = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';
    const result = computeCreate2Address(deployer, salt, initCodeHash);
    expect(result.toLowerCase()).toBe('0xe33c0c7f7df4809055c3eba6c09cfe4baf1bd9e0');
  });

  it('throws on deployer that is not 20 bytes', () => {
    expect(() =>
      computeCreate2Address('0x1234', '0x' + '00'.repeat(32), '0x' + '00'.repeat(32)),
    ).toThrow('20 bytes');
  });

  it('throws on salt that is not 32 bytes', () => {
    expect(() =>
      computeCreate2Address('0x' + '00'.repeat(20), '0x1234', '0x' + '00'.repeat(32)),
    ).toThrow('32 bytes');
  });

  it('different salts produce different addresses', () => {
    const deployer = '0x' + 'ab'.repeat(20);
    const hash = '0x' + 'cd'.repeat(32);
    const a1 = computeCreate2Address(deployer, '0x' + '00'.repeat(32), hash);
    const a2 = computeCreate2Address(deployer, '0x' + 'ff'.repeat(32), hash);
    expect(a1).not.toBe(a2);
  });

  it('result is always a 20-byte (42 char) hex address', () => {
    const addr = computeCreate2Address(
      '0x' + '11'.repeat(20),
      '0x' + '22'.repeat(32),
      '0x' + '33'.repeat(32),
    );
    expect(addr).toMatch(/^0x[0-9a-f]{40}$/i);
  });
});
