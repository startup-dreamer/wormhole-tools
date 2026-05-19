import { describe, it, expect } from 'vitest';
import { generateTestVaa, generateTestVaaHex } from '../src/generate.js';
import { parseVaa } from '../src/vaa/index.js';

const BASE_PARAMS = {
  emitterChain: 2,
  emitterAddress: `0x${'ab'.repeat(32)}` as `0x${string}`,
  sequence: 42n,
  payload: '0xdeadbeef' as `0x${string}`,
};

describe('generateTestVaa', () => {
  it('produces a ParsedVaa with correct fields', () => {
    const vaa = generateTestVaa(BASE_PARAMS);
    expect(vaa.version).toBe(1);
    expect(vaa.emitterChain).toBe(2);
    expect(vaa.sequence).toBe(42n);
    expect(vaa.payload).toBe('0xdeadbeef');
    expect(vaa.signatures).toHaveLength(0);
  });

  it('hash is a 32-byte keccak256 hex', () => {
    const vaa = generateTestVaa(BASE_PARAMS);
    expect(vaa.hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('uses provided timestamp and nonce', () => {
    const vaa = generateTestVaa({ ...BASE_PARAMS, timestamp: 1234567, nonce: 99 });
    expect(vaa.timestamp).toBe(1234567);
    expect(vaa.nonce).toBe(99);
  });
});

describe('generateTestVaaHex', () => {
  it('produces hex that round-trips through parseVaa', () => {
    const hex = generateTestVaaHex(BASE_PARAMS);
    expect(hex.startsWith('0x')).toBe(true);
    const parsed = parseVaa(hex);
    expect(parsed.emitterChain).toBe(2);
    expect(parsed.sequence).toBe(42n);
    expect(parsed.payload.toLowerCase()).toBe('0xdeadbeef');
  });
});
