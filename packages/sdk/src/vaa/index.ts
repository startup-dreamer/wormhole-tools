import { keccak_256 } from '@noble/hashes/sha3';
import { VaaParseError } from '../error.js';

export interface VaaSignature {
  guardianIndex: number;
  /** 65-byte ECDSA signature (r + s + v) as hex */
  signature: `0x${string}`;
}

export interface ParsedVaa {
  version: number;
  guardianSetIndex: number;
  signatures: VaaSignature[];
  timestamp: number;
  nonce: number;
  emitterChain: number;
  /** 32-byte emitter address as hex */
  emitterAddress: `0x${string}`;
  sequence: bigint;
  consistencyLevel: number;
  /** Raw payload bytes as hex */
  payload: `0x${string}`;
  /** Keccak256 hash of the VAA body */
  hash: `0x${string}`;
}

function hexToBytes(input: string): Uint8Array {
  if (!input) throw new VaaParseError('empty input');
  const clean = input.startsWith('0x') || input.startsWith('0X') ? input.slice(2) : input;
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new VaaParseError(`invalid hex: ${input.slice(0, 24)}`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): `0x${string}` {
  return ('0x' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
}

function base64ToBytes(input: string): Uint8Array {
  const raw = atob(input);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Parse a VAA from a hex string (with or without 0x prefix) or base64.
 * Throws {@link VaaParseError} on malformed input.
 */
export function parseVaa(input: string): ParsedVaa {
  if (!input || !input.trim()) throw new VaaParseError('empty input');

  const trimmed = input.trim();
  let bytes: Uint8Array;

  try {
    if (/^(0x)?[0-9a-fA-F]+$/.test(trimmed)) {
      bytes = hexToBytes(trimmed);
    } else {
      bytes = base64ToBytes(trimmed);
    }
  } catch (e) {
    if (e instanceof VaaParseError) throw e;
    throw new VaaParseError('failed to decode input', e);
  }

  if (bytes.length < 6) throw new VaaParseError('VAA too short');

  let offset = 0;

  const readU8 = (): number => {
    if (offset >= bytes.length) throw new VaaParseError('unexpected end of VAA (u8)');
    return bytes[offset++]!;
  };
  const readU16 = (): number => {
    if (offset + 2 > bytes.length) throw new VaaParseError('unexpected end of VAA (u16)');
    const v = ((bytes[offset]! << 8) | bytes[offset + 1]!) >>> 0;
    offset += 2;
    return v;
  };
  const readU32 = (): number => {
    if (offset + 4 > bytes.length) throw new VaaParseError('unexpected end of VAA (u32)');
    const v = (((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0);
    offset += 4;
    return v;
  };
  const readU64 = (): bigint => {
    if (offset + 8 > bytes.length) throw new VaaParseError('unexpected end of VAA (u64)');
    let v = 0n;
    for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(bytes[offset++]!);
    return v;
  };
  const readBytes = (n: number): Uint8Array => {
    if (offset + n > bytes.length) throw new VaaParseError(`unexpected end of VAA (${n} bytes)`);
    const slice = bytes.slice(offset, offset + n);
    offset += n;
    return slice;
  };

  try {
    const version = readU8();
    const guardianSetIndex = readU32();
    const sigCount = readU8();

    const signatures: VaaSignature[] = [];
    for (let i = 0; i < sigCount; i++) {
      const guardianIndex = readU8();
      const sig = readBytes(65);
      signatures.push({ guardianIndex, signature: toHex(sig) });
    }

    const bodyStart = offset;

    const timestamp = readU32();
    const nonce = readU32();
    const emitterChain = readU16();
    const emitterAddress = toHex(readBytes(32));
    const sequence = readU64();
    const consistencyLevel = readU8();
    const payload = toHex(bytes.slice(offset));

    const bodyBytes = bytes.slice(bodyStart);
    const hash = toHex(keccak_256(bodyBytes));

    return {
      version,
      guardianSetIndex,
      signatures,
      timestamp,
      nonce,
      emitterChain,
      emitterAddress,
      sequence,
      consistencyLevel,
      payload,
      hash,
    };
  } catch (e) {
    if (e instanceof VaaParseError) throw e;
    throw new VaaParseError('malformed VAA binary', e);
  }
}

/** Re-encode a ParsedVaa back to a 0x-prefixed hex string. */
export function encodeVaaHex(vaa: ParsedVaa): `0x${string}` {
  const parts: number[] = [];

  const writeU8 = (v: number): void => { parts.push(v & 0xff); };
  const writeU16 = (v: number): void => { parts.push((v >> 8) & 0xff, v & 0xff); };
  const writeU32 = (v: number): void => {
    parts.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  };
  const writeU64 = (v: bigint): void => {
    for (let i = 7; i >= 0; i--) parts.push(Number((v >> BigInt(i * 8)) & 0xffn));
  };
  const writeHex = (h: string): void => {
    const clean = h.startsWith('0x') ? h.slice(2) : h;
    for (let i = 0; i < clean.length; i += 2) parts.push(parseInt(clean.slice(i, i + 2), 16));
  };

  writeU8(vaa.version);
  writeU32(vaa.guardianSetIndex);
  writeU8(vaa.signatures.length);
  for (const sig of vaa.signatures) {
    writeU8(sig.guardianIndex);
    writeHex(sig.signature);
  }
  writeU32(vaa.timestamp);
  writeU32(vaa.nonce);
  writeU16(vaa.emitterChain);
  writeHex(vaa.emitterAddress);
  writeU64(vaa.sequence);
  writeU8(vaa.consistencyLevel);
  writeHex(vaa.payload);

  return ('0x' + parts.map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
}
