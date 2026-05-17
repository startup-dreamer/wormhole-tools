import { describe, it, expect } from 'vitest';
import { detectProxyPattern } from './contracts.js';

describe('detectProxyPattern', () => {
  it('detects UUPS via upgradeTo', () => {
    expect(detectProxyPattern(new Set(['upgradeTo', 'initialize']))).toBe('UUPS');
  });
  it('detects UUPS via upgradeToAndCall', () => {
    expect(detectProxyPattern(new Set(['upgradeToAndCall']))).toBe('UUPS');
  });
  it('detects Transparent via admin + implementation', () => {
    expect(detectProxyPattern(new Set(['admin', 'implementation']))).toBe('Transparent');
  });
  it('detects Beacon via beacon()', () => {
    expect(detectProxyPattern(new Set(['beacon']))).toBe('Beacon');
  });
  it('returns none for plain contracts', () => {
    expect(detectProxyPattern(new Set(['transfer', 'balanceOf']))).toBe('none');
  });
});
