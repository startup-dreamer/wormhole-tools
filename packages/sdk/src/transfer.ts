import type { WormToolChain, TransactionReceipt } from './chain.js';
import { encodeAbiParameters, parseAbiParameters } from 'viem';

export interface TransferParams {
  /** Source chain adapter (must have a private key set). */
  sourceChain: WormToolChain;
  /** Token Bridge contract address on the source chain. */
  tokenBridgeAddress: string;
  /** ERC-20 token address to transfer. */
  tokenAddress: string;
  /** Amount in the token's base unit (wei/lamports/etc). */
  amount: bigint;
  /** Wormhole chain ID of the recipient chain. */
  recipientChain: number;
  /** Recipient address as 32-byte padded hex. */
  recipientAddress: `0x${string}`;
  /** Relayer fee in the token's base unit (0 for manual redemption). */
  relayerFee?: bigint;
  /** Nonce for VAA de-duplication. */
  nonce?: number;
}

export interface TransferResult {
  receipt: TransactionReceipt;
  /** Estimated sequence number for VAA tracking (from tx logs, if available). */
  sequence?: bigint;
}

function encodeTransferData(params: TransferParams): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters('address token, uint256 amount, uint16 recipientChain, bytes32 recipient, uint256 relayerFee, uint32 nonce'),
    [
      params.tokenAddress as `0x${string}`,
      params.amount,
      params.recipientChain,
      params.recipientAddress,
      params.relayerFee ?? 0n,
      params.nonce ?? 0,
    ],
  );
}

/** Initiate a Token Bridge transfer from the source chain. */
export async function initiateTransfer(params: TransferParams): Promise<TransferResult> {
  const data = encodeTransferData(params);
  const receipt = await params.sourceChain.sendTransaction(params.tokenBridgeAddress, data);
  return { receipt };
}
