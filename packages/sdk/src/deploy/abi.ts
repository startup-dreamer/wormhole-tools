import { encodeAbiParameters, parseAbiParameters } from 'viem';

export interface DeployMessageParams {
  bytecode: `0x${string}`;
  constructorArgs?: `0x${string}`;
  salt: `0x${string}`;
  targetChains: number[];
}

export interface CallMessageParams {
  target: `0x${string}`;
  calldata: `0x${string}`;
  targetChains: number[];
}

export interface UpgradeMessageParams {
  proxy: `0x${string}`;
  newImpl: `0x${string}`;
  targetChains: number[];
}

/** Encode a MSG_DEPLOY (0x01) payload for WormToolDeployer. */
export function encodeDeployMessage(p: DeployMessageParams): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters('uint8 msgType, bytes bytecode, bytes constructorArgs, bytes32 salt, uint16[] targetChains'),
    [1, p.bytecode, p.constructorArgs ?? '0x', p.salt as `0x${string}`, p.targetChains],
  );
}

/** Encode a MSG_CALL (0x02) payload for WormToolDeployer. */
export function encodeCallMessage(p: CallMessageParams): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters('uint8 msgType, address target, bytes calldata_, uint16[] targetChains'),
    [2, p.target, p.calldata, p.targetChains],
  );
}

/** Encode a MSG_UPGRADE (0x03) payload for WormToolDeployer. */
export function encodeUpgradeMessage(p: UpgradeMessageParams): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters('uint8 msgType, address proxy, address newImpl, uint16[] targetChains'),
    [3, p.proxy, p.newImpl, p.targetChains],
  );
}
