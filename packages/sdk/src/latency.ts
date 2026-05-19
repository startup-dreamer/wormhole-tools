import { WormToolError } from './error.js';
import { getMessageStatus, MessageStatus, type WormholeNetwork } from './status.js';

export interface LatencyMeasurement {
  emitterChain: number;
  emitterAddress: string;
  sequence: bigint;
  /** Time from tx submission to first Guardian signature, in milliseconds. */
  signingLatencyMs: number;
  network: WormholeNetwork;
}

export interface MeasureLatencyParams {
  emitterChain: number;
  emitterAddress: string;
  sequence: bigint;
  /** Timestamp when the source transaction was submitted (Date.now() value). */
  txSubmittedAt: number;
  network?: WormholeNetwork;
  /** How often to poll the Guardian API, in ms. Default: 2000. */
  pollIntervalMs?: number;
  /** Maximum time to wait for a signature before giving up, in ms. Default: 120_000. */
  timeoutMs?: number;
}

/** Poll the Guardian API until a VAA is signed, then return the measured latency. */
export async function measureSigningLatency(
  params: MeasureLatencyParams,
): Promise<LatencyMeasurement> {
  const {
    emitterChain,
    emitterAddress,
    sequence,
    txSubmittedAt,
    network = 'mainnet',
    pollIntervalMs = 2000,
    timeoutMs = 120_000,
  } = params;

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await getMessageStatus({ emitterChain, emitterAddress, sequence, network });
    if (result.status === MessageStatus.Signed) {
      return {
        emitterChain,
        emitterAddress,
        sequence,
        signingLatencyMs: Date.now() - txSubmittedAt,
        network,
      };
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new WormToolError(
    `Timed out waiting for VAA signature after ${timeoutMs}ms (chain=${emitterChain}, seq=${sequence})`,
  );
}
