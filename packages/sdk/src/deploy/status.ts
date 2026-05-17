import type { WormToolChain } from '../chain.js';

/** Returns true if a contract is deployed at the given address on the given chain. */
export async function checkContractDeployed(
  chain: WormToolChain,
  address: string,
): Promise<boolean> {
  const code = await chain.getCode(address);
  return code !== '0x' && code.length > 2;
}
