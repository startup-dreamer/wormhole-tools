import { AbiParameter } from 'viem';

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

/** Thrown when a deploy manifest cannot be parsed or is structurally invalid. */
declare class ManifestParseError extends WormToolError {
    constructor(message: string, cause?: unknown);
}
/** RPC and chain identity for a single network entry. */
interface NetworkConfig {
    chain: string;
    rpc: string;
}
/** A single constructor argument for a contract deployment. */
interface ContractArg {
    type: string;
    value: string;
}
/** Configuration for deploying one contract. */
interface ContractDeployConfig {
    name: string;
    contract: string;
    args?: ContractArg[];
    verify?: boolean;
}
/** Deployment execution strategy across chains. */
type DeployStrategy = 'cross-chain' | 'sequential';
/** A group of contracts deployed together to a set of chains. */
interface DeployTarget {
    contracts: string[];
    chains: string[];
    strategy: DeployStrategy;
}
/** Top-level structure of a `worm-tool.deploy.yaml` file. */
interface DeployManifest {
    version: string;
    networks: Record<string, NetworkConfig>;
    deployer: {
        salt: string;
    };
    contracts: ContractDeployConfig[];
    deploy_targets: DeployTarget[];
}
/**
 * Replaces `${VAR}` placeholders in `value` with the corresponding
 * `process.env[VAR]` value. Unknown variables are left as the literal
 * `${VAR}` string.
 */
declare function resolveEnvVars(value: string): string;
/**
 * Parse a `worm-tool.deploy.yaml` string into a validated {@link DeployManifest}.
 *
 * All string values have `${VAR}` placeholders resolved against `process.env`
 * before validation. Unknown placeholders are kept as-is.
 *
 * @throws {ManifestParseError} on invalid YAML, missing required fields, or
 *   an unrecognised `deploy_targets[].strategy` value.
 */
declare function parseManifest(yaml: string): DeployManifest;

/** A single deployed contract record. */
interface AddressBookEntry {
    address: `0x${string}`;
    txHash?: string;
    blockNumber?: number;
    /** ISO 8601 timestamp of when the entry was recorded. */
    deployedAt: string;
    verified?: boolean;
}
/**
 * Persistent address book stored at `<root>/deployments/worm-tool.json`.
 * `contracts` is keyed by contractName → chainName → entry.
 */
interface AddressBook {
    version: '1';
    salt: string;
    contracts: Record<string, Record<string, AddressBookEntry>>;
}
/** Partial address book returned by import functions (no version/salt wrapper). */
type PartialBook = Record<string, Record<string, AddressBookEntry>>;
/**
 * Load the address book from `<root>/deployments/worm-tool.json`.
 * Returns an empty book when the file does not exist.
 */
declare function loadAddressBook(root: string): Promise<AddressBook>;
/**
 * Persist the address book to `<root>/deployments/worm-tool.json`.
 * Creates the `deployments/` directory if it does not exist.
 */
declare function saveAddressBook(root: string, book: AddressBook): Promise<void>;
/**
 * Retrieve the deployed address for a contract on a given chain.
 * Returns `undefined` if no entry exists.
 */
declare function getAddress(book: AddressBook, contractName: string, chain: string): `0x${string}` | undefined;
/**
 * Return `true` if a deployment entry exists for the contract on the given chain.
 */
declare function isDeployed(book: AddressBook, contractName: string, chain: string): boolean;
/**
 * Pure function: return a new address book with the entry set for
 * `contractName` on `chain`. Does not mutate the original book.
 */
declare function setAddress(book: AddressBook, contractName: string, chain: string, entry: AddressBookEntry): AddressBook;
/**
 * Merge a {@link PartialBook} (from {@link importFromFoundryBroadcast} or
 * {@link importFromHardhatDeploy}) into an {@link AddressBook}.
 * Existing entries are NOT overwritten — only new contract/chain pairs are added.
 */
declare function mergePartialBook(book: AddressBook, partial: PartialBook): AddressBook;
/**
 * Walk `<root>/broadcast/` recursively, find every `run-latest.json`, and
 * extract CREATE transactions. Uses `CHAIN_REGISTRY` to map EVM chain ID →
 * chain name. Returns a `PartialBook` ready to merge into an `AddressBook`.
 */
declare function importFromFoundryBroadcast(root: string): Promise<PartialBook>;
/**
 * Walk `<root>/deployments/<networkName>/<Contract>.json` (hardhat-deploy
 * layout), skipping `worm-tool.json`. Returns a `PartialBook` ready to merge
 * into an `AddressBook`.
 */
declare function importFromHardhatDeploy(root: string): Promise<PartialBook>;

type ToolchainType = 'foundry' | 'hardhat';
/** Detected toolchain with resolved artifact directory. */
interface ToolchainInfo {
    type: ToolchainType;
    root: string;
    artifactDir: string;
}
/** A single storage variable from the Solidity compiler's storage layout output. */
interface StorageVariable {
    label: string;
    type: string;
    slot: string;
    offset: number;
}
/** Storage layout as emitted by solc (Foundry passes this through directly). */
interface StorageLayout {
    storage: StorageVariable[];
    types: Record<string, {
        encoding: string;
        label: string;
        numberOfBytes: string;
    }>;
}
/** Normalized contract metadata, toolchain-agnostic. */
interface ContractMeta {
    name: string;
    sourcePath: string;
    artifactPath: string;
    abi: readonly unknown[];
    bytecode: `0x${string}`;
    constructorInputs: readonly AbiParameter[];
    /** True when bytecode is empty (abstract contract or interface). */
    isAbstract: boolean;
    /** True when the artifact appears to be a pure interface (empty bytecode + only function/event/error entries). */
    isInterface: boolean;
    compilerVersion: string;
    storageLayout?: StorageLayout;
}

/** Thrown when the deployment engine encounters an unrecoverable error. */
declare class EngineError extends WormToolError {
    constructor(message: string, cause?: unknown);
}
/**
 * Resolve a single template expression in a constructor arg value.
 *
 * Supported patterns:
 * - `{{contracts.Name.address}}` — look up `Name` in `deployedAddresses`
 * - `{{env.VAR}}` — read `process.env[VAR]`
 * - Literal (no `{{`) — returned as-is
 *
 * @throws {EngineError} when a referenced contract or env var is missing,
 *   or when the template pattern is not recognised.
 */
declare function resolveTemplateArg(value: string, deployedAddresses: Record<string, `0x${string}`>): string;
/**
 * Sort contracts in topological (dependency-first) order.
 *
 * Reads `{{contracts.X.address}}` references from each contract's args to
 * build a dependency graph, then performs a depth-first topological sort.
 *
 * @throws {EngineError} containing the word `"circular"` when a dependency
 *   cycle is detected.
 */
declare function buildDependencyOrder(contracts: DeployManifest['contracts'], 
/** Names of contracts whose addresses are already known (e.g. from address book). */
externallyResolved?: ReadonlySet<string>): DeployManifest['contracts'];
/** A single entry in a deployment dry-run plan. */
interface DeployPlanEntry {
    name: string;
    contract: string;
    alreadyDeployed: boolean;
    targetChains: string[];
    strategy: string;
}
/**
 * Build a dry-run deployment plan from a manifest and an address book.
 *
 * For each contract in each deploy_target, checks whether it is already
 * deployed on all target chains via the address book.
 */
declare function buildDeployPlan(manifest: DeployManifest, book: AddressBook): DeployPlanEntry[];
/** Options for {@link runDeployment}. */
interface EngineRunOptions {
    manifest: DeployManifest;
    book: AddressBook;
    artifacts: ContractMeta[];
    /**
     * Callback that performs the actual deployment.
     * Called once per contract/target combination that needs deploying.
     */
    deployFn: (params: {
        contractName: string;
        bytecode: `0x${string}`;
        constructorArgs: `0x${string}`;
        salt: `0x${string}`;
        chains: string[];
        strategy: string;
    }) => Promise<Array<{
        chain: string;
        address: `0x${string}`;
        txHash: string;
    }>>;
    /**
     * Convert a string salt (from the manifest) into a 32-byte hex salt.
     * Typically keccak256 of the string unless it is already 32-byte hex.
     */
    saltFn: (salt: string) => `0x${string}`;
    /** Optional progress callback written to stderr by callers. */
    onProgress?: (msg: string) => void;
}
/** Result returned by {@link runDeployment}. */
interface EngineRunResult {
    book: AddressBook;
    deployed: Array<{
        name: string;
        chain: string;
        address: `0x${string}`;
    }>;
    skipped: Array<{
        name: string;
        chains: string[];
    }>;
}
/**
 * Execute a full multi-contract, multi-chain deployment driven by the manifest.
 *
 * Algorithm:
 * 1. Seed `resolvedAddresses` from the existing address book.
 * 2. Topologically sort contracts so dependencies deploy first.
 * 3. For each contract × deploy_target pair:
 *    - If already deployed on all chains: skip and seed resolved address.
 *    - Otherwise: find artifact, resolve template args, ABI-encode constructor
 *      args, call `deployFn`, record results in the address book.
 * 4. Return the updated book plus `deployed` / `skipped` summaries.
 *
 * @throws {EngineError} when an artifact is missing, a template reference
 *   cannot be resolved, or a circular dependency exists.
 */
declare function runDeployment(opts: EngineRunOptions): Promise<EngineRunResult>;

/** Etherscan API verification payload (note: `constructorArguements` is the API's typo). */
interface VerificationPayload {
    apikey: string;
    module: 'contract';
    action: 'verifysourcecode';
    contractaddress: string;
    sourceCode: string;
    codeformat: 'solidity-single-file' | 'solidity-standard-json-input';
    contractname: string;
    compilerversion: string;
    optimizationUsed: '0' | '1';
    runs?: string;
    /** Etherscan API spells this with a typo — must match exactly. */
    constructorArguements: string;
    chainId: string;
}
/** Options passed to {@link buildVerificationPayload}. */
interface BuildVerificationPayloadOptions {
    artifact: ContractMeta;
    entry: AddressBookEntry;
    constructorArgs: `0x${string}` | string;
    evmChainId: number;
    apiKey: string;
    /** Whether the compiler optimizer was enabled. Defaults to `true`. */
    optimizationUsed?: boolean;
    /** Number of optimizer runs. Defaults to 200. */
    optimizerRuns?: number;
}
/** Options passed to {@link verifyContract}. */
interface VerifyContractOptions {
    artifact: ContractMeta;
    entry: AddressBookEntry;
    constructorArgs: `0x${string}`;
    evmChainId: number;
    apiKey: string;
}
/** Thrown when the Etherscan verification API returns a non-OK HTTP response. */
declare class VerificationError extends WormToolError {
    constructor(message: string, cause?: unknown);
}
/**
 * Build an Etherscan-compatible verification payload from contract metadata.
 * The `sourceCode` field is left empty; callers must set it before submitting.
 */
declare function buildVerificationPayload(opts: BuildVerificationPayloadOptions): VerificationPayload;
/**
 * Submit a contract for Etherscan verification.
 *
 * Reads the Foundry metadata JSON (if present) to populate `sourceCode`.
 * Returns a result object with `success`, optional `guid`, and `message`.
 * Throws {@link VerificationError} on HTTP-level failures.
 */
declare function verifyContract(opts: VerifyContractOptions): Promise<{
    success: boolean;
    guid?: string;
    message: string;
}>;

/** A single issue found when comparing two storage layouts. */
interface StorageDiffIssue {
    /** Critical issues block upgrades; warnings are informational. */
    severity: 'critical' | 'warning';
    /** The Solidity variable label that triggered this issue. */
    variable: string;
    /** Human-readable description of the issue. */
    message: string;
}
/** Result of comparing old and new storage layouts. */
interface StorageDiffResult {
    /**
     * True when there are no critical issues (only warnings or no issues at all).
     * A `safe` result means it is likely safe to upgrade.
     */
    safe: boolean;
    /** All issues found, sorted with critical issues first. */
    issues: StorageDiffIssue[];
}
/**
 * Compare old and new Solidity storage layouts.
 *
 * Checks for removed variables, type changes, slot moves, and offset changes —
 * each classified as `critical`. New variables appended at the end are classified
 * as `warning`.
 *
 * @param oldLayout - Storage layout from the currently deployed implementation.
 * @param newLayout - Storage layout from the new implementation to upgrade to.
 * @returns A `StorageDiffResult` with all issues and a `safe` flag.
 */
declare function diffStorageLayouts(oldLayout: StorageLayout, newLayout: StorageLayout): StorageDiffResult;

interface ChainDeployResult {
    chain: string;
    chainId: bigint;
    receipt: TransactionReceipt;
}
interface DeployAcrossChainsParams {
    /** chains[0] is the source (where the tx is sent). Remaining are cross-chain targets. */
    chains: WormToolChain[];
    bytecode: `0x${string}`;
    constructorArgs?: `0x${string}`;
    salt: `0x${string}`;
    wormToolDeployerAddress: string;
    /**
     * ETH value to send for Wormhole relayer fees (required when chains.length > 1).
     * Omit or pass 0n for local-only deployments (chains.length === 1).
     */
    value?: bigint;
}
/**
 * Deploy bytecode via WormToolDeployer.
 *
 * Sends one transaction from chains[0]. The contract deploys locally on chains[0]
 * (deployOnCurrentChain=true) and sends Wormhole messages to any additional chains.
 * If chains has only one entry, no relayer fees are needed.
 */
declare function deployAcrossChains(params: DeployAcrossChainsParams): Promise<ChainDeployResult[]>;
interface CallAcrossChainsParams {
    chains: WormToolChain[];
    target: `0x${string}`;
    calldata: `0x${string}`;
    wormToolDeployerAddress: string;
    value?: bigint;
}
/** Call a function on a deployed contract across multiple chains. */
declare function callAcrossChains(params: CallAcrossChainsParams): Promise<ChainDeployResult[]>;
interface UpgradeAcrossChainsParams {
    chains: WormToolChain[];
    proxy: `0x${string}`;
    newImpl: `0x${string}`;
    wormToolDeployerAddress: string;
    value?: bigint;
}
/** Upgrade a proxy contract to a new implementation. */
declare function upgradeAcrossChains(params: UpgradeAcrossChainsParams): Promise<ChainDeployResult[]>;

declare enum MessageStatus {
    Pending = "pending",
    Signed = "signed"
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

/** Thrown when a directory contains neither a Foundry nor Hardhat project. */
declare class ToolchainNotFoundError extends WormToolError {
    constructor(root: string);
}
/**
 * Detect the toolchain used in a project directory.
 * Foundry takes precedence over Hardhat when both configs are present.
 */
declare function detectToolchain(root: string): Promise<ToolchainInfo>;

/** Read all compiled contracts from a detected toolchain. */
declare function listArtifacts(info: ToolchainInfo): Promise<ContractMeta[]>;

declare const SDK_VERSION = "0.0.1";

export { type AddressBook, type AddressBookEntry, AptosChain, type AptosChainConfig, ArtifactParseError, type BuildVerificationPayloadOptions, CHAIN_REGISTRY, type CallAcrossChainsParams, type CallMessageParams, type ChainDeployResult, type ChainEntry, type ChainInfoSummary, ChainNotSupportedError, type ContractArg, ContractCallError, type ContractDeployConfig, type ContractMeta, type DeployAcrossChainsParams, type DeployManifest, type DeployMessageParams, type DeployPlanEntry, type DeployStrategy, type DeployTarget, EngineError, type EngineRunOptions, type EngineRunResult, EvmChain, type EvmChainConfig, type GenerateVaaParams, type LatencyMeasurement, ManifestParseError, type MeasureLatencyParams, MessageStatus, type MessageStatusParams, type MessageStatusResult, NearChain, type NearChainConfig, type NetworkConfig, type ParsedVaa, type PartialBook, PrivateKeyError, RpcError, SDK_VERSION, SolanaChain, type SolanaChainConfig, type StorageDiffIssue, type StorageDiffResult, type StorageLayout, type StorageVariable, SuiChain, type SuiChainConfig, type TokenBalance, type TokenInfo, type ToolchainInfo, ToolchainNotFoundError, type ToolchainType, type TransactionReceipt, type TransferParams, type TransferResult, type UpgradeAcrossChainsParams, type UpgradeMessageParams, VaaParseError, type VaaSignature, VerificationError, type VerificationPayload, type VerifyContractOptions, type WormToolChain, WormToolError, buildDependencyOrder, buildDeployPlan, buildVerificationPayload, callAcrossChains, checkContractDeployed, computeCreate2Address, deployAcrossChains, detectToolchain, diffStorageLayouts, encodeCallMessage, encodeDeployMessage, encodeUpgradeMessage, encodeVaaHex, extractBytecode, generateTestVaa, generateTestVaaHex, getAddress, getChainById, getChainByName, getChainInfo, getMessageStatus, getTokenBalance, getTokenInfo, importFromFoundryBroadcast, importFromHardhatDeploy, initiateTransfer, isDeployed, listArtifacts, loadAddressBook, measureSigningLatency, mergePartialBook, parseManifest, parseVaa, resolveEnvVars, resolveTemplateArg, runDeployment, saveAddressBook, setAddress, upgradeAcrossChains, verifyContract };
