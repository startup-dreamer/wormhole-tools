import type { AbiParameter } from 'viem';

export function extractConstructorInputs(abi: unknown[]): readonly AbiParameter[] {
  const ctor = abi.find(
    (e): e is { type: string; inputs: AbiParameter[] } =>
      typeof e === 'object' && e !== null && (e as { type: string }).type === 'constructor',
  );
  return ctor?.inputs ?? [];
}
