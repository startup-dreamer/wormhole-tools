import { encodeAbiParameters, parseAbiParameters, encodeFunctionData } from 'viem';

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

/** Encode a MSG_DEPLOY (0x01) payload for WormcraftDeployer. */
export function encodeDeployMessage(p: DeployMessageParams): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters('uint8 msgType, bytes bytecode, bytes constructorArgs, bytes32 salt, uint16[] targetChains'),
    [1, p.bytecode, p.constructorArgs ?? '0x', p.salt as `0x${string}`, p.targetChains],
  );
}

/** Encode a MSG_CALL (0x02) payload for WormcraftDeployer. */
export function encodeCallMessage(p: CallMessageParams): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters('uint8 msgType, address target, bytes calldata_, uint16[] targetChains'),
    [2, p.target, p.calldata, p.targetChains],
  );
}

/** Encode a MSG_UPGRADE (0x03) payload for WormcraftDeployer. */
export function encodeUpgradeMessage(p: UpgradeMessageParams): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters('uint8 msgType, address proxy, address newImpl, uint16[] targetChains'),
    [3, p.proxy, p.newImpl, p.targetChains],
  );
}

export interface AdminModuleUpgradeParams {
  proxy:   `0x${string}`;
  newImpl: `0x${string}`;
  salt:    `0x${string}`;
}

const SCHEDULE_ABI = [{
  name: 'scheduleOrUpgrade',
  type: 'function',
  inputs: [
    { name: 'proxy',   type: 'address' },
    { name: 'newImpl', type: 'address' },
    { name: 'salt',    type: 'bytes32' },
  ],
}] as const;

const EXECUTE_ABI = [{
  name: 'executeTimelocked',
  type: 'function',
  inputs: [
    { name: 'proxy',   type: 'address' },
    { name: 'newImpl', type: 'address' },
    { name: 'salt',    type: 'bytes32' },
  ],
}] as const;

/** Encode calldata for WormcraftAdminModule.scheduleOrUpgrade(). */
export function encodeScheduleUpgradeMessage(p: AdminModuleUpgradeParams): `0x${string}` {
  return encodeFunctionData({
    abi: SCHEDULE_ABI,
    functionName: 'scheduleOrUpgrade',
    args: [p.proxy, p.newImpl, p.salt],
  });
}

/** Encode calldata for WormcraftAdminModule.executeTimelocked(). */
export function encodeExecuteUpgradeMessage(p: AdminModuleUpgradeParams): `0x${string}` {
  return encodeFunctionData({
    abi: EXECUTE_ABI,
    functionName: 'executeTimelocked',
    args: [p.proxy, p.newImpl, p.salt],
  });
}
