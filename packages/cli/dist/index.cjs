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
var src_exports = {};
__export(src_exports, {
  CLI_VERSION: () => CLI_VERSION,
  createEvmChain: () => createEvmChain,
  loadConfig: () => loadConfig,
  printError: () => printError,
  printJson: () => printJson
});
module.exports = __toCommonJS(src_exports);

// src/config.ts
var import_dotenv = require("dotenv");
var import_path = require("path");
var import_os = require("os");
function loadConfig() {
  (0, import_dotenv.config)({ path: (0, import_path.resolve)((0, import_os.homedir)(), ".worm-tool", ".env"), override: false });
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

// src/output.ts
function printJson(value) {
  console.log(JSON.stringify(value, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
}
function printError(message, err) {
  const detail = err instanceof Error ? `: ${err.message}` : err ? `: ${String(err)}` : "";
  process.stderr.write(`Error: ${message}${detail}
`);
}

// src/providers/evm.ts
var import_sdk = require("@worm-tool/sdk");
function createEvmChain(chainName, config) {
  const entry = (0, import_sdk.getChainByName)(chainName);
  if (!entry) throw new import_sdk.ChainNotSupportedError(chainName);
  if (entry.evmChainId === void 0) {
    throw new import_sdk.ChainNotSupportedError(`${chainName} is not an EVM chain`);
  }
  const rpcUrl = config.rpcUrls[chainName] ?? entry.defaultRpc;
  if (!rpcUrl) {
    throw new Error(`No RPC URL for ${chainName} \u2014 set WORM_TOOL_RPC_${chainName.toUpperCase()} in ~/.worm-tool/.env`);
  }
  return new import_sdk.EvmChain({
    rpcUrl,
    wormholeChainId: BigInt(entry.wormholeChainId),
    evmChainId: entry.evmChainId,
    ...config.privateKey !== void 0 && { privateKey: config.privateKey }
  });
}

// src/index.ts
var CLI_VERSION = "0.0.1";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CLI_VERSION,
  createEvmChain,
  loadConfig,
  printError,
  printJson
});
//# sourceMappingURL=index.cjs.map