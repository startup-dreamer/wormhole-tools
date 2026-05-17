import { readFile } from 'fs/promises';
import type { Command } from 'commander';
import {
  extractBytecode,
  computeCreate2Address,
  deployAcrossChains,
  callAcrossChains,
  upgradeAcrossChains,
  checkContractDeployed,
  getChainByName,
} from '@worm-tool/sdk';
import { keccak_256 } from '@noble/hashes/sha3';
import { loadConfig } from '../config.js';
import { createEvmChain } from '../providers/evm.js';
import { printJson, printError } from '../output.js';

function saltFromStr(s: string): `0x${string}` {
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) {
    return (s.startsWith('0x') ? s : '0x' + s) as `0x${string}`;
  }
  const hash = keccak_256(new TextEncoder().encode(s));
  return ('0x' + Array.from(hash, b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
}

async function resolveBytecode(artifact?: string, bytecodeHex?: string): Promise<`0x${string}`> {
  if (artifact) {
    const json = JSON.parse(await readFile(artifact, 'utf8'));
    return extractBytecode(json, artifact);
  }
  if (bytecodeHex) {
    return (bytecodeHex.startsWith('0x') ? bytecodeHex : '0x' + bytecodeHex) as `0x${string}`;
  }
  throw new Error('Provide --artifact or --bytecode');
}

function resolveDeployer(chainName: string, override?: string): string {
  if (override) return override;
  const entry = getChainByName(chainName);
  if (!entry?.wormToolDeployer) {
    throw new Error(`No WormToolDeployer address known for ${chainName} — set --deployer`);
  }
  return entry.wormToolDeployer;
}

export function registerDeployCommand(program: Command): void {
  const deploy = program
    .command('deploy')
    .description('Deploy and manage contracts across chains via WormToolDeployer');

  // ── deploy address ───────────────────────────────────────────────────────
  deploy
    .command('address')
    .description('Compute the CREATE2 deployment address offline (no key required)')
    .option('--artifact <path>', 'Path to Hardhat/Foundry artifact JSON')
    .option('--bytecode <hex>', 'Raw init bytecode (0x-prefixed)')
    .requiredOption('--salt <salt>', 'CREATE2 salt: 32-byte hex or an arbitrary string (keccak256\'d)')
    .requiredOption('--deployer <address>', 'WormToolDeployer contract address (20-byte hex)')
    .action(async (opts: { artifact?: string; bytecode?: string; salt: string; deployer: string }) => {
      try {
        const bytecode = await resolveBytecode(opts.artifact, opts.bytecode);
        const salt = saltFromStr(opts.salt);
        const hex = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
        const initBytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < initBytes.length; i++) initBytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        const initCodeHash = ('0x' + Array.from(keccak_256(initBytes), b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
        const address = computeCreate2Address(opts.deployer, salt, initCodeHash);
        printJson({ address, salt, initCodeHash, deployer: opts.deployer });
      } catch (err) { printError('deploy address failed', err); process.exit(1); }
    });

  // ── deploy multi ─────────────────────────────────────────────────────────
  deploy
    .command('multi')
    .description('Deploy bytecode to multiple chains in one source transaction')
    .option('--artifact <path>', 'Path to Hardhat/Foundry artifact JSON')
    .option('--bytecode <hex>', 'Raw init bytecode (0x-prefixed)')
    .requiredOption('--salt <salt>', 'CREATE2 salt')
    .requiredOption('--source <chain>', 'Source chain (where the tx is sent)')
    .requiredOption('--targets <chains>', 'Comma-separated target chain names')
    .option('--init-hex <hex>', 'ABI-encoded constructor calldata')
    .option('--deployer <address>', 'Override WormToolDeployer address')
    .action(async (opts: {
      artifact?: string; bytecode?: string; salt: string;
      source: string; targets: string; initHex?: string; deployer?: string;
    }) => {
      try {
        const config = loadConfig();
        const bytecode = await resolveBytecode(opts.artifact, opts.bytecode);
        const salt = saltFromStr(opts.salt);
        const targetNames = opts.targets.split(',').map(s => s.trim());
        const chains = [opts.source, ...targetNames]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map(n => createEvmChain(n, config));
        const deployer = resolveDeployer(opts.source, opts.deployer);
        const results = await deployAcrossChains({
          chains,
          bytecode,
          salt,
          wormToolDeployerAddress: deployer,
          ...(opts.initHex !== undefined && { constructorArgs: opts.initHex as `0x${string}` }),
        });
        printJson(results.map((r: { chain: string; chainId: bigint; receipt: { txHash: string; success: boolean } }) => ({ chain: r.chain, chainId: r.chainId.toString(), txHash: r.receipt.txHash, success: r.receipt.success })));
      } catch (err) { printError('deploy multi failed', err); process.exit(1); }
    });

  // ── deploy call ──────────────────────────────────────────────────────────
  deploy
    .command('call')
    .description('Send a cross-chain function call through WormToolDeployer')
    .requiredOption('--target <address>', 'Target contract address')
    .requiredOption('--calldata <hex>', 'ABI-encoded calldata (0x-prefixed)')
    .requiredOption('--chains <chains>', 'Comma-separated chain names')
    .option('--deployer <address>', 'Override WormToolDeployer address')
    .action(async (opts: { target: string; calldata: string; chains: string; deployer?: string }) => {
      try {
        const config = loadConfig();
        const chainNames = opts.chains.split(',').map(s => s.trim());
        const chains = chainNames.map(n => createEvmChain(n, config));
        const deployer = resolveDeployer(chainNames[0]!, opts.deployer);
        const results = await callAcrossChains({
          chains,
          target: opts.target as `0x${string}`,
          calldata: opts.calldata as `0x${string}`,
          wormToolDeployerAddress: deployer,
        });
        printJson(results.map((r: { chain: string; receipt: { txHash: string; success: boolean } }) => ({ chain: r.chain, txHash: r.receipt.txHash, success: r.receipt.success })));
      } catch (err) { printError('deploy call failed', err); process.exit(1); }
    });

  // ── deploy upgrade ───────────────────────────────────────────────────────
  deploy
    .command('upgrade')
    .description('Upgrade a UUPS proxy to a new implementation across chains')
    .requiredOption('--proxy <address>', 'Proxy contract address')
    .requiredOption('--new-impl <address>', 'New implementation address')
    .requiredOption('--chains <chains>', 'Comma-separated chain names')
    .option('--deployer <address>', 'Override WormToolDeployer address')
    .action(async (opts: { proxy: string; newImpl: string; chains: string; deployer?: string }) => {
      try {
        const config = loadConfig();
        const chainNames = opts.chains.split(',').map(s => s.trim());
        const chains = chainNames.map(n => createEvmChain(n, config));
        const deployer = resolveDeployer(chainNames[0]!, opts.deployer);
        const results = await upgradeAcrossChains({
          chains,
          proxy: opts.proxy as `0x${string}`,
          newImpl: opts.newImpl as `0x${string}`,
          wormToolDeployerAddress: deployer,
        });
        printJson(results.map((r: { chain: string; receipt: { txHash: string; success: boolean } }) => ({ chain: r.chain, txHash: r.receipt.txHash, success: r.receipt.success })));
      } catch (err) { printError('deploy upgrade failed', err); process.exit(1); }
    });

  // ── deploy status ────────────────────────────────────────────────────────
  deploy
    .command('status')
    .description('Check per-chain deployment status at a known contract address')
    .requiredOption('--address <address>', 'Contract address to check')
    .requiredOption('--chains <chains>', 'Comma-separated chain names')
    .action(async (opts: { address: string; chains: string }) => {
      try {
        const config = loadConfig();
        const chainNames = opts.chains.split(',').map(s => s.trim());
        const results = await Promise.all(
          chainNames.map(async name => {
            const chain = createEvmChain(name, config);
            const deployed = await checkContractDeployed(chain, opts.address);
            return { chain: name, address: opts.address, deployed };
          }),
        );
        printJson(results);
      } catch (err) { printError('deploy status failed', err); process.exit(1); }
    });
}
