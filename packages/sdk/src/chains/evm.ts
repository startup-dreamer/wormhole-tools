import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain as ViemChain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { WormToolChain, TransactionReceipt } from '../chain.js';
import { RpcError, PrivateKeyError } from '../error.js';
import { getChainById } from '../deploy/registry.js';

export interface EvmChainConfig {
  rpcUrl: string;
  /** Wormhole chain ID */
  wormholeChainId: bigint;
  /** EVM network chain ID (e.g. 1 for mainnet) */
  evmChainId: number;
  /** Private key (0x-prefixed hex). Omit for read-only mode. */
  privateKey?: `0x${string}`;
}

export class EvmChain implements WormToolChain {
  readonly chainId: bigint;
  readonly chainName: string;

  private readonly publicClient: PublicClient;
  private readonly walletClient?: WalletClient;

  constructor(config: EvmChainConfig) {
    this.chainId = config.wormholeChainId;
    const entry = getChainById(Number(config.wormholeChainId));
    this.chainName = entry?.name ?? `evm-${config.wormholeChainId}`;

    const viemChain: ViemChain = {
      id: config.evmChainId,
      name: this.chainName,
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    };

    this.publicClient = createPublicClient({
      chain: viemChain,
      transport: http(config.rpcUrl),
    });

    if (config.privateKey) {
      const account = privateKeyToAccount(config.privateKey);
      this.walletClient = createWalletClient({
        account,
        chain: viemChain,
        transport: http(config.rpcUrl),
      });
    }
  }

  async getBalance(address: string): Promise<bigint> {
    try {
      return await this.publicClient.getBalance({ address: address as `0x${string}` });
    } catch (e) {
      throw new RpcError(this.chainName, `getBalance failed: ${String(e)}`, e);
    }
  }

  async call(to: string, data: `0x${string}`): Promise<`0x${string}`> {
    try {
      const result = await this.publicClient.call({ to: to as `0x${string}`, data });
      return (result.data ?? '0x') as `0x${string}`;
    } catch (e) {
      throw new RpcError(this.chainName, `call to ${to} failed: ${String(e)}`, e);
    }
  }

  async sendTransaction(to: string, data: `0x${string}`, value?: bigint): Promise<TransactionReceipt> {
    if (!this.walletClient) throw new PrivateKeyError();
    try {
      const hash = await this.walletClient.sendTransaction({
        to: to as `0x${string}`,
        data,
        value,
      });
      return this.waitForTransaction(hash);
    } catch (e) {
      if (e instanceof PrivateKeyError) throw e;
      throw new RpcError(this.chainName, `sendTransaction failed: ${String(e)}`, e);
    }
  }

  async waitForTransaction(txHash: string): Promise<TransactionReceipt> {
    try {
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
      });
      return {
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        success: receipt.status === 'success',
        gasUsed: receipt.gasUsed,
      };
    } catch (e) {
      throw new RpcError(this.chainName, `waitForTransaction failed: ${String(e)}`, e);
    }
  }

  async getCode(address: string): Promise<`0x${string}`> {
    try {
      const code = await this.publicClient.getCode({ address: address as `0x${string}` });
      return (code ?? '0x') as `0x${string}`;
    } catch (e) {
      throw new RpcError(this.chainName, `getCode failed: ${String(e)}`, e);
    }
  }
}
