// src/config.ts
import { config as loadDotenv } from "dotenv";
import { resolve } from "path";
import { homedir } from "os";
function loadConfig() {
  loadDotenv({
    path: resolve(homedir(), ".worm-tool", ".env"),
    override: false
  });
  const pk = process.env["WORM_TOOL_EVM_PRIVATE_KEY"];
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
import { EvmChain, getChainByName, ChainNotSupportedError } from "@worm-tool/sdk";
function createEvmChain(chainName, config) {
  const entry = getChainByName(chainName);
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

// src/index.ts
var CLI_VERSION = "0.0.1";
export {
  CLI_VERSION,
  createEvmChain,
  loadConfig,
  printError,
  printJson
};
//# sourceMappingURL=index.js.map