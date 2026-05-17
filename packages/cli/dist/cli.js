#!/usr/bin/env node

// src/main.ts
import { Command } from "commander";

// src/commands/parse.ts
import { parseVaa } from "@worm-tool/sdk";

// src/output.ts
function printJson(value) {
  console.log(JSON.stringify(value, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
}
function printError(message, err) {
  const detail = err instanceof Error ? `: ${err.message}` : err ? `: ${String(err)}` : "";
  process.stderr.write(`Error: ${message}${detail}
`);
}

// src/commands/parse.ts
function registerParseCommand(program2) {
  program2.command("parse <vaa>").description("Parse a VAA from hex or base64 and print its fields as JSON").action((vaa) => {
    try {
      printJson(parseVaa(vaa));
    } catch (err) {
      printError("Failed to parse VAA", err);
      process.exit(1);
    }
  });
}

// src/commands/info.ts
import { getChainInfo, getChainByName, CHAIN_REGISTRY } from "@worm-tool/sdk";
function registerInfoCommand(program2) {
  const info = program2.command("info").description("Query Wormhole chain and contract metadata");
  info.command("chain-id <chain>").description("Print the Wormhole chain ID for a named chain").action((chain) => {
    try {
      const entry = getChainByName(chain);
      if (!entry) {
        printError(`Unknown chain: ${chain}`);
        process.exit(1);
      }
      printJson({ chain: entry.name, wormholeChainId: entry.wormholeChainId });
    } catch (err) {
      printError("chain-id failed", err);
      process.exit(1);
    }
  });
  info.command("contract-address <chain>").description("Print known contract addresses for a chain").option("--network <network>", "mainnet or testnet", "mainnet").action((chain) => {
    try {
      const entry = getChainByName(chain);
      if (!entry) {
        printError(`Unknown chain: ${chain}`);
        process.exit(1);
      }
      printJson({
        chain: entry.name,
        wormholeChainId: entry.wormholeChainId,
        wormholeCore: entry.wormholeCore ?? null,
        wormToolDeployer: entry.wormToolDeployer ?? null
      });
    } catch (err) {
      printError("contract-address failed", err);
      process.exit(1);
    }
  });
  info.command("chains").description("List all supported chains").option("--testnet", "include testnet chains").action((opts) => {
    const chains = opts.testnet ? CHAIN_REGISTRY : CHAIN_REGISTRY.filter((c) => !c.isTestnet);
    printJson(chains.map((c) => ({
      name: c.name,
      wormholeChainId: c.wormholeChainId,
      evmChainId: c.evmChainId ?? null,
      isTestnet: c.isTestnet ?? false
    })));
  });
  info.command("summary <chain>").description("Print a full summary for a chain (name, IDs, finality, contracts)").action((chain) => {
    try {
      const asNum = parseInt(chain, 10);
      const summary = Number.isNaN(asNum) ? getChainInfo(chain) : getChainInfo(asNum);
      printJson(summary);
    } catch (err) {
      printError("summary failed", err);
      process.exit(1);
    }
  });
}

// src/commands/generate.ts
import { generateTestVaaHex } from "@worm-tool/sdk";
function registerGenerateCommand(program2) {
  const gen2 = program2.command("generate").description("Generate VAAs for devnet and testnet use");
  gen2.command("test-vaa").description("Generate a synthetic (unsigned) test VAA").requiredOption("--emitter-chain <id>", "Wormhole emitter chain ID", parseInt).requiredOption("--emitter-address <hex>", "32-byte emitter address (0x-prefixed hex)").requiredOption("--sequence <n>", "Message sequence number", (v) => BigInt(v)).requiredOption("--payload <hex>", "Payload bytes (0x-prefixed hex)").option("--timestamp <n>", "Unix timestamp (default: now)", parseInt).option("--nonce <n>", "Nonce (default: 0)", parseInt).option("--consistency-level <n>", "Consistency level (default: 1)", parseInt).action((opts) => {
    try {
      const hex = generateTestVaaHex({
        emitterChain: opts.emitterChain,
        emitterAddress: opts.emitterAddress,
        sequence: opts.sequence,
        payload: opts.payload,
        ...opts.timestamp !== void 0 && { timestamp: opts.timestamp },
        ...opts.nonce !== void 0 && { nonce: opts.nonce },
        ...opts.consistencyLevel !== void 0 && { consistencyLevel: opts.consistencyLevel }
      });
      printJson({ vaa: hex });
    } catch (err) {
      printError("generate test-vaa failed", err);
      process.exit(1);
    }
  });
}

// src/commands/status.ts
import { MessageStatus } from "@worm-tool/sdk";
function registerStatusCommand(program2) {
  program2.command("status <txHash>").description("Track a Wormhole message by its source transaction hash").option("--network <network>", "mainnet or testnet", "mainnet").action(async (txHash, opts) => {
    if (!txHash.startsWith("0x") || txHash.length !== 66) {
      printError("txHash must be 0x-prefixed and 66 characters (32 bytes)");
      process.exit(1);
    }
    const network = opts.network === "testnet" ? "testnet" : "mainnet";
    try {
      const base = network === "testnet" ? "https://api.testnet.wormholescan.io" : "https://api.wormholescan.io";
      const res = await fetch(`${base}/api/v1/transactions/${txHash}`);
      if (!res.ok) {
        if (res.status === 404) {
          printJson({ txHash, status: MessageStatus.Pending, message: "Transaction not yet indexed" });
          return;
        }
        throw new Error(`Wormholescan returned ${res.status}`);
      }
      const data = await res.json();
      printJson(data);
    } catch (err) {
      printError("status lookup failed", err);
      process.exit(1);
    }
  });
}

// src/commands/latency.ts
import { getChainInfo as getChainInfo2 } from "@worm-tool/sdk";
function registerLatencyCommand(program2) {
  program2.command("latency <chain>").description("Measure guardian signing latency for a source chain").option("--network <network>", "mainnet or testnet", "mainnet").option("--count <n>", "Number of recent VAAs to sample", "20").action(async (chain, opts) => {
    const count = parseInt(opts.count, 10);
    if (Number.isNaN(count) || count <= 0) {
      printError("--count must be a positive integer");
      process.exit(1);
    }
    try {
      const info = getChainInfo2(chain);
      const network = opts.network === "testnet" ? "testnet" : "mainnet";
      const base = network === "testnet" ? "https://api.testnet.wormholescan.io" : "https://api.wormholescan.io";
      const url = `${base}/api/v1/vaas/${info.wormholeChainId}?pageSize=${count}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Wormholescan returned ${res.status}`);
      const data = await res.json();
      const vaas = data.data ?? [];
      const latencies = [];
      for (const vaa of vaas) {
        if (vaa.indexedAt && vaa.timestamp) {
          const indexed = new Date(vaa.indexedAt).getTime();
          const emitted = new Date(vaa.timestamp).getTime();
          if (!Number.isNaN(indexed) && !Number.isNaN(emitted) && indexed > emitted) {
            latencies.push((indexed - emitted) / 1e3);
          }
        }
      }
      latencies.sort((a, b) => a - b);
      const p = (pct) => {
        if (latencies.length === 0) return null;
        const idx = Math.floor(latencies.length * pct);
        return latencies[Math.min(idx, latencies.length - 1)] ?? null;
      };
      printJson({
        chain,
        wormholeChainId: info.wormholeChainId,
        sampleCount: latencies.length,
        p50Secs: p(0.5),
        p95Secs: p(0.95),
        minSecs: latencies[0] ?? null,
        maxSecs: latencies[latencies.length - 1] ?? null
      });
    } catch (err) {
      printError("latency fetch failed", err);
      process.exit(1);
    }
  });
}

// src/commands/deploy.ts
import { readFile } from "fs/promises";
import {
  extractBytecode,
  computeCreate2Address,
  deployAcrossChains,
  callAcrossChains,
  upgradeAcrossChains,
  checkContractDeployed,
  getChainByName as getChainByName3
} from "@worm-tool/sdk";

// ../../node_modules/@noble/hashes/esm/_u64.js
var U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
var _32n = /* @__PURE__ */ BigInt(32);
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
var rotlSH = (h, l, s) => h << s | l >>> 32 - s;
var rotlSL = (h, l, s) => l << s | h >>> 32 - s;
var rotlBH = (h, l, s) => l << s - 32 | h >>> 64 - s;
var rotlBL = (h, l, s) => h << s - 32 | l >>> 64 - s;

// ../../node_modules/@noble/hashes/esm/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function u32(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
var isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
function byteSwap(word) {
  return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
}
function byteSwap32(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = byteSwap(arr[i]);
  }
  return arr;
}
var swap32IfBE = isLE ? (u) => u : byteSwap32;
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
var Hash = class {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}

// ../../node_modules/@noble/hashes/esm/sha3.js
var _0n = BigInt(0);
var _1n = BigInt(1);
var _2n = BigInt(2);
var _7n = BigInt(7);
var _256n = BigInt(256);
var _0x71n = BigInt(113);
var SHA3_PI = [];
var SHA3_ROTL = [];
var _SHA3_IOTA = [];
for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
  [x, y] = [y, (2 * x + 3 * y) % 5];
  SHA3_PI.push(2 * (5 * y + x));
  SHA3_ROTL.push((round + 1) * (round + 2) / 2 % 64);
  let t = _0n;
  for (let j = 0; j < 7; j++) {
    R = (R << _1n ^ (R >> _7n) * _0x71n) % _256n;
    if (R & _2n)
      t ^= _1n << (_1n << /* @__PURE__ */ BigInt(j)) - _1n;
  }
  _SHA3_IOTA.push(t);
}
var IOTAS = split(_SHA3_IOTA, true);
var SHA3_IOTA_H = IOTAS[0];
var SHA3_IOTA_L = IOTAS[1];
var rotlH = (h, l, s) => s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s);
var rotlL = (h, l, s) => s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s);
function keccakP(s, rounds = 24) {
  const B = new Uint32Array(5 * 2);
  for (let round = 24 - rounds; round < 24; round++) {
    for (let x = 0; x < 10; x++)
      B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
    for (let x = 0; x < 10; x += 2) {
      const idx1 = (x + 8) % 10;
      const idx0 = (x + 2) % 10;
      const B0 = B[idx0];
      const B1 = B[idx0 + 1];
      const Th = rotlH(B0, B1, 1) ^ B[idx1];
      const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
      for (let y = 0; y < 50; y += 10) {
        s[x + y] ^= Th;
        s[x + y + 1] ^= Tl;
      }
    }
    let curH = s[2];
    let curL = s[3];
    for (let t = 0; t < 24; t++) {
      const shift = SHA3_ROTL[t];
      const Th = rotlH(curH, curL, shift);
      const Tl = rotlL(curH, curL, shift);
      const PI = SHA3_PI[t];
      curH = s[PI];
      curL = s[PI + 1];
      s[PI] = Th;
      s[PI + 1] = Tl;
    }
    for (let y = 0; y < 50; y += 10) {
      for (let x = 0; x < 10; x++)
        B[x] = s[y + x];
      for (let x = 0; x < 10; x++)
        s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
    }
    s[0] ^= SHA3_IOTA_H[round];
    s[1] ^= SHA3_IOTA_L[round];
  }
  clean(B);
}
var Keccak = class _Keccak extends Hash {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
    super();
    this.pos = 0;
    this.posOut = 0;
    this.finished = false;
    this.destroyed = false;
    this.enableXOF = false;
    this.blockLen = blockLen;
    this.suffix = suffix;
    this.outputLen = outputLen;
    this.enableXOF = enableXOF;
    this.rounds = rounds;
    anumber(outputLen);
    if (!(0 < blockLen && blockLen < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200);
    this.state32 = u32(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    swap32IfBE(this.state32);
    keccakP(this.state32, this.rounds);
    swap32IfBE(this.state32);
    this.posOut = 0;
    this.pos = 0;
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { blockLen, state } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      for (let i = 0; i < take; i++)
        state[this.pos++] ^= data[pos++];
      if (this.pos === blockLen)
        this.keccak();
    }
    return this;
  }
  finish() {
    if (this.finished)
      return;
    this.finished = true;
    const { state, suffix, pos, blockLen } = this;
    state[pos] ^= suffix;
    if ((suffix & 128) !== 0 && pos === blockLen - 1)
      this.keccak();
    state[blockLen - 1] ^= 128;
    this.keccak();
  }
  writeInto(out) {
    aexists(this, false);
    abytes(out);
    this.finish();
    const bufferOut = this.state;
    const { blockLen } = this;
    for (let pos = 0, len = out.length; pos < len; ) {
      if (this.posOut >= blockLen)
        this.keccak();
      const take = Math.min(blockLen - this.posOut, len - pos);
      out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
      this.posOut += take;
      pos += take;
    }
    return out;
  }
  xofInto(out) {
    if (!this.enableXOF)
      throw new Error("XOF is not possible for this instance");
    return this.writeInto(out);
  }
  xof(bytes) {
    anumber(bytes);
    return this.xofInto(new Uint8Array(bytes));
  }
  digestInto(out) {
    aoutput(out, this);
    if (this.finished)
      throw new Error("digest() was already called");
    this.writeInto(out);
    this.destroy();
    return out;
  }
  digest() {
    return this.digestInto(new Uint8Array(this.outputLen));
  }
  destroy() {
    this.destroyed = true;
    clean(this.state);
  }
  _cloneInto(to) {
    const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
    to || (to = new _Keccak(blockLen, suffix, outputLen, enableXOF, rounds));
    to.state32.set(this.state32);
    to.pos = this.pos;
    to.posOut = this.posOut;
    to.finished = this.finished;
    to.rounds = rounds;
    to.suffix = suffix;
    to.outputLen = outputLen;
    to.enableXOF = enableXOF;
    to.destroyed = this.destroyed;
    return to;
  }
};
var gen = (suffix, blockLen, outputLen) => createHasher(() => new Keccak(blockLen, suffix, outputLen));
var keccak_256 = /* @__PURE__ */ (() => gen(1, 136, 256 / 8))();

// src/config.ts
import { config as loadDotenv } from "dotenv";
import { resolve } from "path";
import { homedir } from "os";
function loadConfig() {
  loadDotenv({ path: resolve(homedir(), ".worm-tool", ".env"), override: false });
  const pk = process.env["WORM_TOOL_PRIVATE_KEY"];
  const rpcUrls = {};
  for (const [key, value] of Object.entries(process.env)) {
    const match = /^WORM_TOOL_RPC_(.+)$/.exec(key);
    if (match?.[1] && value) rpcUrls[match[1].toLowerCase()] = value;
  }
  return {
    privateKey: pk ? pk : void 0,
    rpcUrls,
    network: process.env["WORM_TOOL_NETWORK"] === "testnet" ? "testnet" : "mainnet"
  };
}

// src/providers/evm.ts
import { EvmChain, getChainByName as getChainByName2, ChainNotSupportedError } from "@worm-tool/sdk";
function createEvmChain(chainName, config) {
  const entry = getChainByName2(chainName);
  if (!entry) throw new ChainNotSupportedError(chainName);
  if (entry.evmChainId === void 0) {
    throw new ChainNotSupportedError(`${chainName} is not an EVM chain`);
  }
  const rpcUrl = config.rpcUrls[chainName] ?? entry.defaultRpc;
  if (!rpcUrl) {
    throw new Error(`No RPC URL for ${chainName} \u2014 set WORM_TOOL_RPC_${chainName.toUpperCase()} in ~/.worm-tool/.env`);
  }
  return new EvmChain({
    rpcUrl,
    wormholeChainId: BigInt(entry.wormholeChainId),
    evmChainId: entry.evmChainId,
    ...config.privateKey !== void 0 && { privateKey: config.privateKey }
  });
}

// src/commands/deploy.ts
function saltFromStr(s) {
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) {
    return s.startsWith("0x") ? s : "0x" + s;
  }
  const hash = keccak_256(new TextEncoder().encode(s));
  return "0x" + Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function resolveBytecode(artifact, bytecodeHex) {
  if (artifact) {
    const json = JSON.parse(await readFile(artifact, "utf8"));
    return extractBytecode(json, artifact);
  }
  if (bytecodeHex) {
    return bytecodeHex.startsWith("0x") ? bytecodeHex : "0x" + bytecodeHex;
  }
  throw new Error("Provide --artifact or --bytecode");
}
function resolveDeployer(chainName, override) {
  if (override) return override;
  const entry = getChainByName3(chainName);
  if (!entry?.wormToolDeployer) {
    throw new Error(`No WormToolDeployer address known for ${chainName} \u2014 set --deployer`);
  }
  return entry.wormToolDeployer;
}
function registerDeployCommand(program2) {
  const deploy = program2.command("deploy").description("Deploy and manage contracts across chains via WormToolDeployer");
  deploy.command("address").description("Compute the CREATE2 deployment address offline (no key required)").option("--artifact <path>", "Path to Hardhat/Foundry artifact JSON").option("--bytecode <hex>", "Raw init bytecode (0x-prefixed)").requiredOption("--salt <salt>", "CREATE2 salt: 32-byte hex or an arbitrary string (keccak256'd)").requiredOption("--deployer <address>", "WormToolDeployer contract address (20-byte hex)").action(async (opts) => {
    try {
      const bytecode = await resolveBytecode(opts.artifact, opts.bytecode);
      const salt = saltFromStr(opts.salt);
      const hex = bytecode.startsWith("0x") ? bytecode.slice(2) : bytecode;
      const initBytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < initBytes.length; i++) initBytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      const initCodeHash = "0x" + Array.from(keccak_256(initBytes), (b) => b.toString(16).padStart(2, "0")).join("");
      const address = computeCreate2Address(opts.deployer, salt, initCodeHash);
      printJson({ address, salt, initCodeHash, deployer: opts.deployer });
    } catch (err) {
      printError("deploy address failed", err);
      process.exit(1);
    }
  });
  deploy.command("multi").description("Deploy bytecode to multiple chains in one source transaction").option("--artifact <path>", "Path to Hardhat/Foundry artifact JSON").option("--bytecode <hex>", "Raw init bytecode (0x-prefixed)").requiredOption("--salt <salt>", "CREATE2 salt").requiredOption("--source <chain>", "Source chain (where the tx is sent)").option("--targets <chains>", "Comma-separated cross-chain target names (omit for local-only)").option("--init-hex <hex>", "ABI-encoded constructor calldata").option("--deployer <address>", "Override WormToolDeployer address").option("--value <wei>", "ETH (in wei) to send for Wormhole relayer fees when using --targets").action(async (opts) => {
    try {
      const config = loadConfig();
      const bytecode = await resolveBytecode(opts.artifact, opts.bytecode);
      const salt = saltFromStr(opts.salt);
      const targetNames = opts.targets ? opts.targets.split(",").map((s) => s.trim()) : [];
      const chains = [opts.source, ...targetNames].filter((v, i, a) => a.indexOf(v) === i).map((n) => createEvmChain(n, config));
      const deployer = resolveDeployer(opts.source, opts.deployer);
      const results = await deployAcrossChains({
        chains,
        bytecode,
        salt,
        wormToolDeployerAddress: deployer,
        ...opts.initHex !== void 0 && { constructorArgs: opts.initHex },
        ...opts.value !== void 0 && { value: BigInt(opts.value) }
      });
      printJson(results.map((r) => ({ chain: r.chain, chainId: r.chainId.toString(), txHash: r.receipt.txHash, success: r.receipt.success })));
    } catch (err) {
      printError("deploy multi failed", err);
      process.exit(1);
    }
  });
  deploy.command("call").description("Send a cross-chain function call through WormToolDeployer").requiredOption("--target <address>", "Target contract address").requiredOption("--calldata <hex>", "ABI-encoded calldata (0x-prefixed)").requiredOption("--chains <chains>", "Comma-separated chain names").option("--deployer <address>", "Override WormToolDeployer address").action(async (opts) => {
    try {
      const config = loadConfig();
      const chainNames = opts.chains.split(",").map((s) => s.trim());
      const chains = chainNames.map((n) => createEvmChain(n, config));
      const deployer = resolveDeployer(chainNames[0], opts.deployer);
      const results = await callAcrossChains({
        chains,
        target: opts.target,
        calldata: opts.calldata,
        wormToolDeployerAddress: deployer
      });
      printJson(results.map((r) => ({ chain: r.chain, txHash: r.receipt.txHash, success: r.receipt.success })));
    } catch (err) {
      printError("deploy call failed", err);
      process.exit(1);
    }
  });
  deploy.command("upgrade").description("Upgrade a UUPS proxy to a new implementation across chains").requiredOption("--proxy <address>", "Proxy contract address").requiredOption("--new-impl <address>", "New implementation address").requiredOption("--chains <chains>", "Comma-separated chain names").option("--deployer <address>", "Override WormToolDeployer address").action(async (opts) => {
    try {
      const config = loadConfig();
      const chainNames = opts.chains.split(",").map((s) => s.trim());
      const chains = chainNames.map((n) => createEvmChain(n, config));
      const deployer = resolveDeployer(chainNames[0], opts.deployer);
      const results = await upgradeAcrossChains({
        chains,
        proxy: opts.proxy,
        newImpl: opts.newImpl,
        wormToolDeployerAddress: deployer
      });
      printJson(results.map((r) => ({ chain: r.chain, txHash: r.receipt.txHash, success: r.receipt.success })));
    } catch (err) {
      printError("deploy upgrade failed", err);
      process.exit(1);
    }
  });
  deploy.command("status").description("Check per-chain deployment status at a known contract address").requiredOption("--address <address>", "Contract address to check").requiredOption("--chains <chains>", "Comma-separated chain names").action(async (opts) => {
    try {
      const config = loadConfig();
      const chainNames = opts.chains.split(",").map((s) => s.trim());
      const results = await Promise.all(
        chainNames.map(async (name) => {
          const chain = createEvmChain(name, config);
          const deployed = await checkContractDeployed(chain, opts.address);
          return { chain: name, address: opts.address, deployed };
        })
      );
      printJson(results);
    } catch (err) {
      printError("deploy status failed", err);
      process.exit(1);
    }
  });
}

// src/commands/transfer.ts
import { initiateTransfer } from "@worm-tool/sdk";
function registerTransferCommand(program2) {
  program2.command("transfer").description("Initiate a Wormhole Token Bridge transfer").requiredOption("--token <address>", "ERC-20 token address (0x-prefixed)").requiredOption("--amount <n>", "Amount in token base units").requiredOption("--dst-chain <id>", "Destination Wormhole chain ID", parseInt).requiredOption("--recipient <hex>", "32-byte recipient address on destination chain (0x-prefixed hex)").requiredOption("--token-bridge <address>", "Token Bridge contract address").option("--chain <name>", "Source EVM chain name", "ethereum").option("--relayer-fee <n>", "Relayer fee in token base units (default 0)", "0").option("--nonce <n>", "Transfer nonce (default 0)", "0").action(async (opts) => {
    try {
      const config = loadConfig();
      const chain = createEvmChain(opts.chain, config);
      const result = await initiateTransfer({
        sourceChain: chain,
        tokenBridgeAddress: opts.tokenBridge,
        tokenAddress: opts.token,
        amount: BigInt(opts.amount),
        recipientChain: opts.dstChain,
        recipientAddress: opts.recipient,
        relayerFee: BigInt(opts.relayerFee),
        nonce: parseInt(opts.nonce, 10)
      });
      printJson({ txHash: result.receipt.txHash, success: result.receipt.success });
    } catch (err) {
      printError("transfer failed", err);
      process.exit(1);
    }
  });
}

// src/commands/tokens.ts
import { getTokenInfo, getTokenBalance } from "@worm-tool/sdk";
function registerTokensCommand(program2) {
  const tokens = program2.command("tokens").description("Query ERC-20 token information on EVM chains");
  tokens.command("info <tokenAddress>").description("Fetch ERC-20 token metadata (name, symbol, decimals)").requiredOption("--chain <name>", "EVM chain name (e.g. ethereum)").action(async (tokenAddress, opts) => {
    try {
      const config = loadConfig();
      const chain = createEvmChain(opts.chain, config);
      const info = await getTokenInfo(chain, tokenAddress);
      printJson(info);
    } catch (err) {
      printError("tokens info failed", err);
      process.exit(1);
    }
  });
  tokens.command("balance <tokenAddress> <walletAddress>").description("Fetch ERC-20 token balance for a wallet").requiredOption("--chain <name>", "EVM chain name").action(async (tokenAddress, walletAddress, opts) => {
    try {
      const config = loadConfig();
      const chain = createEvmChain(opts.chain, config);
      const balance = await getTokenBalance(chain, tokenAddress, walletAddress);
      printJson(balance);
    } catch (err) {
      printError("tokens balance failed", err);
      process.exit(1);
    }
  });
}

// src/commands/submit.ts
import { parseVaa as parseVaa2, getChainByName as getChainByName4 } from "@worm-tool/sdk";
function abiEncodeBytes(hex) {
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  const byteLen = raw.length / 2;
  const paddedLen = Math.ceil(byteLen / 32) * 32;
  const offset = "0000000000000000000000000000000000000000000000000000000000000020";
  const len = byteLen.toString(16).padStart(64, "0");
  return `0x${offset}${len}${raw.padEnd(paddedLen * 2, "0")}`;
}
function registerSubmitCommand(program2) {
  program2.command("submit <vaa>").description("Submit a signed VAA to a Wormhole contract on an EVM chain").requiredOption("--chain <name>", "Target EVM chain name (e.g. ethereum)").requiredOption("--selector <hex>", "4-byte function selector, e.g. 0x5cb8cae2 (submitContractUpgrade), 0xc6878519 (completeTransfer)").option("--contract <address>", "Target contract address (overrides default core bridge)").action(async (vaa, opts) => {
    try {
      const config = loadConfig();
      const parsed = parseVaa2(vaa);
      const chain = createEvmChain(opts.chain, config);
      const contract = opts.contract ?? (() => {
        const entry = getChainByName4(opts.chain);
        if (!entry?.wormholeCore) throw new Error(`No known core bridge for ${opts.chain} \u2014 provide --contract`);
        return entry.wormholeCore;
      })();
      const selector = opts.selector.startsWith("0x") ? opts.selector : "0x" + opts.selector;
      const rawHex = vaa.startsWith("0x") ? vaa : "0x" + vaa;
      const data = selector + abiEncodeBytes(rawHex).slice(2);
      const receipt = await chain.sendTransaction(contract, data);
      printJson({ txHash: receipt.txHash, success: receipt.success, chain: opts.chain, sequence: parsed.sequence.toString() });
    } catch (err) {
      printError("submit failed", err);
      process.exit(1);
    }
  });
}

// src/commands/redeem.ts
import { parseVaa as parseVaa3 } from "@worm-tool/sdk";
function abiEncodeBytes2(hex) {
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  const byteLen = raw.length / 2;
  const paddedLen = Math.ceil(byteLen / 32) * 32;
  const offset = "0000000000000000000000000000000000000000000000000000000000000020";
  const len = byteLen.toString(16).padStart(64, "0");
  return `0x${offset}${len}${raw.padEnd(paddedLen * 2, "0")}`;
}
function isTxHash(input) {
  return input.startsWith("0x") && input.length === 66 && /^[0-9a-fA-F]+$/.test(input.slice(2));
}
function registerRedeemCommand(program2) {
  program2.command("redeem <input>").description("Manually redeem a Wormhole VAA on the destination EVM chain (input: tx hash or raw VAA hex/base64)").requiredOption("--chain <name>", "Destination EVM chain name (e.g. ethereum)").option("--contract <address>", "Target contract address").option("--selector <hex>", "Function selector override (default: completeTransfer 0xc6878519)").option("--network <network>", "mainnet or testnet (used if input is a tx hash)", "mainnet").action(async (input, opts) => {
    try {
      const config = loadConfig();
      const network = opts.network === "testnet" ? "testnet" : "mainnet";
      let vaaHex;
      if (isTxHash(input)) {
        const base = network === "testnet" ? "https://api.testnet.wormholescan.io" : "https://api.wormholescan.io";
        const res = await fetch(`${base}/api/v1/transactions/${input}`);
        if (!res.ok) throw new Error(`Failed to fetch VAA for tx ${input}: ${res.status}`);
        const data2 = await res.json();
        const raw = data2.data?.vaa?.raw;
        if (!raw) throw new Error(`No VAA found for tx ${input} (not yet signed?)`);
        vaaHex = raw.startsWith("0x") ? raw : "0x" + raw;
      } else {
        parseVaa3(input);
        vaaHex = input.startsWith("0x") ? input : "0x" + input;
      }
      const chain = createEvmChain(opts.chain, config);
      if (!opts.contract) throw new Error(`--contract is required for ${opts.chain}`);
      const selectorRaw = opts.selector ?? "0xc6878519";
      const selector = selectorRaw.startsWith("0x") ? selectorRaw : "0x" + selectorRaw;
      const data = selector + abiEncodeBytes2(vaaHex).slice(2);
      const receipt = await chain.sendTransaction(opts.contract, data);
      printJson({ txHash: receipt.txHash, success: receipt.success, chain: opts.chain });
    } catch (err) {
      printError("redeem failed", err);
      process.exit(1);
    }
  });
}

// src/commands/evm.ts
function registerEvmCommand(program2) {
  const evm = program2.command("evm").description("Interact with Wormhole contracts on EVM chains");
  evm.command("balance <address>").description("Get the native balance of an address").requiredOption("--chain <name>", "EVM chain name").action(async (address, opts) => {
    try {
      const config = loadConfig();
      const chain = createEvmChain(opts.chain, config);
      const balance = await chain.getBalance(address);
      printJson({ address, chain: opts.chain, balanceWei: balance.toString() });
    } catch (err) {
      printError("evm balance failed", err);
      process.exit(1);
    }
  });
  evm.command("code <address>").description("Get the bytecode deployed at an address").requiredOption("--chain <name>", "EVM chain name").action(async (address, opts) => {
    try {
      const config = loadConfig();
      const chain = createEvmChain(opts.chain, config);
      const code = await chain.getCode(address);
      printJson({ address, chain: opts.chain, bytecode: code, deployed: code !== "0x" && code.length > 2 });
    } catch (err) {
      printError("evm code failed", err);
      process.exit(1);
    }
  });
  evm.command("call <to> <data>").description("Make a read-only eth_call to a contract").requiredOption("--chain <name>", "EVM chain name").action(async (to, data, opts) => {
    try {
      const config = loadConfig();
      const chain = createEvmChain(opts.chain, config);
      const result = await chain.call(to, data);
      printJson({ to, chain: opts.chain, result });
    } catch (err) {
      printError("evm call failed", err);
      process.exit(1);
    }
  });
}

// src/commands/solana.ts
import { SolanaChain } from "@worm-tool/sdk";
function registerSolanaCommand(program2) {
  const solana = program2.command("solana").description("Interact with Wormhole contracts on Solana");
  solana.command("balance <address>").description("Get the SOL balance of an account (in lamports)").option("--rpc <url>", "Solana RPC URL", "https://api.mainnet-beta.solana.com").action(async (address, opts) => {
    try {
      const chain = new SolanaChain({ rpcUrl: opts.rpc });
      const balance = await chain.getBalance(address);
      printJson({ address, balanceLamports: balance.toString(), balanceSol: (Number(balance) / 1e9).toFixed(9) });
    } catch (err) {
      printError("solana balance failed", err);
      process.exit(1);
    }
  });
}

// src/commands/aptos.ts
function registerAptosCommand(program2) {
  const aptos = program2.command("aptos").description("Interact with Wormhole contracts on Aptos");
  aptos.command("info").description("Print Aptos Wormhole chain info").action(() => {
    printJson({ chain: "aptos", wormholeChainId: 22, status: "read-only support (full SDK coming soon)" });
  });
  aptos.command("balance <address>").description("Get APT balance of an account (not yet implemented)").option("--rpc <url>", "Aptos node URL", "https://fullnode.mainnet.aptoslabs.com").action(async (_address, _opts) => {
    printError("Aptos balance not yet implemented \u2014 contributions welcome");
    process.exit(1);
  });
}

// src/commands/near.ts
function registerNearCommand(program2) {
  const near = program2.command("near").description("Interact with Wormhole contracts on NEAR");
  near.command("info").description("Print NEAR Wormhole chain info").action(() => {
    printJson({ chain: "near", wormholeChainId: 15, status: "read-only support (full SDK coming soon)" });
  });
  near.command("balance <accountId>").description("Get NEAR balance of an account (not yet implemented)").action(async (_accountId) => {
    printError("NEAR balance not yet implemented \u2014 contributions welcome");
    process.exit(1);
  });
}

// src/commands/sui.ts
function registerSuiCommand(program2) {
  const sui = program2.command("sui").description("Interact with Wormhole contracts on Sui");
  sui.command("info").description("Print Sui Wormhole chain info").action(() => {
    printJson({ chain: "sui", wormholeChainId: 21, status: "read-only support (full SDK coming soon)" });
  });
  sui.command("balance <address>").description("Get SUI balance of an address (not yet implemented)").action(async (_address) => {
    printError("Sui balance not yet implemented \u2014 contributions welcome");
    process.exit(1);
  });
}

// src/commands/completion.ts
function registerCompletionCommand(program2) {
  program2.command("completion").description("Print shell completion setup instructions").option("--shell <shell>", "Shell type: bash, zsh, fish", "bash").action((opts) => {
    const name = "worm-tool";
    switch (opts.shell) {
      case "bash":
        console.log(`# Add to ~/.bashrc:
# eval "$(${name} completion --shell bash)"
_${name}_completions() { COMPREPLY=($(compgen -W "$(${name} --help 2>/dev/null | grep -oP '^  \\K\\S+')" -- "\${COMP_WORDS[COMP_CWORD]}")); }
complete -F _${name}_completions ${name}`);
        break;
      case "zsh":
        console.log(`# Add to ~/.zshrc:
# eval "$(${name} completion --shell zsh)"
compdef _${name} ${name}
_${name}() { local -a cmds; cmds=(parse info generate status latency deploy transfer tokens submit redeem evm solana aptos near sui completion); _describe 'command' cmds }`);
        break;
      case "fish":
        console.log(`# Add to ~/.config/fish/config.fish:
# ${name} completion --shell fish | source
complete -c ${name} -f -a "(${name} --help 2>/dev/null | grep -oP '^  \\K\\S+')"`);
        break;
      default:
        printError(`Unknown shell: ${opts.shell}. Supported: bash, zsh, fish`);
        process.exit(1);
    }
  });
}

// src/main.ts
var program = new Command();
program.name("worm-tool").description("CLI for Wormhole cross-chain protocol interactions").version("0.0.1");
registerParseCommand(program);
registerInfoCommand(program);
registerGenerateCommand(program);
registerStatusCommand(program);
registerLatencyCommand(program);
registerDeployCommand(program);
registerTransferCommand(program);
registerTokensCommand(program);
registerSubmitCommand(program);
registerRedeemCommand(program);
registerEvmCommand(program);
registerSolanaCommand(program);
registerAptosCommand(program);
registerNearCommand(program);
registerSuiCommand(program);
registerCompletionCommand(program);
program.parseAsync(process.argv).catch((err) => {
  printError("Unexpected error", err);
  process.exit(1);
});
/*! Bundled license information:

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
//# sourceMappingURL=cli.js.map