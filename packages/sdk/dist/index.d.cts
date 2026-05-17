/** Base class for all worm-tool errors. */
declare class WormToolError extends Error {
    readonly name: string;
    constructor(message: string, cause?: unknown);
}
/** RPC call to a chain endpoint failed. */
declare class RpcError extends WormToolError {
    readonly chain: string;
    constructor(chain: string, message: string, cause?: unknown);
}
/** A chain ID or name is not in the registry. */
declare class ChainNotSupportedError extends WormToolError {
    constructor(chain: string);
}
/** Failed to parse a VAA from hex or base64. */
declare class VaaParseError extends WormToolError {
    constructor(message: string, cause?: unknown);
}
/** An on-chain contract call reverted or errored. */
declare class ContractCallError extends WormToolError {
    readonly address: string;
    constructor(address: string, message: string, cause?: unknown);
}
/** Private key was not found or is invalid. */
declare class PrivateKeyError extends WormToolError {
    constructor();
}
/** Artifact JSON could not be parsed (Hardhat or Foundry). */
declare class ArtifactParseError extends WormToolError {
    constructor(path: string, cause?: unknown);
}

/** Receipt returned after a transaction is mined. */
interface TransactionReceipt {
    txHash: string;
    blockNumber: bigint;
    success: boolean;
    gasUsed?: bigint;
}
/** Minimal interface every chain adapter must implement. */
interface WormToolChain {
    /** Wormhole chain ID (bigint to avoid JS number precision issues). */
    readonly chainId: bigint;
    /** Human-readable chain name (e.g. "ethereum", "solana"). */
    readonly chainName: string;
    /** Returns the native balance of an address in the chain's base unit. */
    getBalance(address: string): Promise<bigint>;
    /** Read-only eth_call / RPC equivalent. */
    call(to: string, data: `0x${string}`): Promise<`0x${string}`>;
    /** Sign and broadcast a transaction. */
    sendTransaction(to: string, data: `0x${string}`, value?: bigint): Promise<TransactionReceipt>;
    /** Block until a transaction is mined and return its receipt. */
    waitForTransaction(txHash: string): Promise<TransactionReceipt>;
    /** Returns the bytecode at an address (empty = not deployed). */
    getCode(address: string): Promise<`0x${string}`>;
}

interface VaaSignature {
    guardianIndex: number;
    /** 65-byte ECDSA signature (r + s + v) as hex */
    signature: `0x${string}`;
}
interface ParsedVaa {
    version: number;
    guardianSetIndex: number;
    signatures: VaaSignature[];
    timestamp: number;
    nonce: number;
    emitterChain: number;
    /** 32-byte emitter address as hex */
    emitterAddress: `0x${string}`;
    sequence: bigint;
    consistencyLevel: number;
    /** Raw payload bytes as hex */
    payload: `0x${string}`;
    /** Keccak256 hash of the VAA body */
    hash: `0x${string}`;
}
/**
 * Parse a VAA from a hex string (with or without 0x prefix) or base64.
 * Throws {@link VaaParseError} on malformed input.
 */
declare function parseVaa(input: string): ParsedVaa;
/** Re-encode a ParsedVaa back to a 0x-prefixed hex string. */
declare function encodeVaaHex(vaa: ParsedVaa): `0x${string}`;

interface EvmChainConfig {
    rpcUrl: string;
    /** Wormhole chain ID */
    wormholeChainId: bigint;
    /** EVM network chain ID (e.g. 1 for mainnet) */
    evmChainId: number;
    /** Private key (0x-prefixed hex). Omit for read-only mode. */
    privateKey?: `0x${string}`;
}
declare class EvmChain implements WormToolChain {
    readonly chainId: bigint;
    readonly chainName: string;
    private readonly publicClient;
    private readonly account;
    private readonly chain;
    private readonly rpcUrl;
    constructor(config: EvmChainConfig);
    getBalance(address: string): Promise<bigint>;
    call(to: string, data: `0x${string}`): Promise<`0x${string}`>;
    sendTransaction(to: string, data: `0x${string}`, value?: bigint): Promise<TransactionReceipt>;
    waitForTransaction(txHash: string): Promise<TransactionReceipt>;
    getCode(address: string): Promise<`0x${string}`>;
}

interface SolanaChainConfig {
    rpcUrl: string;
}
declare class SolanaChain implements WormToolChain {
    readonly chainId = 1n;
    readonly chainName = "solana";
    private readonly connection;
    constructor(config: SolanaChainConfig);
    getBalance(address: string): Promise<bigint>;
    call(_to: string, _data: `0x${string}`): Promise<`0x${string}`>;
    sendTransaction(_to: string, _data: `0x${string}`, _value?: bigint): Promise<TransactionReceipt>;
    waitForTransaction(txHash: string): Promise<TransactionReceipt>;
    getCode(_address: string): Promise<`0x${string}`>;
}

interface AptosChainConfig {
    rpcUrl: string;
}
declare class AptosChain implements WormToolChain {
    readonly chainId = 22n;
    readonly chainName = "aptos";
    constructor(_config: AptosChainConfig);
    getBalance(_address: string): Promise<bigint>;
    call(_to: string, _data: `0x${string}`): Promise<`0x${string}`>;
    sendTransaction(_to: string, _data: `0x${string}`, _value?: bigint): Promise<TransactionReceipt>;
    waitForTransaction(_txHash: string): Promise<TransactionReceipt>;
    getCode(_address: string): Promise<`0x${string}`>;
}

interface NearChainConfig {
    rpcUrl: string;
}
declare class NearChain implements WormToolChain {
    readonly chainId = 15n;
    readonly chainName = "near";
    constructor(_config: NearChainConfig);
    getBalance(_address: string): Promise<bigint>;
    call(_to: string, _data: `0x${string}`): Promise<`0x${string}`>;
    sendTransaction(_to: string, _data: `0x${string}`, _value?: bigint): Promise<TransactionReceipt>;
    waitForTransaction(_txHash: string): Promise<TransactionReceipt>;
    getCode(_address: string): Promise<`0x${string}`>;
}

interface SuiChainConfig {
    rpcUrl: string;
}
declare class SuiChain implements WormToolChain {
    readonly chainId = 21n;
    readonly chainName = "sui";
    constructor(_config: SuiChainConfig);
    getBalance(_address: string): Promise<bigint>;
    call(_to: string, _data: `0x${string}`): Promise<`0x${string}`>;
    sendTransaction(_to: string, _data: `0x${string}`, _value?: bigint): Promise<TransactionReceipt>;
    waitForTransaction(_txHash: string): Promise<TransactionReceipt>;
    getCode(_address: string): Promise<`0x${string}`>;
}

/** Extract deployable bytecode from a Hardhat or Foundry artifact JSON. */
declare function extractBytecode(artifact: unknown, path?: string): `0x${string}`;

/**
 * Compute the deterministic CREATE2 address per EIP-1014.
 *
 * @param deployer - Address of the deploying contract (20-byte hex, with or without 0x)
 * @param salt - 32-byte salt as 0x-prefixed hex
 * @param initCodeHash - keccak256 of the init code as 0x-prefixed hex
 */
declare function computeCreate2Address(deployer: string, salt: string, initCodeHash: string): `0x${string}`;

interface ChainEntry {
    wormholeChainId: number;
    name: string;
    /** EVM chain ID (undefined for non-EVM chains) */
    evmChainId?: number;
    /** Default public RPC URL */
    defaultRpc?: string;
    /** Wormhole core contract address on this chain */
    wormholeCore?: `0x${string}`;
    /** WormToolDeployer contract address (set after deployment) */
    wormToolDeployer?: `0x${string}`;
    isTestnet?: boolean;
}
declare const CHAIN_REGISTRY: ChainEntry[];
declare function getChainById(wormholeChainId: number): ChainEntry | undefined;
declare function getChainByName(name: string): ChainEntry | undefined;

/** Returns true if a contract is deployed at the given address on the given chain. */
declare function checkContractDeployed(chain: WormToolChain, address: string): Promise<boolean>;

interface DeployMessageParams {
    bytecode: `0x${string}`;
    constructorArgs?: `0x${string}`;
    salt: `0x${string}`;
    targetChains: number[];
}
interface CallMessageParams {
    target: `0x${string}`;
    calldata: `0x${string}`;
    targetChains: number[];
}
interface UpgradeMessageParams {
    proxy: `0x${string}`;
    newImpl: `0x${string}`;
    targetChains: number[];
}
/** Encode a MSG_DEPLOY (0x01) payload for WormToolDeployer. */
declare function encodeDeployMessage(p: DeployMessageParams): `0x${string}`;
/** Encode a MSG_CALL (0x02) payload for WormToolDeployer. */
declare function encodeCallMessage(p: CallMessageParams): `0x${string}`;
/** Encode a MSG_UPGRADE (0x03) payload for WormToolDeployer. */
declare function encodeUpgradeMessage(p: UpgradeMessageParams): `0x${string}`;

interface ChainDeployResult {
    chain: string;
    chainId: bigint;
    receipt: TransactionReceipt;
}
interface DeployAcrossChainsParams {
    chains: WormToolChain[];
    bytecode: `0x${string}`;
    constructorArgs?: `0x${string}`;
    salt: `0x${string}`;
    wormToolDeployerAddress: string;
}
/** Deploy bytecode to multiple chains in parallel via WormToolDeployer. */
declare function deployAcrossChains(params: DeployAcrossChainsParams): Promise<ChainDeployResult[]>;
interface CallAcrossChainsParams {
    chains: WormToolChain[];
    target: `0x${string}`;
    calldata: `0x${string}`;
    wormToolDeployerAddress: string;
}
/** Call a function on a deployed contract across multiple chains in parallel. */
declare function callAcrossChains(params: CallAcrossChainsParams): Promise<ChainDeployResult[]>;
interface UpgradeAcrossChainsParams {
    chains: WormToolChain[];
    proxy: `0x${string}`;
    newImpl: `0x${string}`;
    wormToolDeployerAddress: string;
}
/** Upgrade a proxy contract to a new implementation across multiple chains in parallel. */
declare function upgradeAcrossChains(params: UpgradeAcrossChainsParams): Promise<ChainDeployResult[]>;

declare enum MessageStatus {
    Pending = "pending",
    Signed = "signed",
    Relayed = "relayed"
}
interface MessageStatusParams {
    emitterChain: number;
    /** 32-byte emitter address as 0x-prefixed hex */
    emitterAddress: string;
    sequence: bigint;
    network?: 'mainnet' | 'testnet';
}
interface MessageStatusResult {
    status: MessageStatus;
    vaaBytes: string | undefined;
    txHash: string | undefined;
}
/** Query the Wormhole Guardian network for VAA signing status. */
declare function getMessageStatus(params: MessageStatusParams): Promise<MessageStatusResult>;

interface ChainInfoSummary {
    name: string;
    wormholeChainId: number;
    evmChainId: number | undefined;
    rpcUrl: string | undefined;
    wormholeCore: string | undefined;
    finality: string;
    isTestnet: boolean;
}
/** Look up chain metadata by name or wormhole chain ID. */
declare function getChainInfo(nameOrId: string | number): ChainInfoSummary;

interface TransferParams {
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
interface TransferResult {
    receipt: TransactionReceipt;
    /** Estimated sequence number for VAA tracking (from tx logs, if available). */
    sequence?: bigint;
}
/** Initiate a Token Bridge transfer from the source chain. */
declare function initiateTransfer(params: TransferParams): Promise<TransferResult>;

interface TokenInfo {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    /** Wormhole chain ID where this is the native token */
    nativeChain?: number;
}
/** Fetch ERC-20 token metadata from a chain. */
declare function getTokenInfo(chain: WormToolChain, tokenAddress: string): Promise<TokenInfo>;
interface TokenBalance {
    address: string;
    balance: bigint;
    decimals: number;
    symbol: string;
}
/** Fetch the ERC-20 token balance of a wallet on a given chain. */
declare function getTokenBalance(chain: WormToolChain, tokenAddress: string, walletAddress: string): Promise<TokenBalance>;

interface LatencyMeasurement {
    emitterChain: number;
    emitterAddress: string;
    sequence: bigint;
    /** Time from tx submission to first Guardian signature, in milliseconds. */
    signingLatencyMs: number;
    network: 'mainnet' | 'testnet';
}
interface MeasureLatencyParams {
    emitterChain: number;
    emitterAddress: string;
    sequence: bigint;
    /** Timestamp when the source transaction was submitted (Date.now() value). */
    txSubmittedAt: number;
    network?: 'mainnet' | 'testnet';
    /** How often to poll the Guardian API, in ms. Default: 2000. */
    pollIntervalMs?: number;
    /** Maximum time to wait for a signature before giving up, in ms. Default: 120_000. */
    timeoutMs?: number;
}
/** Poll the Guardian API until a VAA is signed, then return the measured latency. */
declare function measureSigningLatency(params: MeasureLatencyParams): Promise<LatencyMeasurement>;

interface GenerateVaaParams {
    emitterChain: number;
    /** 32-byte emitter address as 0x-prefixed hex */
    emitterAddress: `0x${string}`;
    sequence: bigint;
    payload: `0x${string}`;
    guardianSetIndex?: number;
    timestamp?: number;
    nonce?: number;
    consistencyLevel?: number;
}
/**
 * Build a synthetic VAA for testing purposes.
 * The VAA will have zero guardian signatures — it should NOT be used on mainnet.
 */
declare function generateTestVaa(params: GenerateVaaParams): ParsedVaa;
/** Generate a test VAA and encode it as a 0x-prefixed hex string. */
declare function generateTestVaaHex(params: GenerateVaaParams): `0x${string}`;

declare const SDK_VERSION = "0.0.1";

export { AptosChain, type AptosChainConfig, ArtifactParseError, CHAIN_REGISTRY, type CallAcrossChainsParams, type CallMessageParams, type ChainDeployResult, type ChainEntry, type ChainInfoSummary, ChainNotSupportedError, ContractCallError, type DeployAcrossChainsParams, type DeployMessageParams, EvmChain, type EvmChainConfig, type GenerateVaaParams, type LatencyMeasurement, type MeasureLatencyParams, MessageStatus, type MessageStatusParams, type MessageStatusResult, NearChain, type NearChainConfig, type ParsedVaa, PrivateKeyError, RpcError, SDK_VERSION, SolanaChain, type SolanaChainConfig, SuiChain, type SuiChainConfig, type TokenBalance, type TokenInfo, type TransactionReceipt, type TransferParams, type TransferResult, type UpgradeAcrossChainsParams, type UpgradeMessageParams, VaaParseError, type VaaSignature, type WormToolChain, WormToolError, callAcrossChains, checkContractDeployed, computeCreate2Address, deployAcrossChains, encodeCallMessage, encodeDeployMessage, encodeUpgradeMessage, encodeVaaHex, extractBytecode, generateTestVaa, generateTestVaaHex, getChainById, getChainByName, getChainInfo, getMessageStatus, getTokenBalance, getTokenInfo, initiateTransfer, measureSigningLatency, parseVaa, upgradeAcrossChains };
