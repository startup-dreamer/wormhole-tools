import type { WormToolChain, TransactionReceipt } from '../chain.js';
import { RpcError } from '../error.js';

export interface AptosChainConfig {
  rpcUrl: string;
}

export class AptosChain implements WormToolChain {
  readonly chainId = 22n;
  readonly chainName = 'aptos';

  constructor(_config: AptosChainConfig) {}

  async getBalance(_address: string): Promise<bigint> {
    throw new RpcError('aptos', 'getBalance not yet implemented');
  }

  async call(_to: string, _data: `0x${string}`): Promise<`0x${string}`> {
    throw new RpcError('aptos', 'call not yet implemented');
  }

  async sendTransaction(_to: string, _data: `0x${string}`, _value?: bigint): Promise<TransactionReceipt> {
    throw new RpcError('aptos', 'sendTransaction not yet implemented');
  }

  async waitForTransaction(_txHash: string): Promise<TransactionReceipt> {
    throw new RpcError('aptos', 'waitForTransaction not yet implemented');
  }

  async getCode(_address: string): Promise<`0x${string}`> {
    throw new RpcError('aptos', 'getCode not yet implemented');
  }
}
