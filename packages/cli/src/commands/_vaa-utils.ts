/** ABI-encode a single `bytes` argument: offset (32) + length (32) + data (padded). */
export function abiEncodeBytes(hex: string): `0x${string}` {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  const byteLen = raw.length / 2;
  const paddedLen = Math.ceil(byteLen / 32) * 32;
  const offset = '0000000000000000000000000000000000000000000000000000000000000020';
  const len = byteLen.toString(16).padStart(64, '0');
  return `0x${offset}${len}${raw.padEnd(paddedLen * 2, '0')}` as `0x${string}`;
}
