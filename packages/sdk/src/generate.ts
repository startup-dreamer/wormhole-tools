import type { ParsedVaa, VaaSignature } from './vaa/index.js';
import { encodeVaaHex } from './vaa/index.js';
import { bytesToHex } from './deploy/create2.js';
import { keccak_256 } from '@noble/hashes/sha3';

export interface GenerateVaaParams {
  emitterChain: number;
  /** 32-byte emitter address as 0x-prefixed hex */
  emitterAddress: `0x${string}`;
  sequence: bigint;
  payload: `0x${string}`;
  guardianSetIndex?: number;
  timestamp?: number;
  nonce?: number;
  consistencyLevel?: number;
}

/**
 * Build a synthetic VAA for testing purposes.
 * The VAA will have zero guardian signatures — it should NOT be used on mainnet.
 */
export function generateTestVaa(params: GenerateVaaParams): ParsedVaa {
  const {
    emitterChain,
    emitterAddress,
    sequence,
    payload,
    guardianSetIndex = 0,
    timestamp = Math.floor(Date.now() / 1000),
    nonce = 0,
    consistencyLevel = 1,
  } = params;

  const bodyParts: number[] = [];
  const writeU32 = (v: number): void => {
    bodyParts.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  };
  const writeU16 = (v: number): void => { bodyParts.push((v >> 8) & 0xff, v & 0xff); };
  const writeU64 = (v: bigint): void => {
    for (let i = 7; i >= 0; i--) bodyParts.push(Number((v >> BigInt(i * 8)) & 0xffn));
  };
  const writeHex = (h: string): void => {
    const clean = h.startsWith('0x') ? h.slice(2) : h;
    for (let i = 0; i < clean.length; i += 2) bodyParts.push(parseInt(clean.slice(i, i + 2), 16));
  };

  writeU32(timestamp);
  writeU32(nonce);
  writeU16(emitterChain);
  writeHex(emitterAddress);
  writeU64(sequence);
  bodyParts.push(consistencyLevel);
  writeHex(payload);

  const bodyBytes = new Uint8Array(bodyParts);
  const hash = bytesToHex(keccak_256(bodyBytes));

  const signatures: VaaSignature[] = [];

  return {
    version: 1,
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
}

/** Generate a test VAA and encode it as a 0x-prefixed hex string. */
export function generateTestVaaHex(params: GenerateVaaParams): `0x${string}` {
  return encodeVaaHex(generateTestVaa(params));
}
