import { describe, it, expect } from 'vitest';
import {
  encodeDeployMessage,
  encodeCallMessage,
  encodeUpgradeMessage,
  encodeScheduleUpgradeMessage,
  encodeExecuteUpgradeMessage,
} from '../../src/deploy/abi.js';

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

describe('AdminModule ABI encoding', () => {
  const proxy   = `0x${'11'.repeat(20)}` as `0x${string}`;
  const newImpl = `0x${'22'.repeat(20)}` as `0x${string}`;
  const salt    = `0x${'42'.repeat(32)}` as `0x${string}`;

  it('encodeScheduleUpgradeMessage returns 0x-prefixed hex', () => {
    const result = encodeScheduleUpgradeMessage({ proxy, newImpl, salt });
    expect(result.startsWith('0x')).toBe(true);
    expect(result.length).toBeGreaterThan(10);
  });

  it('encodeExecuteUpgradeMessage returns 0x-prefixed hex', () => {
    const result = encodeExecuteUpgradeMessage({ proxy, newImpl, salt });
    expect(result.startsWith('0x')).toBe(true);
    expect(result.length).toBeGreaterThan(10);
  });

  it('schedule and execute produce different selectors', () => {
    const schedule = encodeScheduleUpgradeMessage({ proxy, newImpl, salt });
    const execute  = encodeExecuteUpgradeMessage({ proxy, newImpl, salt });
    expect(schedule.slice(0, 10)).not.toBe(execute.slice(0, 10));
  });

  it('is deterministic', () => {
    const p = { proxy, newImpl, salt };
    expect(encodeScheduleUpgradeMessage(p)).toBe(encodeScheduleUpgradeMessage(p));
  });
});
