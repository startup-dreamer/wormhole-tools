import { keccak_256 } from '@noble/hashes/sha3';
import { WormcraftError } from '../error.js';

function fromHex(h: string): Uint8Array {
  const clean = h.startsWith('0x') ? h.slice(2) : h;
  if (clean.length % 2 !== 0) throw new WormcraftError('odd-length hex');
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

/** Convert a Uint8Array to a 0x-prefixed hex string. */
export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return ('0x' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
}

/** Keccak256-hash a hex-encoded byte string, returning a 0x-prefixed hex hash. */
export function keccak256Hex(hex: string): `0x${string}` {
  return bytesToHex(keccak_256(fromHex(hex)));
}

/**
 * Compute the deterministic CREATE2 address per EIP-1014.
 *
 * @param deployer - Address of the deploying contract (20-byte hex, with or without 0x)
 * @param salt - 32-byte salt as 0x-prefixed hex
 * @param initCodeHash - keccak256 of the init code as 0x-prefixed hex
 */
export function computeCreate2Address(
  deployer: string,
  salt: string,
  initCodeHash: string,
): `0x${string}` {
  const deployerBytes = fromHex(deployer);
  if (deployerBytes.length !== 20) {
    throw new WormcraftError(`deployer must be 20 bytes, got ${deployerBytes.length}`);
  }

  const saltBytes = fromHex(salt);
  if (saltBytes.length !== 32) {
    throw new WormcraftError(`salt must be 32 bytes, got ${saltBytes.length}`);
  }

  const hashBytes = fromHex(initCodeHash);
  if (hashBytes.length !== 32) {
    throw new WormcraftError(`initCodeHash must be 32 bytes, got ${hashBytes.length}`);
  }

  // EIP-1014: keccak256(0xff ++ deployer ++ salt ++ keccak256(initCode))
  const data = new Uint8Array(85);
  data[0] = 0xff;
  data.set(deployerBytes, 1);
  data.set(saltBytes, 21);
  data.set(hashBytes, 53);

  const addressHash = keccak_256(data);
  return bytesToHex(addressHash.slice(12));
}
