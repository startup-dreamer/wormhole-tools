import type { WormcraftChain } from './chain.js';
import { encodeAbiParameters, parseAbiParameters, decodeAbiParameters } from 'viem';

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  /** Wormhole chain ID where this is the native token */
  nativeChain?: number;
}

const ERC20_NAME_SELECTOR = '0x06fdde03' as `0x${string}`;
const ERC20_SYMBOL_SELECTOR = '0x95d89b41' as `0x${string}`;
const ERC20_DECIMALS_SELECTOR = '0x313ce567' as `0x${string}`;

async function callString(chain: WormcraftChain, token: string, selector: `0x${string}`): Promise<string> {
  const result = await chain.call(token, selector);
  if (result === '0x' || result.length <= 2) return '';
  const [value] = decodeAbiParameters(parseAbiParameters('string'), result);
  return value as string;
}

async function callUint8(chain: WormcraftChain, token: string, selector: `0x${string}`): Promise<number> {
  const result = await chain.call(token, selector);
  if (result === '0x' || result.length <= 2) return 18;
  const [value] = decodeAbiParameters(parseAbiParameters('uint8'), result);
  return Number(value);
}

/** Fetch ERC-20 token metadata from a chain. */
export async function getTokenInfo(chain: WormcraftChain, tokenAddress: string): Promise<TokenInfo> {
  const [name, symbol, decimals] = await Promise.all([
    callString(chain, tokenAddress, ERC20_NAME_SELECTOR),
    callString(chain, tokenAddress, ERC20_SYMBOL_SELECTOR),
    callUint8(chain, tokenAddress, ERC20_DECIMALS_SELECTOR),
  ]);

  return { address: tokenAddress, name, symbol, decimals };
}

export interface TokenBalance {
  address: string;
  balance: bigint;
  decimals: number;
  symbol: string;
}

const ERC20_BALANCE_OF_SELECTOR = '0x70a08231' as `0x${string}`;

/** Fetch the ERC-20 token balance of a wallet on a given chain. */
export async function getTokenBalance(
  chain: WormcraftChain,
  tokenAddress: string,
  walletAddress: string,
): Promise<TokenBalance> {
  const calldata = (ERC20_BALANCE_OF_SELECTOR +
    encodeAbiParameters(parseAbiParameters('address'), [walletAddress as `0x${string}`]).slice(2)) as `0x${string}`;

  const result = await chain.call(tokenAddress, calldata);
  let balance = 0n;
  if (result !== '0x' && result.length > 2) {
    const [v] = decodeAbiParameters(parseAbiParameters('uint256'), result);
    balance = v as bigint;
  }

  const info = await getTokenInfo(chain, tokenAddress);
  return { address: tokenAddress, balance, decimals: info.decimals, symbol: info.symbol };
}
