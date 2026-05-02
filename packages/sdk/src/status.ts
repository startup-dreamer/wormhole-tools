const WORMHOLESCAN_MAINNET = 'https://api.wormholescan.io';
const WORMHOLESCAN_TESTNET = 'https://api.testnet.wormholescan.io';

export enum MessageStatus {
  Pending = 'pending',
  Signed = 'signed',
  Relayed = 'relayed',
}

export interface MessageStatusParams {
  emitterChain: number;
  /** 32-byte emitter address as 0x-prefixed hex */
  emitterAddress: string;
  sequence: bigint;
  network?: 'mainnet' | 'testnet';
}

export interface MessageStatusResult {
  status: MessageStatus;
  vaaBytes: string | undefined;
  txHash: string | undefined;
}

/** Query the Wormhole Guardian network for VAA signing status. */
export async function getMessageStatus(
  params: MessageStatusParams,
): Promise<MessageStatusResult> {
  const { emitterChain, emitterAddress, sequence, network = 'mainnet' } = params;
  const base = network === 'testnet' ? WORMHOLESCAN_TESTNET : WORMHOLESCAN_MAINNET;
  const url = `${base}/api/v1/vaas/${emitterChain}/${emitterAddress}/${sequence}`;

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) return { status: MessageStatus.Pending, vaaBytes: undefined, txHash: undefined };
    throw new Error(`Guardian API error ${response.status} for ${url}`);
  }

  const data = await response.json() as { vaaBytes?: string; data?: { txHash?: string } };
  return {
    status: MessageStatus.Signed,
    vaaBytes: data.vaaBytes,
    txHash: data.data?.txHash,
  };
}
