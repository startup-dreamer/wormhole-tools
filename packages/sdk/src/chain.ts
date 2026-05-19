/** Receipt returned after a transaction is mined. */
export interface TransactionReceipt {
  txHash: string;
  blockNumber: bigint;
  success: boolean;
  gasUsed?: bigint;
}

/** Minimal interface every chain adapter must implement. */
export interface WormcraftChain {
  /** Wormhole chain ID (bigint to avoid JS number precision issues). */
  readonly chainId: bigint;
  /** Human-readable chain name (e.g. "ethereum", "solana"). */
  readonly chainName: string;

  /** Returns the native balance of an address in the chain's base unit. */
  getBalance(address: string): Promise<bigint>;

  /** Read-only eth_call / RPC equivalent. */
  call(to: string, data: `0x${string}`): Promise<`0x${string}`>;

  /** Sign and broadcast a transaction. */
  sendTransaction(
    to: string,
    data: `0x${string}`,
    value?: bigint,
  ): Promise<TransactionReceipt>;

  /** Block until a transaction is mined and return its receipt. */
  waitForTransaction(txHash: string): Promise<TransactionReceipt>;

  /** Returns the bytecode at an address (empty = not deployed). */
  getCode(address: string): Promise<`0x${string}`>;
}
