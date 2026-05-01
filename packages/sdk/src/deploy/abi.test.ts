import { describe, it, expect } from 'vitest';
import { encodeDeployMessage, encodeCallMessage, encodeUpgradeMessage } from './abi.js';

describe('encodeDeployMessage', () => {
  it('produces a non-empty 0x-prefixed hex string', () => {
    const encoded = encodeDeployMessage({
      bytecode: '0x6001',
      salt: `0x${'00'.repeat(32)}`,
      targetChains: [2, 4],
    });
    expect(encoded.startsWith('0x')).toBe(true);
    expect(encoded.length).toBeGreaterThan(2);
  });

  it('is deterministic — same input same output', () => {
    const params = { bytecode: '0x6001' as `0x${string}`, salt: `0x${'aa'.repeat(32)}` as `0x${string}`, targetChains: [2] };
    expect(encodeDeployMessage(params)).toBe(encodeDeployMessage(params));
  });

  it('different chains produce different encodings', () => {
    const base = { bytecode: '0x6001' as `0x${string}`, salt: `0x${'00'.repeat(32)}` as `0x${string}` };
    const a = encodeDeployMessage({ ...base, targetChains: [2] });
    const b = encodeDeployMessage({ ...base, targetChains: [2, 4] });
    expect(a).not.toBe(b);
  });
});

describe('encodeCallMessage', () => {
  it('produces a non-empty 0x-prefixed hex string', () => {
    const encoded = encodeCallMessage({
      target: `0x${'ab'.repeat(20)}`,
      calldata: '0xdeadbeef',
      targetChains: [2],
    });
    expect(encoded.startsWith('0x')).toBe(true);
    expect(encoded.length).toBeGreaterThan(2);
  });
});

describe('encodeUpgradeMessage', () => {
  it('produces a non-empty 0x-prefixed hex string', () => {
    const encoded = encodeUpgradeMessage({
      proxy: `0x${'11'.repeat(20)}`,
      newImpl: `0x${'22'.repeat(20)}`,
      targetChains: [2, 23],
    });
    expect(encoded.startsWith('0x')).toBe(true);
    expect(encoded.length).toBeGreaterThan(2);
  });
});
