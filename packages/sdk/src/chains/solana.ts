import { Connection, PublicKey } from '@solana/web3.js';
import type { WormcraftChain, TransactionReceipt } from '../chain.js';
import { RpcError } from '../error.js';

export interface SolanaChainConfig {
  rpcUrl: string;
}

export class SolanaChain implements WormcraftChain {
  readonly chainId = 1n;
  readonly chainName = 'solana';

  private readonly connection: Connection;

  constructor(config: SolanaChainConfig) {
    this.connection = new Connection(config.rpcUrl, 'confirmed');
  }

  async getBalance(address: string): Promise<bigint> {
    try {
      const pk = new PublicKey(address);
      const lamports = await this.connection.getBalance(pk);
      return BigInt(lamports);
    } catch (e) {
      throw new RpcError('solana', `getBalance failed: ${String(e)}`, e);
    }
  }

  async call(_to: string, _data: `0x${string}`): Promise<`0x${string}`> {
    throw new RpcError('solana', 'eth_call not supported on Solana');
  }

  async sendTransaction(_to: string, _data: `0x${string}`, _value?: bigint): Promise<TransactionReceipt> {
    throw new RpcError('solana', 'sendTransaction not yet implemented for Solana');
  }

  async waitForTransaction(txHash: string): Promise<TransactionReceipt> {
    try {
      const sig = await this.connection.getSignatureStatus(txHash, { searchTransactionHistory: true });
      const status = sig.value;
      return {
        txHash,
        blockNumber: BigInt(status?.slot ?? 0),
        success: status?.err == null,
      };
    } catch (e) {
      throw new RpcError('solana', `waitForTransaction failed: ${String(e)}`, e);
    }
  }

  async getCode(_address: string): Promise<`0x${string}`> {
    throw new RpcError('solana', 'getCode not applicable to Solana');
  }
}
