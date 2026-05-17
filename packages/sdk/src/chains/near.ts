import type { WormToolChain, TransactionReceipt } from '../chain.js';
import { RpcError } from '../error.js';

export interface NearChainConfig {
  rpcUrl: string;
}

export class NearChain implements WormToolChain {
  readonly chainId = 15n;
  readonly chainName = 'near';

  constructor(_config: NearChainConfig) {}

  async getBalance(_address: string): Promise<bigint> {
    throw new RpcError('near', 'getBalance not yet implemented');
  }

  async call(_to: string, _data: `0x${string}`): Promise<`0x${string}`> {
    throw new RpcError('near', 'call not yet implemented');
  }

  async sendTransaction(_to: string, _data: `0x${string}`, _value?: bigint): Promise<TransactionReceipt> {
    throw new RpcError('near', 'sendTransaction not yet implemented');
  }

  async waitForTransaction(_txHash: string): Promise<TransactionReceipt> {
    throw new RpcError('near', 'waitForTransaction not yet implemented');
  }

  async getCode(_address: string): Promise<`0x${string}`> {
    throw new RpcError('near', 'getCode not yet implemented');
  }
}
