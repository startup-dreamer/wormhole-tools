"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AptosChain: () => AptosChain,
  ArtifactParseError: () => ArtifactParseError,
  CHAIN_REGISTRY: () => CHAIN_REGISTRY,
  ChainNotSupportedError: () => ChainNotSupportedError,
  ContractCallError: () => ContractCallError,
  EngineError: () => EngineError,
  EvmChain: () => EvmChain,
  ManifestParseError: () => ManifestParseError,
  MessageStatus: () => MessageStatus,
  NearChain: () => NearChain,
  PrivateKeyError: () => PrivateKeyError,
  RpcError: () => RpcError,
  SDK_VERSION: () => SDK_VERSION,
  SolanaChain: () => SolanaChain,
  SuiChain: () => SuiChain,
  ToolchainNotFoundError: () => ToolchainNotFoundError,
  VaaParseError: () => VaaParseError,
  VerificationError: () => VerificationError,
  WormToolError: () => WormToolError,
  buildDependencyOrder: () => buildDependencyOrder,
  buildDeployPlan: () => buildDeployPlan,
  buildVerificationPayload: () => buildVerificationPayload,
  callAcrossChains: () => callAcrossChains,
  checkContractDeployed: () => checkContractDeployed,
  computeCreate2Address: () => computeCreate2Address,
  deployAcrossChains: () => deployAcrossChains,
  detectToolchain: () => detectToolchain,
  diffStorageLayouts: () => diffStorageLayouts,
  encodeCallMessage: () => encodeCallMessage,
  encodeDeployMessage: () => encodeDeployMessage,
  encodeUpgradeMessage: () => encodeUpgradeMessage,
  encodeVaaHex: () => encodeVaaHex,
  extractBytecode: () => extractBytecode,
  generateTestVaa: () => generateTestVaa,
  generateTestVaaHex: () => generateTestVaaHex,
  getAddress: () => getAddress,
  getChainById: () => getChainById,
  getChainByName: () => getChainByName,
  getChainInfo: () => getChainInfo,
  getMessageStatus: () => getMessageStatus,
  getTokenBalance: () => getTokenBalance,
  getTokenInfo: () => getTokenInfo,
  importFromFoundryBroadcast: () => importFromFoundryBroadcast,
  importFromHardhatDeploy: () => importFromHardhatDeploy,
  initiateTransfer: () => initiateTransfer,
  isDeployed: () => isDeployed,
  listArtifacts: () => listArtifacts,
  loadAddressBook: () => loadAddressBook,
  measureSigningLatency: () => measureSigningLatency,
  mergePartialBook: () => mergePartialBook,
  parseManifest: () => parseManifest,
  parseVaa: () => parseVaa,
  resolveEnvVars: () => resolveEnvVars,
  resolveTemplateArg: () => resolveTemplateArg,
  runDeployment: () => runDeployment,
  saveAddressBook: () => saveAddressBook,
  setAddress: () => setAddress,
  upgradeAcrossChains: () => upgradeAcrossChains,
  verifyContract: () => verifyContract
});
module.exports = __toCommonJS(index_exports);

// src/error.ts
var WormToolError = class extends Error {
  name;
  constructor(message, cause) {
    super(message, { cause });
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var RpcError = class extends WormToolError {
  constructor(chain, message, cause) {
    super(`[${chain}] RPC error: ${message}`, cause);
    this.chain = chain;
  }
  chain;
};
var ChainNotSupportedError = class extends WormToolError {
  constructor(chain) {
    super(`Chain not supported: ${chain}`);
  }
};
var VaaParseError = class extends WormToolError {
  constructor(message, cause) {
    super(`VAA parse error: ${message}`, cause);
  }
};
var ContractCallError = class extends WormToolError {
  constructor(address, message, cause) {
    super(`Contract call to ${address} failed: ${message}`, cause);
    this.address = address;
  }
  address;
};
var PrivateKeyError = class extends WormToolError {
  constructor() {
    super("Private key not found or invalid \u2014 set WORM_TOOL_EVM_PRIVATE_KEY");
  }
};
var ArtifactParseError = class extends WormToolError {
  constructor(path, cause) {
    super(`Failed to parse artifact at ${path}`, cause);
  }
};

// src/vaa/index.ts
var import_sha3 = require("@noble/hashes/sha3");
function hexToBytes(input) {
  if (!input) throw new VaaParseError("empty input");
  const clean = input.startsWith("0x") || input.startsWith("0X") ? input.slice(2) : input;
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new VaaParseError(`invalid hex: ${input.slice(0, 24)}`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
function toHex(bytes) {
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function base64ToBytes(input) {
  const raw = atob(input);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
function parseVaa(input) {
  if (!input || !input.trim()) throw new VaaParseError("empty input");
  const trimmed = input.trim();
  let bytes;
  try {
    if (/^(0x)?[0-9a-fA-F]+$/.test(trimmed)) {
      bytes = hexToBytes(trimmed);
    } else {
      bytes = base64ToBytes(trimmed);
    }
  } catch (e) {
    if (e instanceof VaaParseError) throw e;
    throw new VaaParseError("failed to decode input", e);
  }
  if (bytes.length < 6) throw new VaaParseError("VAA too short");
  let offset = 0;
  const readU8 = () => {
    if (offset >= bytes.length) throw new VaaParseError("unexpected end of VAA (u8)");
    return bytes[offset++];
  };
  const readU16 = () => {
    if (offset + 2 > bytes.length) throw new VaaParseError("unexpected end of VAA (u16)");
    const v = (bytes[offset] << 8 | bytes[offset + 1]) >>> 0;
    offset += 2;
    return v;
  };
  const readU32 = () => {
    if (offset + 4 > bytes.length) throw new VaaParseError("unexpected end of VAA (u32)");
    const v = (bytes[offset] << 24 | bytes[offset + 1] << 16 | bytes[offset + 2] << 8 | bytes[offset + 3]) >>> 0;
    offset += 4;
    return v;
  };
  const readU64 = () => {
    if (offset + 8 > bytes.length) throw new VaaParseError("unexpected end of VAA (u64)");
    let v = 0n;
    for (let i = 0; i < 8; i++) v = v << 8n | BigInt(bytes[offset++]);
    return v;
  };
  const readBytes = (n) => {
    if (offset + n > bytes.length) throw new VaaParseError(`unexpected end of VAA (${n} bytes)`);
    const slice = bytes.slice(offset, offset + n);
    offset += n;
    return slice;
  };
  try {
    const version = readU8();
    const guardianSetIndex = readU32();
    const sigCount = readU8();
    const signatures = [];
    for (let i = 0; i < sigCount; i++) {
      const guardianIndex = readU8();
      const sig = readBytes(65);
      signatures.push({ guardianIndex, signature: toHex(sig) });
    }
    const bodyStart = offset;
    const timestamp = readU32();
    const nonce = readU32();
    const emitterChain = readU16();
    const emitterAddress = toHex(readBytes(32));
    const sequence = readU64();
    const consistencyLevel = readU8();
    const payload = toHex(bytes.slice(offset));
    const bodyBytes = bytes.slice(bodyStart);
    const hash = toHex((0, import_sha3.keccak_256)(bodyBytes));
    return {
      version,
      guardianSetIndex,
      signatures,
      timestamp,
      nonce,
      emitterChain,
      emitterAddress,
      sequence,
      consistencyLevel,
      payload,
      hash
    };
  } catch (e) {
    if (e instanceof VaaParseError) throw e;
    throw new VaaParseError("malformed VAA binary", e);
  }
}
function encodeVaaHex(vaa) {
  const parts = [];
  const writeU8 = (v) => {
    parts.push(v & 255);
  };
  const writeU16 = (v) => {
    parts.push(v >> 8 & 255, v & 255);
  };
  const writeU32 = (v) => {
    parts.push(v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255);
  };
  const writeU64 = (v) => {
    for (let i = 7; i >= 0; i--) parts.push(Number(v >> BigInt(i * 8) & 0xffn));
  };
  const writeHex = (h) => {
    const clean = h.startsWith("0x") ? h.slice(2) : h;
    for (let i = 0; i < clean.length; i += 2) parts.push(parseInt(clean.slice(i, i + 2), 16));
  };
  writeU8(vaa.version);
  writeU32(vaa.guardianSetIndex);
  writeU8(vaa.signatures.length);
  for (const sig of vaa.signatures) {
    writeU8(sig.guardianIndex);
    writeHex(sig.signature);
  }
  writeU32(vaa.timestamp);
  writeU32(vaa.nonce);
  writeU16(vaa.emitterChain);
  writeHex(vaa.emitterAddress);
  writeU64(vaa.sequence);
  writeU8(vaa.consistencyLevel);
  writeHex(vaa.payload);
  return "0x" + parts.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// src/chains/evm.ts
var import_viem = require("viem");
var import_accounts = require("viem/accounts");

// src/deploy/registry.ts
var CHAIN_REGISTRY = [
  { wormholeChainId: 1, name: "solana", defaultRpc: "https://api.mainnet-beta.solana.com" },
  { wormholeChainId: 2, name: "ethereum", evmChainId: 1, wormholeCore: "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B" },
  { wormholeChainId: 4, name: "bsc", evmChainId: 56, wormholeCore: "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B" },
  { wormholeChainId: 5, name: "polygon", evmChainId: 137, wormholeCore: "0x7A4B5a56153eda34EB8D93Bc0a5e3A3C3e3e4Bd6" },
  { wormholeChainId: 6, name: "avalanche", evmChainId: 43114 },
  { wormholeChainId: 10, name: "fantom", evmChainId: 250 },
  { wormholeChainId: 13, name: "klaytn", evmChainId: 8217 },
  { wormholeChainId: 14, name: "celo", evmChainId: 42220 },
  { wormholeChainId: 16, name: "moonbeam", evmChainId: 1284 },
  { wormholeChainId: 22, name: "aptos" },
  { wormholeChainId: 23, name: "arbitrum", evmChainId: 42161 },
  { wormholeChainId: 24, name: "optimism", evmChainId: 10 },
  { wormholeChainId: 30, name: "base", evmChainId: 8453 },
  // Testnets — WormToolDeployer deployed at the same address on all chains via CREATE2
  // (salt = keccak256("worm-tool-deployer-v1"), factory = deployer wallet 0x68A2610f...)
  {
    wormholeChainId: 10002,
    name: "sepolia",
    evmChainId: 11155111,
    isTestnet: true,
    defaultRpc: "https://ethereum-sepolia.publicnode.com",
    wormholeCore: "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78",
    wormToolDeployer: "0x0aA4B5899bAF7326397b1041db9c854056126F57"
  },
  {
    wormholeChainId: 10003,
    name: "arbitrum-sepolia",
    evmChainId: 421614,
    isTestnet: true,
    defaultRpc: "https://sepolia-rollup.arbitrum.io/rpc",
    wormholeCore: "0x6b9C8671cdDC8dEab9c719bB87cBd3e782bA6a35",
    wormToolDeployer: "0x0aA4B5899bAF7326397b1041db9c854056126F57"
  },
  {
    wormholeChainId: 10004,
    name: "base-sepolia",
    evmChainId: 84532,
    isTestnet: true,
    defaultRpc: "https://sepolia.base.org",
    wormholeCore: "0x79A1027a6A159502049F10906D333EC57E95F083",
    wormToolDeployer: "0x0aA4B5899bAF7326397b1041db9c854056126F57"
  },
  { wormholeChainId: 4, name: "bsc-testnet", evmChainId: 97, isTestnet: true }
];
function getChainById(wormholeChainId) {
  return CHAIN_REGISTRY.find((c) => c.wormholeChainId === wormholeChainId);
}
function getChainByName(name) {
  return CHAIN_REGISTRY.find((c) => c.name === name.toLowerCase());
}

// src/chains/evm.ts
var EvmChain = class {
  chainId;
  chainName;
  publicClient;
  account;
  chain;
  rpcUrl;
  constructor(config) {
    this.chainId = config.wormholeChainId;
    const entry = getChainById(Number(config.wormholeChainId));
    this.chainName = entry?.name ?? `evm-${config.wormholeChainId}`;
    this.rpcUrl = config.rpcUrl;
    this.chain = {
      id: config.evmChainId,
      name: this.chainName,
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } }
    };
    this.publicClient = (0, import_viem.createPublicClient)({
      chain: this.chain,
      transport: (0, import_viem.http)(config.rpcUrl)
    });
    this.account = config.privateKey ? (0, import_accounts.privateKeyToAccount)(config.privateKey) : void 0;
  }
  async getBalance(address) {
    try {
      return await this.publicClient.getBalance({ address });
    } catch (e) {
      throw new RpcError(this.chainName, `getBalance failed: ${String(e)}`, e);
    }
  }
  async call(to, data) {
    try {
      const result = await this.publicClient.call({ to, data });
      return result.data ?? "0x";
    } catch (e) {
      throw new RpcError(this.chainName, `call to ${to} failed: ${String(e)}`, e);
    }
  }
  async sendTransaction(to, data, value) {
    if (!this.account) throw new PrivateKeyError();
    const walletClient = (0, import_viem.createWalletClient)({
      account: this.account,
      chain: this.chain,
      transport: (0, import_viem.http)(this.rpcUrl)
    });
    try {
      const hash = await walletClient.sendTransaction({
        account: this.account,
        to,
        data,
        ...value !== void 0 && { value },
        chain: this.chain
      });
      return this.waitForTransaction(hash);
    } catch (e) {
      if (e instanceof PrivateKeyError) throw e;
      throw new RpcError(this.chainName, `sendTransaction failed: ${String(e)}`, e);
    }
  }
  async waitForTransaction(txHash) {
    try {
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash
      });
      return {
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        success: receipt.status === "success",
        gasUsed: receipt.gasUsed
      };
    } catch (e) {
      throw new RpcError(this.chainName, `waitForTransaction failed: ${String(e)}`, e);
    }
  }
  async getCode(address) {
    try {
      const code = await this.publicClient.getCode({ address });
      return code ?? "0x";
    } catch (e) {
      throw new RpcError(this.chainName, `getCode failed: ${String(e)}`, e);
    }
  }
};

// src/chains/solana.ts
var import_web3 = require("@solana/web3.js");
var SolanaChain = class {
  chainId = 1n;
  chainName = "solana";
  connection;
  constructor(config) {
    this.connection = new import_web3.Connection(config.rpcUrl, "confirmed");
  }
  async getBalance(address) {
    try {
      const pk = new import_web3.PublicKey(address);
      const lamports = await this.connection.getBalance(pk);
      return BigInt(lamports);
    } catch (e) {
      throw new RpcError("solana", `getBalance failed: ${String(e)}`, e);
    }
  }
  async call(_to, _data) {
    throw new RpcError("solana", "eth_call not supported on Solana");
  }
  async sendTransaction(_to, _data, _value) {
    throw new RpcError("solana", "sendTransaction not yet implemented for Solana");
  }
  async waitForTransaction(txHash) {
    try {
      const sig = await this.connection.getSignatureStatus(txHash, { searchTransactionHistory: true });
      const status = sig.value;
      return {
        txHash,
        blockNumber: BigInt(status?.slot ?? 0),
        success: status?.err == null
      };
    } catch (e) {
      throw new RpcError("solana", `waitForTransaction failed: ${String(e)}`, e);
    }
  }
  async getCode(_address) {
    throw new RpcError("solana", "getCode not applicable to Solana");
  }
};

// src/chains/aptos.ts
var AptosChain = class {
  chainId = 22n;
  chainName = "aptos";
  constructor(_config) {
  }
  async getBalance(_address) {
    throw new RpcError("aptos", "getBalance not yet implemented");
  }
  async call(_to, _data) {
    throw new RpcError("aptos", "call not yet implemented");
  }
  async sendTransaction(_to, _data, _value) {
    throw new RpcError("aptos", "sendTransaction not yet implemented");
  }
  async waitForTransaction(_txHash) {
    throw new RpcError("aptos", "waitForTransaction not yet implemented");
  }
  async getCode(_address) {
    throw new RpcError("aptos", "getCode not yet implemented");
  }
};

// src/chains/near.ts
var NearChain = class {
  chainId = 15n;
  chainName = "near";
  constructor(_config) {
  }
  async getBalance(_address) {
    throw new RpcError("near", "getBalance not yet implemented");
  }
  async call(_to, _data) {
    throw new RpcError("near", "call not yet implemented");
  }
  async sendTransaction(_to, _data, _value) {
    throw new RpcError("near", "sendTransaction not yet implemented");
  }
  async waitForTransaction(_txHash) {
    throw new RpcError("near", "waitForTransaction not yet implemented");
  }
  async getCode(_address) {
    throw new RpcError("near", "getCode not yet implemented");
  }
};

// src/chains/sui.ts
var SuiChain = class {
  chainId = 21n;
  chainName = "sui";
  constructor(_config) {
  }
  async getBalance(_address) {
    throw new RpcError("sui", "getBalance not yet implemented");
  }
  async call(_to, _data) {
    throw new RpcError("sui", "call not yet implemented");
  }
  async sendTransaction(_to, _data, _value) {
    throw new RpcError("sui", "sendTransaction not yet implemented");
  }
  async waitForTransaction(_txHash) {
    throw new RpcError("sui", "waitForTransaction not yet implemented");
  }
  async getCode(_address) {
    throw new RpcError("sui", "getCode not yet implemented");
  }
};

// src/deploy/index.ts
var import_viem4 = require("viem");

// src/deploy/artifact.ts
function extractBytecode(artifact, path = "<artifact>") {
  const a = artifact;
  if (!a.bytecode) {
    throw new ArtifactParseError(path, new Error("no bytecode field"));
  }
  let raw;
  if (typeof a.bytecode === "string") {
    raw = a.bytecode;
  } else if (typeof a.bytecode === "object" && typeof a.bytecode.object === "string") {
    if (a.bytecode.linkReferences && Object.keys(a.bytecode.linkReferences).length > 0) {
      throw new ArtifactParseError(path, new Error("bytecode has unresolved link references"));
    }
    raw = a.bytecode.object;
  } else {
    throw new ArtifactParseError(path, new Error("unrecognised bytecode format"));
  }
  const hex = raw.startsWith("0x") ? raw : "0x" + raw;
  if (hex === "0x" || hex.length < 4) {
    throw new ArtifactParseError(path, new Error("bytecode is empty"));
  }
  return hex;
}

// src/deploy/create2.ts
var import_sha32 = require("@noble/hashes/sha3");
function fromHex(h) {
  const clean = h.startsWith("0x") ? h.slice(2) : h;
  if (clean.length % 2 !== 0) throw new WormToolError("odd-length hex");
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return arr;
}
function toChecksumAddress(bytes) {
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function computeCreate2Address(deployer, salt, initCodeHash) {
  const deployerBytes = fromHex(deployer);
  if (deployerBytes.length !== 20) {
    throw new WormToolError(`deployer must be 20 bytes, got ${deployerBytes.length}`);
  }
  const saltBytes = fromHex(salt);
  if (saltBytes.length !== 32) {
    throw new WormToolError(`salt must be 32 bytes, got ${saltBytes.length}`);
  }
  const hashBytes = fromHex(initCodeHash);
  if (hashBytes.length !== 32) {
    throw new WormToolError(`initCodeHash must be 32 bytes, got ${hashBytes.length}`);
  }
  const data = new Uint8Array(85);
  data[0] = 255;
  data.set(deployerBytes, 1);
  data.set(saltBytes, 21);
  data.set(hashBytes, 53);
  const addressHash = (0, import_sha32.keccak_256)(data);
  return toChecksumAddress(addressHash.slice(12));
}

// src/deploy/status.ts
async function checkContractDeployed(chain, address) {
  const code = await chain.getCode(address);
  return code !== "0x" && code.length > 2;
}

// src/deploy/abi.ts
var import_viem2 = require("viem");
function encodeDeployMessage(p) {
  return (0, import_viem2.encodeAbiParameters)(
    (0, import_viem2.parseAbiParameters)("uint8 msgType, bytes bytecode, bytes constructorArgs, bytes32 salt, uint16[] targetChains"),
    [1, p.bytecode, p.constructorArgs ?? "0x", p.salt, p.targetChains]
  );
}
function encodeCallMessage(p) {
  return (0, import_viem2.encodeAbiParameters)(
    (0, import_viem2.parseAbiParameters)("uint8 msgType, address target, bytes calldata_, uint16[] targetChains"),
    [2, p.target, p.calldata, p.targetChains]
  );
}
function encodeUpgradeMessage(p) {
  return (0, import_viem2.encodeAbiParameters)(
    (0, import_viem2.parseAbiParameters)("uint8 msgType, address proxy, address newImpl, uint16[] targetChains"),
    [3, p.proxy, p.newImpl, p.targetChains]
  );
}

// src/deploy/manifest.ts
var import_yaml = require("yaml");
var ManifestParseError = class extends WormToolError {
  constructor(message, cause) {
    super(`Manifest parse error: ${message}`, cause);
  }
};
var VALID_STRATEGIES = ["cross-chain", "sequential"];
function resolveEnvVars(value) {
  return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    return process.env[varName] ?? match;
  });
}
function resolveEnvVarsDeep(obj) {
  if (typeof obj === "string") return resolveEnvVars(obj);
  if (Array.isArray(obj)) return obj.map(resolveEnvVarsDeep);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, resolveEnvVarsDeep(v)])
    );
  }
  return obj;
}
function validateManifest(raw) {
  if (typeof raw !== "object" || raw === null) {
    throw new ManifestParseError("manifest must be an object");
  }
  const obj = raw;
  if (!obj["networks"] || typeof obj["networks"] !== "object") {
    throw new ManifestParseError('"networks" is required');
  }
  if (!obj["deployer"] || typeof obj["deployer"] !== "object") {
    throw new ManifestParseError('"deployer" is required');
  }
  const deployer = obj["deployer"];
  if (typeof deployer["salt"] !== "string" || deployer["salt"].length === 0) {
    throw new ManifestParseError('"deployer.salt" must be a non-empty string');
  }
  if (!Array.isArray(obj["contracts"])) {
    throw new ManifestParseError('"contracts" must be an array');
  }
  if (!Array.isArray(obj["deploy_targets"])) {
    throw new ManifestParseError('"deploy_targets" must be an array');
  }
  for (const target of obj["deploy_targets"]) {
    const t = target;
    if (!Array.isArray(t["contracts"]) || !Array.isArray(t["chains"])) {
      throw new ManifestParseError('deploy_targets[] entries must have "contracts" and "chains" arrays');
    }
    if (!VALID_STRATEGIES.includes(t["strategy"])) {
      throw new ManifestParseError(
        `Invalid strategy "${String(t["strategy"])}" \u2014 must be one of: ${VALID_STRATEGIES.join(", ")}`
      );
    }
  }
  return raw;
}
function parseManifest(yaml) {
  let raw;
  try {
    raw = (0, import_yaml.parse)(yaml);
  } catch (err) {
    throw new ManifestParseError("invalid YAML", err);
  }
  const resolved = resolveEnvVarsDeep(raw);
  return validateManifest(resolved);
}

// src/deploy/address-book.ts
var import_promises = require("fs/promises");
var import_path = require("path");
var BOOK_PATH = (root) => (0, import_path.join)(root, "deployments", "worm-tool.json");
async function loadAddressBook(root) {
  const path = BOOK_PATH(root);
  try {
    const raw = await (0, import_promises.readFile)(path, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed["contracts"] !== "object" || parsed["contracts"] === null) {
      process.stderr.write(`Warning: ${path} has unexpected format, starting fresh
`);
      return { version: "1", salt: "", contracts: {} };
    }
    return parsed;
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return { version: "1", salt: "", contracts: {} };
    }
    throw err;
  }
}
async function saveAddressBook(root, book) {
  const dir = (0, import_path.join)(root, "deployments");
  await (0, import_promises.mkdir)(dir, { recursive: true });
  await (0, import_promises.writeFile)(BOOK_PATH(root), JSON.stringify(book, null, 2), "utf8");
}
function getAddress(book, contractName, chain) {
  return book.contracts[contractName]?.[chain]?.address;
}
function isDeployed(book, contractName, chain) {
  return getAddress(book, contractName, chain) !== void 0;
}
function setAddress(book, contractName, chain, entry) {
  return {
    ...book,
    contracts: {
      ...book.contracts,
      [contractName]: {
        ...book.contracts[contractName],
        [chain]: entry
      }
    }
  };
}
function mergePartialBook(book, partial) {
  let result = book;
  for (const [contractName, chains] of Object.entries(partial)) {
    for (const [chain, entry] of Object.entries(chains)) {
      if (!isDeployed(result, contractName, chain)) {
        result = setAddress(result, contractName, chain, entry);
      }
    }
  }
  return result;
}
async function importFromFoundryBroadcast(root) {
  const broadcastRoot = (0, import_path.join)(root, "broadcast");
  const result = {};
  const files = await collectFiles(broadcastRoot, "run-latest.json");
  for (const file of files) {
    try {
      const raw = await (0, import_promises.readFile)(file, "utf8");
      const data = JSON.parse(raw);
      const chainEntry = CHAIN_REGISTRY.find((c) => c.evmChainId === data.chain);
      const chainName = chainEntry?.name;
      if (!chainName) continue;
      for (const tx of data.transactions ?? []) {
        if (tx.transactionType !== "CREATE") continue;
        const name = tx.contractName;
        const addr = tx.contractAddress;
        if (!name || !addr) continue;
        const nameEntry = result[name] ?? (result[name] = {});
        nameEntry[chainName] = {
          address: addr,
          ...tx.hash !== void 0 ? { txHash: tx.hash } : {},
          deployedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
      }
    } catch {
    }
  }
  return result;
}
async function importFromHardhatDeploy(root) {
  const deploymentsRoot = (0, import_path.join)(root, "deployments");
  const result = {};
  let networks;
  try {
    const entries = await (0, import_promises.readdir)(deploymentsRoot, { withFileTypes: true });
    networks = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") return result;
    throw err;
  }
  for (const network of networks) {
    const networkDir = (0, import_path.join)(deploymentsRoot, network);
    let files;
    try {
      const entries = await (0, import_promises.readdir)(networkDir, { withFileTypes: true });
      files = entries.filter((e) => e.isFile() && e.name.endsWith(".json") && e.name !== "worm-tool.json").map((e) => e.name);
    } catch {
      continue;
    }
    for (const file of files) {
      const contractName = file.slice(0, -5);
      try {
        const raw = await (0, import_promises.readFile)((0, import_path.join)(networkDir, file), "utf8");
        const data = JSON.parse(raw);
        if (!data.address) continue;
        const contractEntry = result[contractName] ?? (result[contractName] = {});
        contractEntry[network] = {
          address: data.address,
          ...data.transactionHash !== void 0 ? { txHash: data.transactionHash } : {},
          deployedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
      } catch {
      }
    }
  }
  return result;
}
async function collectFiles(dir, basename3) {
  const results = [];
  let entries;
  try {
    entries = await (0, import_promises.readdir)(dir, { withFileTypes: true });
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") return results;
    throw err;
  }
  for (const entry of entries) {
    const full = (0, import_path.join)(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await collectFiles(full, basename3);
      results.push(...sub);
    } else if (entry.isFile() && entry.name === basename3) {
      results.push(full);
    }
  }
  return results;
}
function isNodeError(err) {
  return err instanceof Error && "code" in err;
}

// src/deploy/engine.ts
var import_viem3 = require("viem");
var EngineError = class extends WormToolError {
  constructor(message, cause) {
    super(message, cause);
  }
};
function resolveTemplateArg(value, deployedAddresses) {
  if (!value.includes("{{")) return value;
  const contractMatch = /^\{\{contracts\.([^}]+)\.address\}\}$/.exec(value);
  if (contractMatch) {
    const name = contractMatch[1];
    if (!name) throw new EngineError(`Invalid contract template expression: ${value}`);
    const addr = deployedAddresses[name];
    if (!addr) throw new EngineError(`Contract "${name}" has not been deployed yet (referenced in template)`);
    return addr;
  }
  const envMatch = /^\{\{env\.([^}]+)\}\}$/.exec(value);
  if (envMatch) {
    const varName = envMatch[1];
    if (!varName) throw new EngineError(`Invalid env template expression: ${value}`);
    const envVal = process.env[varName];
    if (envVal === void 0) throw new EngineError(`Environment variable "${varName}" is not set`);
    return envVal;
  }
  throw new EngineError(`Unsupported template expression: ${value}`);
}
function extractDeps(args) {
  if (!args) return [];
  const deps = [];
  for (const arg of args) {
    const m = /^\{\{contracts\.([^}]+)\.address\}\}$/.exec(arg.value);
    if (m && m[1]) deps.push(m[1]);
  }
  return deps;
}
function buildDependencyOrder(contracts, externallyResolved) {
  const byName = /* @__PURE__ */ new Map();
  for (const c of contracts) byName.set(c.name, c);
  const deps = /* @__PURE__ */ new Map();
  const reverseDeps = /* @__PURE__ */ new Map();
  for (const c of contracts) {
    const d = extractDeps(c.args).filter((dep) => !externallyResolved?.has(dep));
    deps.set(c.name, d);
    if (!reverseDeps.has(c.name)) reverseDeps.set(c.name, []);
    for (const dep of d) {
      const rev = reverseDeps.get(dep) ?? [];
      rev.push(c.name);
      reverseDeps.set(dep, rev);
    }
  }
  const inDegree = /* @__PURE__ */ new Map();
  for (const c of contracts) {
    inDegree.set(c.name, (deps.get(c.name) ?? []).length);
  }
  const queue = [];
  for (const c of contracts) {
    if ((inDegree.get(c.name) ?? 0) === 0) queue.push(c.name);
  }
  const result = [];
  while (queue.length > 0) {
    const name = queue.shift();
    if (!name) break;
    const contract = byName.get(name);
    if (!contract) throw new EngineError(`Contract "${name}" referenced but not defined`);
    result.push(contract);
    for (const dependent of reverseDeps.get(name) ?? []) {
      const newDeg = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, newDeg);
      if (newDeg === 0) queue.push(dependent);
    }
  }
  if (result.length !== contracts.length) {
    throw new EngineError("circular dependency detected in contract deployment graph");
  }
  return result;
}
function buildDeployPlan(manifest, book) {
  const alreadyInBook = new Set(Object.keys(book.contracts));
  const ordered = buildDependencyOrder(manifest.contracts, alreadyInBook);
  const entries = [];
  for (const contractConfig of ordered) {
    for (const target of manifest.deploy_targets) {
      if (!target.contracts.includes(contractConfig.name)) continue;
      const alreadyDeployed = target.chains.every(
        (chain) => isDeployed(book, contractConfig.name, chain)
      );
      entries.push({
        name: contractConfig.name,
        contract: contractConfig.contract,
        alreadyDeployed,
        targetChains: target.chains,
        strategy: target.strategy
      });
    }
  }
  return entries;
}
async function runDeployment(opts) {
  const { manifest, artifacts, deployFn, saltFn, onProgress } = opts;
  let book = opts.book;
  const resolvedAddresses = {};
  for (const [contractName, chains] of Object.entries(book.contracts)) {
    for (const [, entry] of Object.entries(chains)) {
      if (!resolvedAddresses[contractName]) {
        resolvedAddresses[contractName] = entry.address;
      }
    }
  }
  const ordered = buildDependencyOrder(manifest.contracts, new Set(Object.keys(resolvedAddresses)));
  const salt = saltFn(manifest.deployer.salt);
  const deployed = [];
  const skipped = [];
  for (const contractConfig of ordered) {
    for (const target of manifest.deploy_targets) {
      if (!target.contracts.includes(contractConfig.name)) continue;
      const allDeployed = target.chains.every(
        (chain) => isDeployed(book, contractConfig.name, chain)
      );
      if (allDeployed) {
        onProgress?.(`Skipping ${contractConfig.name} (already deployed on all target chains)`);
        const firstChain = target.chains[0];
        if (firstChain) {
          const addr = book.contracts[contractConfig.name]?.[firstChain]?.address;
          if (addr) resolvedAddresses[contractConfig.name] = addr;
        }
        skipped.push({ name: contractConfig.name, chains: target.chains });
        continue;
      }
      const artifact = artifacts.find((a) => a.name === contractConfig.contract);
      if (!artifact) {
        throw new EngineError(
          `Artifact not found for contract "${contractConfig.contract}" (used by "${contractConfig.name}")`
        );
      }
      const rawArgs = contractConfig.args ?? [];
      const resolvedArgs = rawArgs.map((arg) => ({
        ...arg,
        value: resolveTemplateArg(arg.value, resolvedAddresses)
      }));
      let constructorArgs = "0x";
      if (resolvedArgs.length > 0 && artifact.constructorInputs.length > 0) {
        const params = artifact.constructorInputs;
        const values = resolvedArgs.map((arg, i) => {
          const param = params[i];
          if (!param) throw new EngineError(`Too many args for "${contractConfig.name}" constructor (expected ${params.length})`);
          const t = param.type;
          if (t === "bool") return arg.value === "true" || arg.value === "1";
          if (t.startsWith("uint") || t.startsWith("int")) return BigInt(arg.value);
          return arg.value;
        });
        constructorArgs = (0, import_viem3.encodeAbiParameters)(params, values);
      }
      onProgress?.(`Deploying ${contractConfig.name} (${contractConfig.contract}) to [${target.chains.join(", ")}]`);
      const results = await deployFn({
        contractName: contractConfig.contract,
        bytecode: artifact.bytecode,
        constructorArgs,
        salt,
        chains: target.chains,
        strategy: target.strategy
      });
      for (const r of results) {
        book = setAddress(book, contractConfig.name, r.chain, {
          address: r.address,
          txHash: r.txHash,
          deployedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        deployed.push({ name: contractConfig.name, chain: r.chain, address: r.address });
        if (!resolvedAddresses[contractConfig.name]) {
          resolvedAddresses[contractConfig.name] = r.address;
        }
      }
    }
  }
  return { book, deployed, skipped };
}

// src/deploy/verify.ts
var import_promises2 = require("fs/promises");
var VerificationError = class extends WormToolError {
  constructor(message, cause) {
    super(`Verification error: ${message}`, cause);
  }
};
var CHAIN_API_MAP = {
  1: "https://api.etherscan.io/api",
  11155111: "https://api-sepolia.etherscan.io/api",
  42161: "https://api.arbiscan.io/api",
  421614: "https://api-sepolia.arbiscan.io/api",
  8453: "https://api.basescan.org/api",
  84532: "https://api-sepolia.basescan.org/api",
  137: "https://api.polygonscan.com/api",
  56: "https://api.bscscan.com/api"
};
var ETHERSCAN_API_DEFAULT = "https://api.etherscan.io/api";
function buildVerificationPayload(opts) {
  const { artifact, entry, constructorArgs, evmChainId, apiKey } = opts;
  const compilerversion = artifact.compilerVersion.startsWith("v") ? artifact.compilerVersion : `v${artifact.compilerVersion}`;
  const constructorArguements = constructorArgs.startsWith("0x") ? constructorArgs.slice(2) : constructorArgs;
  return {
    apikey: apiKey,
    module: "contract",
    action: "verifysourcecode",
    contractaddress: entry.address,
    sourceCode: "",
    codeformat: "solidity-standard-json-input",
    contractname: artifact.name,
    compilerversion,
    optimizationUsed: opts.optimizationUsed ?? true ? "1" : "0",
    ...opts.optimizerRuns !== void 0 && { runs: String(opts.optimizerRuns) },
    constructorArguements,
    chainId: String(evmChainId)
  };
}
async function verifyContract(opts) {
  const { artifact, entry, constructorArgs, evmChainId, apiKey } = opts;
  const apiUrl = CHAIN_API_MAP[evmChainId] ?? ETHERSCAN_API_DEFAULT;
  let sourceCode = "{}";
  let optimizationUsed;
  let optimizerRuns;
  const metadataPath = artifact.artifactPath.replace(/\.json$/, ".metadata.json");
  try {
    sourceCode = await (0, import_promises2.readFile)(metadataPath, "utf8");
    const metaRaw = JSON.parse(sourceCode);
    optimizationUsed = metaRaw.settings?.optimizer?.enabled;
    optimizerRuns = metaRaw.settings?.optimizer?.runs;
  } catch {
  }
  const payload = buildVerificationPayload({
    artifact,
    entry,
    constructorArgs,
    evmChainId,
    apiKey,
    ...optimizationUsed !== void 0 && { optimizationUsed },
    ...optimizerRuns !== void 0 && { optimizerRuns }
  });
  payload.sourceCode = sourceCode;
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (value !== void 0) {
      body.set(key, String(value));
    }
  }
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!response.ok) {
    throw new VerificationError(`HTTP ${response.status} from ${apiUrl}`);
  }
  const result = await response.json();
  if (result.status !== "1") {
    return { success: false, message: result.result ?? result.message ?? "Unknown error" };
  }
  return result.result !== void 0 ? { success: true, guid: result.result, message: "Verification submitted" } : { success: true, message: "Verification submitted" };
}

// src/deploy/storage-diff.ts
function diffStorageLayouts(oldLayout, newLayout) {
  const issues = [];
  const oldByLabel = new Map(oldLayout.storage.map((v) => [v.label, v]));
  const newByLabel = new Map(newLayout.storage.map((v) => [v.label, v]));
  for (const [label, oldVar] of oldByLabel) {
    const newVar = newByLabel.get(label);
    if (!newVar) {
      issues.push({
        severity: "critical",
        variable: label,
        message: `Variable "${label}" was removed \u2014 this corrupts storage on upgrade`
      });
      continue;
    }
    if (newVar.type !== oldVar.type) {
      issues.push({
        severity: "critical",
        variable: label,
        message: `Variable "${label}" changed type from "${oldVar.type}" to "${newVar.type}"`
      });
    }
    if (newVar.slot !== oldVar.slot) {
      issues.push({
        severity: "critical",
        variable: label,
        message: `Variable "${label}" moved from slot ${oldVar.slot} to ${newVar.slot}`
      });
    }
    if (newVar.offset !== oldVar.offset) {
      issues.push({
        severity: "critical",
        variable: label,
        message: `Variable "${label}" offset changed from ${oldVar.offset} to ${newVar.offset}`
      });
    }
  }
  for (const [label] of newByLabel) {
    if (!oldByLabel.has(label)) {
      issues.push({
        severity: "warning",
        variable: label,
        message: `New variable "${label}" added \u2014 ensure it is appended after all existing variables`
      });
    }
  }
  return { safe: issues.every((i) => i.severity === "warning"), issues };
}

// src/deploy/index.ts
var DEPLOY_ABI = [{
  name: "deployAcrossChains",
  type: "function",
  inputs: [
    { name: "targetChains", type: "uint16[]" },
    { name: "bytecode", type: "bytes" },
    { name: "salt", type: "bytes32" },
    { name: "initCalldata", type: "bytes" },
    { name: "deployOnCurrentChain", type: "bool" }
  ],
  stateMutability: "payable"
}];
var CALL_ABI = [{
  name: "callAcrossChains",
  type: "function",
  inputs: [
    { name: "targetChains", type: "uint16[]" },
    { name: "target", type: "address" },
    { name: "callData", type: "bytes" },
    { name: "gasLimit", type: "uint256" }
  ],
  stateMutability: "payable"
}];
var UPGRADE_ABI = [{
  name: "upgradeAcrossChains",
  type: "function",
  inputs: [
    { name: "targetChains", type: "uint16[]" },
    { name: "proxy", type: "address" },
    { name: "newImpl", type: "address" },
    { name: "upgradeOnCurrentChain", type: "bool" }
  ],
  stateMutability: "payable"
}];
async function deployAcrossChains(params) {
  const { chains, bytecode, constructorArgs = "0x", salt, wormToolDeployerAddress, value = 0n } = params;
  const [sourceChain, ...rest] = chains;
  if (!sourceChain) throw new WormToolError("deployAcrossChains: at least one chain required");
  const targetChainIds = rest.map((c) => Number(c.chainId));
  const data = (0, import_viem4.encodeFunctionData)({
    abi: DEPLOY_ABI,
    functionName: "deployAcrossChains",
    args: [targetChainIds, bytecode, salt, constructorArgs, true]
  });
  const receipt = await sourceChain.sendTransaction(wormToolDeployerAddress, data, value);
  return [{ chain: sourceChain.chainName, chainId: sourceChain.chainId, receipt }];
}
async function callAcrossChains(params) {
  const { chains, target, calldata, wormToolDeployerAddress, value = 0n } = params;
  const [sourceChain, ...rest] = chains;
  if (!sourceChain) throw new WormToolError("callAcrossChains: at least one chain required");
  const targetChainIds = rest.map((c) => Number(c.chainId));
  const data = (0, import_viem4.encodeFunctionData)({
    abi: CALL_ABI,
    functionName: "callAcrossChains",
    args: [targetChainIds, target, calldata, 3000000n]
  });
  const receipt = await sourceChain.sendTransaction(wormToolDeployerAddress, data, value);
  return [{ chain: sourceChain.chainName, chainId: sourceChain.chainId, receipt }];
}
async function upgradeAcrossChains(params) {
  const { chains, proxy, newImpl, wormToolDeployerAddress, value = 0n } = params;
  const [sourceChain, ...rest] = chains;
  if (!sourceChain) throw new WormToolError("upgradeAcrossChains: at least one chain required");
  const targetChainIds = rest.map((c) => Number(c.chainId));
  const data = (0, import_viem4.encodeFunctionData)({
    abi: UPGRADE_ABI,
    functionName: "upgradeAcrossChains",
    args: [targetChainIds, proxy, newImpl, true]
  });
  const receipt = await sourceChain.sendTransaction(wormToolDeployerAddress, data, value);
  return [{ chain: sourceChain.chainName, chainId: sourceChain.chainId, receipt }];
}

// src/status.ts
var WORMHOLESCAN_MAINNET = "https://api.wormholescan.io";
var WORMHOLESCAN_TESTNET = "https://api.testnet.wormholescan.io";
var MessageStatus = /* @__PURE__ */ ((MessageStatus2) => {
  MessageStatus2["Pending"] = "pending";
  MessageStatus2["Signed"] = "signed";
  return MessageStatus2;
})(MessageStatus || {});
async function getMessageStatus(params) {
  const { emitterChain, emitterAddress, sequence, network = "mainnet" } = params;
  const base = network === "testnet" ? WORMHOLESCAN_TESTNET : WORMHOLESCAN_MAINNET;
  const url = `${base}/api/v1/vaas/${emitterChain}/${emitterAddress}/${sequence}`;
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) return { status: "pending" /* Pending */, vaaBytes: void 0, txHash: void 0 };
    throw new RpcError("wormholescan", `HTTP ${response.status} for ${url}`);
  }
  const data = await response.json();
  return {
    status: "signed" /* Signed */,
    vaaBytes: data.vaaBytes,
    txHash: data.data?.txHash
  };
}

// src/info.ts
var FINALITY_MAP = {
  1: "confirmed (~32 slots, ~13s)",
  2: "finalized (~15 min)",
  4: "finalized (~15 min)",
  5: "finalized (~2 min)",
  6: "finalized (~20s)",
  10: "finalized (~1s)",
  13: "finalized (~1s)",
  14: "finalized (~12s)",
  16: "finalized (~24s)",
  22: "finalized (~1s)",
  23: "safe (~2 min)",
  24: "safe (~2 min)",
  30: "safe (~2 min)"
};
function getChainInfo(nameOrId) {
  const entry = typeof nameOrId === "number" ? getChainById(nameOrId) : getChainByName(nameOrId);
  if (!entry) throw new ChainNotSupportedError(String(nameOrId));
  return {
    name: entry.name,
    wormholeChainId: entry.wormholeChainId,
    evmChainId: entry.evmChainId,
    rpcUrl: entry.defaultRpc,
    wormholeCore: entry.wormholeCore,
    finality: FINALITY_MAP[entry.wormholeChainId] ?? "unknown",
    isTestnet: entry.isTestnet ?? false
  };
}

// src/transfer.ts
var import_viem5 = require("viem");
function encodeTransferData(params) {
  return (0, import_viem5.encodeAbiParameters)(
    (0, import_viem5.parseAbiParameters)("address token, uint256 amount, uint16 recipientChain, bytes32 recipient, uint256 relayerFee, uint32 nonce"),
    [
      params.tokenAddress,
      params.amount,
      params.recipientChain,
      params.recipientAddress,
      params.relayerFee ?? 0n,
      params.nonce ?? 0
    ]
  );
}
async function initiateTransfer(params) {
  const data = encodeTransferData(params);
  const receipt = await params.sourceChain.sendTransaction(params.tokenBridgeAddress, data);
  return { receipt };
}

// src/tokens.ts
var import_viem6 = require("viem");
function encodeErc20Call(selector) {
  return selector;
}
var ERC20_NAME_SELECTOR = "0x06fdde03";
var ERC20_SYMBOL_SELECTOR = "0x95d89b41";
var ERC20_DECIMALS_SELECTOR = "0x313ce567";
async function callString(chain, token, selector) {
  const result = await chain.call(token, encodeErc20Call(selector));
  if (result === "0x" || result.length <= 2) return "";
  try {
    const [value] = (0, import_viem6.decodeAbiParameters)((0, import_viem6.parseAbiParameters)("string"), result);
    return value;
  } catch {
    return "";
  }
}
async function callUint8(chain, token, selector) {
  const result = await chain.call(token, encodeErc20Call(selector));
  if (result === "0x" || result.length <= 2) return 18;
  try {
    const [value] = (0, import_viem6.decodeAbiParameters)((0, import_viem6.parseAbiParameters)("uint8"), result);
    return Number(value);
  } catch {
    return 18;
  }
}
async function getTokenInfo(chain, tokenAddress) {
  const [name, symbol, decimals] = await Promise.all([
    callString(chain, tokenAddress, ERC20_NAME_SELECTOR),
    callString(chain, tokenAddress, ERC20_SYMBOL_SELECTOR),
    callUint8(chain, tokenAddress, ERC20_DECIMALS_SELECTOR)
  ]);
  return { address: tokenAddress, name, symbol, decimals };
}
var ERC20_BALANCE_OF_SELECTOR = "0x70a08231";
async function getTokenBalance(chain, tokenAddress, walletAddress) {
  const calldata = ERC20_BALANCE_OF_SELECTOR + (0, import_viem6.encodeAbiParameters)((0, import_viem6.parseAbiParameters)("address"), [walletAddress]).slice(2);
  const result = await chain.call(tokenAddress, calldata);
  let balance = 0n;
  if (result !== "0x" && result.length > 2) {
    try {
      const [v] = (0, import_viem6.decodeAbiParameters)((0, import_viem6.parseAbiParameters)("uint256"), result);
      balance = v;
    } catch {
    }
  }
  const info = await getTokenInfo(chain, tokenAddress);
  return { address: tokenAddress, balance, decimals: info.decimals, symbol: info.symbol };
}

// src/latency.ts
async function measureSigningLatency(params) {
  const {
    emitterChain,
    emitterAddress,
    sequence,
    txSubmittedAt,
    network = "mainnet",
    pollIntervalMs = 2e3,
    timeoutMs = 12e4
  } = params;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await getMessageStatus({ emitterChain, emitterAddress, sequence, network });
    if (result.status === "signed" /* Signed */) {
      return {
        emitterChain,
        emitterAddress,
        sequence,
        signingLatencyMs: Date.now() - txSubmittedAt,
        network
      };
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new WormToolError(
    `Timed out waiting for VAA signature after ${timeoutMs}ms (chain=${emitterChain}, seq=${sequence})`
  );
}

// src/generate.ts
var import_sha33 = require("@noble/hashes/sha3");
function generateTestVaa(params) {
  const {
    emitterChain,
    emitterAddress,
    sequence,
    payload,
    guardianSetIndex = 0,
    timestamp = Math.floor(Date.now() / 1e3),
    nonce = 0,
    consistencyLevel = 1
  } = params;
  const bodyParts = [];
  const writeU32 = (v) => {
    bodyParts.push(v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255);
  };
  const writeU16 = (v) => {
    bodyParts.push(v >> 8 & 255, v & 255);
  };
  const writeU64 = (v) => {
    for (let i = 7; i >= 0; i--) bodyParts.push(Number(v >> BigInt(i * 8) & 0xffn));
  };
  const writeHex = (h) => {
    const clean = h.startsWith("0x") ? h.slice(2) : h;
    for (let i = 0; i < clean.length; i += 2) bodyParts.push(parseInt(clean.slice(i, i + 2), 16));
  };
  writeU32(timestamp);
  writeU32(nonce);
  writeU16(emitterChain);
  writeHex(emitterAddress);
  writeU64(sequence);
  bodyParts.push(consistencyLevel);
  writeHex(payload);
  const bodyBytes = new Uint8Array(bodyParts);
  const hash = "0x" + Array.from((0, import_sha33.keccak_256)(bodyBytes), (b) => b.toString(16).padStart(2, "0")).join("");
  const signatures = [];
  return {
    version: 1,
    guardianSetIndex,
    signatures,
    timestamp,
    nonce,
    emitterChain,
    emitterAddress,
    sequence,
    consistencyLevel,
    payload,
    hash
  };
}
function generateTestVaaHex(params) {
  return encodeVaaHex(generateTestVaa(params));
}

// src/toolchain/detect.ts
var import_promises3 = require("fs/promises");
var import_path2 = require("path");
var ToolchainNotFoundError = class extends WormToolError {
  constructor(root) {
    super(`${root} is not a Foundry or Hardhat project (no foundry.toml or hardhat.config.ts/js found)`);
  }
};
async function exists(path) {
  try {
    await (0, import_promises3.access)(path);
    return true;
  } catch {
    return false;
  }
}
async function foundryArtifactDir(root) {
  try {
    const toml = await (0, import_promises3.readFile)((0, import_path2.join)(root, "foundry.toml"), "utf8");
    const match = /^\s*out\s*=\s*"([^"]+)"/m.exec(toml);
    return (0, import_path2.join)(root, match?.[1] ?? "out");
  } catch {
    return (0, import_path2.join)(root, "out");
  }
}
async function detectToolchain(root) {
  const hasFoundry = await exists((0, import_path2.join)(root, "foundry.toml"));
  if (hasFoundry) {
    return { type: "foundry", root, artifactDir: await foundryArtifactDir(root) };
  }
  const hasHardhatTs = await exists((0, import_path2.join)(root, "hardhat.config.ts"));
  const hasHardhatJs = await exists((0, import_path2.join)(root, "hardhat.config.js"));
  if (hasHardhatTs || hasHardhatJs) {
    return { type: "hardhat", root, artifactDir: (0, import_path2.join)(root, "artifacts") };
  }
  throw new ToolchainNotFoundError(root);
}

// src/toolchain/foundry.ts
var import_promises4 = require("fs/promises");
var import_path3 = require("path");

// src/toolchain/utils.ts
function extractConstructorInputs(abi) {
  const ctor = abi.find(
    (e) => typeof e === "object" && e !== null && e.type === "constructor"
  );
  return ctor?.inputs ?? [];
}

// src/toolchain/foundry.ts
async function readFoundryArtifacts(artifactDir) {
  const results = [];
  let solDirs;
  try {
    const entries = await (0, import_promises4.readdir)(artifactDir, { withFileTypes: true });
    solDirs = entries.filter((e) => e.isDirectory() && e.name.endsWith(".sol")).map((e) => (0, import_path3.join)(artifactDir, e.name));
  } catch {
    return [];
  }
  for (const solDir of solDirs) {
    const files = await (0, import_promises4.readdir)(solDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const contractName = (0, import_path3.basename)(file, ".json");
      const artifactPath = (0, import_path3.join)(solDir, file);
      let raw;
      try {
        raw = JSON.parse(await (0, import_promises4.readFile)(artifactPath, "utf8"));
      } catch (err) {
        process.stderr.write(`Warning: failed to parse artifact ${artifactPath}: ${err instanceof Error ? err.message : String(err)}
`);
        continue;
      }
      const bytecodeObj = raw.bytecode?.object ?? "";
      const bytecodeHex = bytecodeObj.startsWith("0x") ? bytecodeObj : "0x" + bytecodeObj;
      const isEmpty = bytecodeHex === "0x";
      const compilationTarget = raw.metadata?.settings?.compilationTarget ?? {};
      const sourcePath = Object.keys(compilationTarget)[0] ?? `${contractName}.sol`;
      const compilerVersion = raw.metadata?.compiler?.version ?? "unknown";
      const abi = raw.abi ?? [];
      const isInterface = isEmpty && abi.length > 0 && abi.every(
        (e) => e.type === "function" || e.type === "event" || e.type === "error"
      );
      results.push({
        name: contractName,
        sourcePath,
        artifactPath,
        abi,
        bytecode: bytecodeHex,
        constructorInputs: extractConstructorInputs(abi),
        isAbstract: isEmpty,
        isInterface,
        compilerVersion,
        ...raw.storageLayout !== void 0 && { storageLayout: raw.storageLayout }
      });
    }
  }
  return results;
}

// src/toolchain/hardhat.ts
var import_promises5 = require("fs/promises");
var import_path4 = require("path");
async function walkArtifactDir(dir) {
  const paths = [];
  try {
    const entries = await (0, import_promises5.readdir)(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = (0, import_path4.join)(dir, entry.name);
      if (entry.isDirectory()) {
        paths.push(...await walkArtifactDir(full));
      } else if (entry.name.endsWith(".json") && !entry.name.endsWith(".dbg.json")) {
        paths.push(full);
      }
    }
  } catch {
  }
  return paths;
}
async function readHardhatArtifacts(artifactDir) {
  const results = [];
  const files = await walkArtifactDir(artifactDir);
  for (const artifactPath of files) {
    let raw;
    try {
      raw = JSON.parse(await (0, import_promises5.readFile)(artifactPath, "utf8"));
    } catch (err) {
      process.stderr.write(`Warning: failed to parse artifact ${artifactPath}: ${err instanceof Error ? err.message : String(err)}
`);
      continue;
    }
    if (!raw._format?.startsWith("hh-sol-artifact")) continue;
    const contractName = raw.contractName ?? (0, import_path4.basename)(artifactPath, ".json");
    const sourcePath = raw.sourceName ?? `contracts/${contractName}.sol`;
    const bytecodeRaw = raw.bytecode ?? "0x";
    const bytecode = bytecodeRaw.startsWith("0x") ? bytecodeRaw : "0x" + bytecodeRaw;
    const isEmpty = bytecode === "0x";
    const abi = raw.abi ?? [];
    const allEntries = abi.filter((e) => typeof e === "object" && e !== null);
    const isInterface = isEmpty && allEntries.length > 0 && allEntries.every((e) => e.type === "function" || e.type === "event" || e.type === "error");
    results.push({
      name: contractName,
      sourcePath,
      artifactPath,
      abi,
      bytecode,
      constructorInputs: extractConstructorInputs(abi),
      isAbstract: isEmpty,
      isInterface,
      compilerVersion: "unknown",
      ...raw.storageLayout !== void 0 && { storageLayout: raw.storageLayout }
    });
  }
  return results;
}

// src/toolchain/index.ts
async function listArtifacts(info) {
  if (info.type === "foundry") return readFoundryArtifacts(info.artifactDir);
  return readHardhatArtifacts(info.artifactDir);
}

// src/index.ts
var SDK_VERSION = "0.0.1";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AptosChain,
  ArtifactParseError,
  CHAIN_REGISTRY,
  ChainNotSupportedError,
  ContractCallError,
  EngineError,
  EvmChain,
  ManifestParseError,
  MessageStatus,
  NearChain,
  PrivateKeyError,
  RpcError,
  SDK_VERSION,
  SolanaChain,
  SuiChain,
  ToolchainNotFoundError,
  VaaParseError,
  VerificationError,
  WormToolError,
  buildDependencyOrder,
  buildDeployPlan,
  buildVerificationPayload,
  callAcrossChains,
  checkContractDeployed,
  computeCreate2Address,
  deployAcrossChains,
  detectToolchain,
  diffStorageLayouts,
  encodeCallMessage,
  encodeDeployMessage,
  encodeUpgradeMessage,
  encodeVaaHex,
  extractBytecode,
  generateTestVaa,
  generateTestVaaHex,
  getAddress,
  getChainById,
  getChainByName,
  getChainInfo,
  getMessageStatus,
  getTokenBalance,
  getTokenInfo,
  importFromFoundryBroadcast,
  importFromHardhatDeploy,
  initiateTransfer,
  isDeployed,
  listArtifacts,
  loadAddressBook,
  measureSigningLatency,
  mergePartialBook,
  parseManifest,
  parseVaa,
  resolveEnvVars,
  resolveTemplateArg,
  runDeployment,
  saveAddressBook,
  setAddress,
  upgradeAcrossChains,
  verifyContract
});
//# sourceMappingURL=index.cjs.map