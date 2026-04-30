import type { WormToolChain, TransactionReceipt } from '../chain.js';
import { RpcError } from '../error.js';

export interface SuiChainConfig {
  rpcUrl: string;
}

export class SuiChain implements WormToolChain {
  readonly chainId = 21n;
  readonly chainName = 'sui';

  constructor(_config: SuiChainConfig) {}

  async getBalance(_address: string): Promise<bigint> {
    throw new RpcError('sui', 'getBalance not yet implemented');
  }

  async call(_to: string, _data: `0x${string}`): Promise<`0x${string}`> {
    throw new RpcError('sui', 'call not yet implemented');
  }

  async sendTransaction(_to: string, _data: `0x${string}`, _value?: bigint): Promise<TransactionReceipt> {
    throw new RpcError('sui', 'sendTransaction not yet implemented');
  }

  async waitForTransaction(_txHash: string): Promise<TransactionReceipt> {
    throw new RpcError('sui', 'waitForTransaction not yet implemented');
  }

  async getCode(_address: string): Promise<`0x${string}`> {
    throw new RpcError('sui', 'getCode not yet implemented');
  }
}
