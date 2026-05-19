import { describe, it, expect } from 'vitest';
import { parseVaa, encodeVaaHex } from '../../src/vaa/index.js';
import { VaaParseError } from '../../src/error.js';

/** Build a minimal valid VAA binary: version=1, 0 sigs, body of 28 zeros */
function buildMinimalVaa(): { hex: string; bytes: Uint8Array } {
  const header = new Uint8Array(5);
  header[0] = 1;           // version
  // bytes 1-4: guardianSetIndex = 0 (already zero)
  const sigCount = new Uint8Array([0]);
  // timestamp(4) + nonce(4) + emitterChain(2) + emitterAddress(32) + seq(8) + consistencyLevel(1) = 51 bytes
  const fullBody = new Uint8Array(51);
  const full = new Uint8Array(header.length + sigCount.length + fullBody.length);
  full.set(header, 0);
  full.set(sigCount, 5);
  full.set(fullBody, 6);
  const hex = '0x' + Array.from(full, b => b.toString(16).padStart(2, '0')).join('');
  return { hex, bytes: full };
}

describe('parseVaa', () => {
  it('throws VaaParseError on empty input', () => {
    expect(() => parseVaa('')).toThrow(VaaParseError);
  });

  it('throws VaaParseError on invalid hex', () => {
    expect(() => parseVaa('0xZZZZ')).toThrow(VaaParseError);
  });

  it('throws VaaParseError on too-short input', () => {
    expect(() => parseVaa('0x0100')).toThrow(VaaParseError);
  });

  it('parses version and guardianSetIndex fields', () => {
    const { hex } = buildMinimalVaa();
    const result = parseVaa(hex);
    expect(result.version).toBe(1);
    expect(result.guardianSetIndex).toBe(0);
  });

  it('parses zero signatures correctly', () => {
    const { hex } = buildMinimalVaa();
    const result = parseVaa(hex);
    expect(result.signatures).toHaveLength(0);
  });

  it('computes a non-empty hash', () => {
    const { hex } = buildMinimalVaa();
    const result = parseVaa(hex);
    expect(result.hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe('encodeVaaHex', () => {
  it('round-trips a parsed VAA', () => {
    const { hex } = buildMinimalVaa();
    const parsed = parseVaa(hex);
    const re = encodeVaaHex(parsed);
    expect(re.toLowerCase()).toBe(hex.toLowerCase());
  });
});
