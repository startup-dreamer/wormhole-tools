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
  EvmChain: () => EvmChain,
  MessageStatus: () => MessageStatus,
  NearChain: () => NearChain,
  PrivateKeyError: () => PrivateKeyError,
  RpcError: () => RpcError,
  SDK_VERSION: () => SDK_VERSION,
  SolanaChain: () => SolanaChain,
  SuiChain: () => SuiChain,
  VaaParseError: () => VaaParseError,
  WormToolError: () => WormToolError,
  callAcrossChains: () => callAcrossChains,
  checkContractDeployed: () => checkContractDeployed,
  computeCreate2Address: () => computeCreate2Address,
  deployAcrossChains: () => deployAcrossChains,
  encodeCallMessage: () => encodeCallMessage,
  encodeDeployMessage: () => encodeDeployMessage,
  encodeUpgradeMessage: () => encodeUpgradeMessage,
  encodeVaaHex: () => encodeVaaHex,
  extractBytecode: () => extractBytecode,
  generateTestVaa: () => generateTestVaa,
  generateTestVaaHex: () => generateTestVaaHex,
  getChainById: () => getChainById,
  getChainByName: () => getChainByName,
  getChainInfo: () => getChainInfo,
  getMessageStatus: () => getMessageStatus,
  getTokenBalance: () => getTokenBalance,
  getTokenInfo: () => getTokenInfo,
  initiateTransfer: () => initiateTransfer,
  measureSigningLatency: () => measureSigningLatency,
  parseVaa: () => parseVaa,
  upgradeAcrossChains: () => upgradeAcrossChains
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
    super("Private key not found or invalid \u2014 set WORM_TOOL_PRIVATE_KEY");
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
    wormToolDeployer: "0xC8059e943CD42BfC6273C5A8E6F01fdB80Fa7748"
  },
  {
    wormholeChainId: 10003,
    name: "arbitrum-sepolia",
    evmChainId: 421614,
    isTestnet: true,
    defaultRpc: "https://sepolia-rollup.arbitrum.io/rpc",
    wormholeCore: "0x6b9C8671cdDC8dEab9c719bB87cBd3e782bA6a35",
    wormToolDeployer: "0xC8059e943CD42BfC6273C5A8E6F01fdB80Fa7748"
  },
  {
    wormholeChainId: 10004,
    name: "base-sepolia",
    evmChainId: 84532,
    isTestnet: true,
    defaultRpc: "https://sepolia.base.org",
    wormholeCore: "0x79A1027a6A159502049F10906D333EC57E95F083",
    wormToolDeployer: "0xC8059e943CD42BfC6273C5A8E6F01fdB80Fa7748"
  },
  { wormholeChainId: 4, name: "bsc-testnet", evmChainId: 97, isTestnet: true }
];
function getChainById(wormholeChainId) {
  return CHAIN_REGISTRY.find((c) => c.wormholeChainId === wormholeChainId && !c.isTestnet);
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
var import_viem3 = require("viem");

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
    { name: "newImpl", type: "address" }
  ],
  stateMutability: "payable"
}];
async function deployAcrossChains(params) {
  const { chains, bytecode, constructorArgs = "0x", salt, wormToolDeployerAddress, value = 0n } = params;
  const [sourceChain, ...rest] = chains;
  if (!sourceChain) throw new WormToolError("deployAcrossChains: at least one chain required");
  const targetChainIds = rest.map((c) => Number(c.chainId));
  const data = (0, import_viem3.encodeFunctionData)({
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
  const data = (0, import_viem3.encodeFunctionData)({
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
  const data = (0, import_viem3.encodeFunctionData)({
    abi: UPGRADE_ABI,
    functionName: "upgradeAcrossChains",
    args: [targetChainIds, proxy, newImpl]
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
var import_viem4 = require("viem");
function encodeTransferData(params) {
  return (0, import_viem4.encodeAbiParameters)(
    (0, import_viem4.parseAbiParameters)("address token, uint256 amount, uint16 recipientChain, bytes32 recipient, uint256 relayerFee, uint32 nonce"),
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
var import_viem5 = require("viem");
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
    const [value] = (0, import_viem5.decodeAbiParameters)((0, import_viem5.parseAbiParameters)("string"), result);
    return value;
  } catch {
    return "";
  }
}
async function callUint8(chain, token, selector) {
  const result = await chain.call(token, encodeErc20Call(selector));
  if (result === "0x" || result.length <= 2) return 18;
  try {
    const [value] = (0, import_viem5.decodeAbiParameters)((0, import_viem5.parseAbiParameters)("uint8"), result);
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
  const calldata = ERC20_BALANCE_OF_SELECTOR + (0, import_viem5.encodeAbiParameters)((0, import_viem5.parseAbiParameters)("address"), [walletAddress]).slice(2);
  const result = await chain.call(tokenAddress, calldata);
  let balance = 0n;
  if (result !== "0x" && result.length > 2) {
    try {
      const [v] = (0, import_viem5.decodeAbiParameters)((0, import_viem5.parseAbiParameters)("uint256"), result);
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

// src/index.ts
var SDK_VERSION = "0.0.1";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AptosChain,
  ArtifactParseError,
  CHAIN_REGISTRY,
  ChainNotSupportedError,
  ContractCallError,
  EvmChain,
  MessageStatus,
  NearChain,
  PrivateKeyError,
  RpcError,
  SDK_VERSION,
  SolanaChain,
  SuiChain,
  VaaParseError,
  WormToolError,
  callAcrossChains,
  checkContractDeployed,
  computeCreate2Address,
  deployAcrossChains,
  encodeCallMessage,
  encodeDeployMessage,
  encodeUpgradeMessage,
  encodeVaaHex,
  extractBytecode,
  generateTestVaa,
  generateTestVaaHex,
  getChainById,
  getChainByName,
  getChainInfo,
  getMessageStatus,
  getTokenBalance,
  getTokenInfo,
  initiateTransfer,
  measureSigningLatency,
  parseVaa,
  upgradeAcrossChains
});
//# sourceMappingURL=index.cjs.map