import { EvmChain } from '@worm-tool/sdk';

interface WormToolConfig {
    privateKey: `0x${string}` | undefined;
    rpcUrls: Record<string, string>;
    network: "mainnet" | "testnet";
}
/** Load config from ~/.worm-tool/.env then process.env (process.env wins). */
declare function loadConfig(): WormToolConfig;

/** Write value as pretty-printed JSON to stdout. */
declare function printJson(value: unknown): void;
/** Write a diagnostic message to stderr. Does not exit. */
declare function printError(message: string, err?: unknown): void;

/** Create an EvmChain adapter for a named chain using the loaded config. */
declare function createEvmChain(chainName: string, config: WormToolConfig): EvmChain;

declare const CLI_VERSION = "0.0.1";

export { CLI_VERSION, type WormToolConfig, createEvmChain, loadConfig, printError, printJson };
