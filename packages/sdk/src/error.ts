/** Base class for all worm-tool errors. */
export class WormToolError extends Error {
  override readonly name: string;

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** RPC call to a chain endpoint failed. */
export class RpcError extends WormToolError {
  constructor(
    public readonly chain: string,
    message: string,
    cause?: unknown,
  ) {
    super(`[${chain}] RPC error: ${message}`, cause);
  }
}

/** A chain ID or name is not in the registry. */
export class ChainNotSupportedError extends WormToolError {
  constructor(chain: string) {
    super(`Chain not supported: ${chain}`);
  }
}

/** Failed to parse a VAA from hex or base64. */
export class VaaParseError extends WormToolError {
  constructor(message: string, cause?: unknown) {
    super(`VAA parse error: ${message}`, cause);
  }
}

/** An on-chain contract call reverted or errored. */
export class ContractCallError extends WormToolError {
  constructor(
    public readonly address: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Contract call to ${address} failed: ${message}`, cause);
  }
}

/** Private key was not found or is invalid. */
export class PrivateKeyError extends WormToolError {
  constructor() {
    super('Private key not found or invalid — set WORM_TOOL_PRIVATE_KEY');
  }
}

/** Artifact JSON could not be parsed (Hardhat or Foundry). */
export class ArtifactParseError extends WormToolError {
  constructor(path: string, cause?: unknown) {
    super(`Failed to parse artifact at ${path}`, cause);
  }
}
