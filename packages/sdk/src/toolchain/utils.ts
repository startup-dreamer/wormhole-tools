import type { AbiParameter } from 'viem';

/** @internal Extract constructor inputs from a raw ABI array. */
export function extractConstructorInputs(abi: unknown[]): readonly AbiParameter[] {
  const ctor = abi.find(
    (e): e is { type: string; inputs: AbiParameter[] } =>
      typeof e === 'object' && e !== null && (e as { type: string }).type === 'constructor',
  );
  return ctor?.inputs ?? [];
}
