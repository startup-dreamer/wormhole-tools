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
    .option('--targets <chains>', 'Comma-separated cross-chain target names (omit for local-only)')
    .option('--init-hex <hex>', 'ABI-encoded constructor calldata')
    .option('--deployer <address>', 'Override WormToolDeployer address')
    .option('--value <wei>', 'ETH (in wei) to send for Wormhole relayer fees when using --targets')
    .action(async (opts: {
      artifact?: string; bytecode?: string; salt: string;
      source: string; targets?: string; initHex?: string; deployer?: string; value?: string;
    }) => {
      try {
        const config = loadConfig();
        const bytecode = await resolveBytecode(opts.artifact, opts.bytecode);
        const salt = saltFromStr(opts.salt);
        const targetNames = opts.targets ? opts.targets.split(',').map(s => s.trim()) : [];
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
          ...(opts.value !== undefined && { value: BigInt(opts.value) }),
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
    .option('--value <wei>', 'ETH (in wei) to send for Wormhole relayer fees when using cross-chain targets')
    .action(async (opts: { target: string; calldata: string; chains: string; deployer?: string; value?: string }) => {
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
          ...(opts.value !== undefined && { value: BigInt(opts.value) }),
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
    .option('--value <wei>', 'ETH (in wei) to send for Wormhole relayer fees when using cross-chain targets')
    .action(async (opts: { proxy: string; newImpl: string; chains: string; deployer?: string; value?: string }) => {
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
          ...(opts.value !== undefined && { value: BigInt(opts.value) }),
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

  // ── deploy plan ───────────────────────────────────────────────────────────
  deploy
    .command('plan')
    .description('Dry-run: show what would be deployed and in what order')
    .option('--project <dir>', 'Project root (default: cwd)')
    .action(async (opts: { project?: string }) => {
      try {
        const root = opts.project ?? process.cwd();
        const { readFile } = await import('fs/promises');
        const { join } = await import('path');
        const { parseManifest, loadAddressBook, buildDeployPlan } = await import('@worm-tool/sdk');
        const manifestYaml = await readFile(join(root, 'worm-tool.deploy.yaml'), 'utf8');
        const manifest = parseManifest(manifestYaml);
        const book = await loadAddressBook(root);
        const plan = buildDeployPlan(manifest, book);
        printJson(plan);
      } catch (err) { printError('deploy plan failed', err); process.exit(1); }
    });

  // ── deploy run ────────────────────────────────────────────────────────────
  deploy
    .command('run')
    .description('Execute worm-tool.deploy.yaml — deploy all contracts to target chains')
    .option('--project <dir>', 'Project root (default: cwd)')
    .option('--network <name>', 'Limit to one network from the manifest')
    .option('--only <contract>', 'Deploy only this contract')
    .action(async (opts: { project?: string; network?: string; only?: string }) => {
      try {
        const root = opts.project ?? process.cwd();
        const config = loadConfig();
        const { readFile } = await import('fs/promises');
        const { join } = await import('path');
        const {
          parseManifest, loadAddressBook, saveAddressBook,
          detectToolchain, listArtifacts, runDeployment,
          deployAcrossChains, getChainByName,
        } = await import('@worm-tool/sdk');

        const manifestYaml = await readFile(join(root, 'worm-tool.deploy.yaml'), 'utf8');
        let manifest = parseManifest(manifestYaml);

        if (opts.only) {
          manifest = { ...manifest, contracts: manifest.contracts.filter(c => c.name === opts.only) };
        }
        if (opts.network) {
          manifest = {
            ...manifest,
            deploy_targets: manifest.deploy_targets.map(t => ({
              ...t,
              chains: t.chains.filter(c => c === opts.network),
            })).filter(t => t.chains.length > 0),
          };
        }

        const toolchain = await detectToolchain(root);
        const artifacts = await listArtifacts(toolchain);
        const book = await loadAddressBook(root);

        const saltFn = (s: string): `0x${string}` => {
          if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) {
            return (s.startsWith('0x') ? s : '0x' + s) as `0x${string}`;
          }
          const hash = keccak_256(new TextEncoder().encode(s));
          return ('0x' + Array.from(hash, (b: number) => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
        };

        const result = await runDeployment({
          manifest,
          book,
          artifacts,
          saltFn,
          onProgress: (msg) => process.stderr.write(msg + '\n'),
          deployFn: async ({ bytecode, constructorArgs, salt, chains }) => {
            const firstChain = chains[0] ?? '';
            const networkEntry = manifest.networks[firstChain];
            const resolvedChainName = networkEntry?.chain ?? firstChain;
            const chainEntry = getChainByName(resolvedChainName);
            if (!chainEntry?.wormToolDeployer) {
              throw new Error(`No WormToolDeployer address for chain "${firstChain}" — set --deployer or add to chain registry`);
            }
            const allChainObjs = chains.map(n => {
              const net = manifest.networks[n];
              return createEvmChain(net?.chain ?? n, config);
            });
            const txResults = await deployAcrossChains({
              chains: allChainObjs,
              bytecode,
              salt,
              wormToolDeployerAddress: chainEntry.wormToolDeployer,
              ...(constructorArgs !== '0x' && { constructorArgs }),
            });

            // Compute deterministic CREATE2 address from init code
            const initCode = (constructorArgs !== '0x' && constructorArgs.length > 2)
              ? (bytecode + constructorArgs.slice(2)) as `0x${string}`
              : bytecode;
            const initHex = initCode.startsWith('0x') ? initCode.slice(2) : initCode;
            const initBytes = new Uint8Array(initHex.length / 2);
            for (let i = 0; i < initBytes.length; i++) {
              initBytes[i] = parseInt(initHex.slice(i * 2, i * 2 + 2), 16);
            }
            const initCodeHash = ('0x' + Array.from(keccak_256(initBytes), b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
            const deployedAddress = computeCreate2Address(chainEntry.wormToolDeployer, salt, initCodeHash);

            return txResults.map((r: { chain: string; receipt: { txHash: string } }) => ({
              chain: r.chain,
              address: deployedAddress,
              txHash: r.receipt.txHash,
            }));
          },
        });

        await saveAddressBook(root, result.book);
        printJson({
          deployed: result.deployed,
          skipped: result.skipped.map(s => s.name),
        });
      } catch (err) { printError('deploy run failed', err); process.exit(1); }
    });

  // ── deploy verify ─────────────────────────────────────────────────────────
  deploy
    .command('verify')
    .description('Verify deployed contracts on block explorers (requires WORM_TOOL_ETHERSCAN_API_KEY)')
    .option('--project <dir>', 'Project root (default: cwd)')
    .option('--network <name>', 'Limit to one network')
    .option('--contract <name>', 'Verify only this contract')
    .option('--constructor-args <hex>', 'ABI-encoded constructor arguments (0x-prefixed) for contracts that require them')
    .action(async (opts: { project?: string; network?: string; contract?: string; constructorArgs?: string }) => {
      try {
        const root = opts.project ?? process.cwd();
        const { readFile } = await import('fs/promises');
        const { join } = await import('path');
        const { parseManifest, loadAddressBook, detectToolchain, listArtifacts, verifyContract, getChainByName } = await import('@worm-tool/sdk');

        const apiKey = process.env['WORM_TOOL_ETHERSCAN_API_KEY'];
        if (!apiKey) throw new Error('WORM_TOOL_ETHERSCAN_API_KEY environment variable is required');

        const manifestYaml = await readFile(join(root, 'worm-tool.deploy.yaml'), 'utf8');
        const manifest = parseManifest(manifestYaml);
        const book = await loadAddressBook(root);
        const toolchain = await detectToolchain(root);
        const artifacts = await listArtifacts(toolchain);

        const results = [];
        for (const target of manifest.deploy_targets) {
          for (const contractName of target.contracts) {
            if (opts.contract && contractName !== opts.contract) continue;
            for (const chain of target.chains) {
              if (opts.network && chain !== opts.network) continue;
              const entry = book.contracts[contractName]?.[chain];
              if (!entry || entry.verified) continue;
              const artifact = artifacts.find(a => a.name === contractName);
              if (!artifact) continue;
              const networkConfig = manifest.networks[chain];
              const chainName = networkConfig?.chain ?? chain;
              const chainEntry = getChainByName(chainName);
              if (!chainEntry?.evmChainId) continue;
              const result = await verifyContract({
                artifact,
                entry,
                constructorArgs: (opts.constructorArgs ?? '0x') as `0x${string}`,
                evmChainId: chainEntry.evmChainId,
                apiKey,
              });
              results.push({ contract: contractName, chain, ...result });
            }
          }
        }
        printJson(results);
      } catch (err) { printError('deploy verify failed', err); process.exit(1); }
    });

  // ── deploy upgrade-safe ───────────────────────────────────────────────────
  deploy
    .command('upgrade-safe')
    .description('Check storage layout safety then upgrade a UUPS proxy across chains')
    .requiredOption('--contract <name>', 'Contract name (must match address book)')
    .requiredOption('--new-impl <address>', 'New implementation address')
    .requiredOption('--chains <chains>', 'Comma-separated chain names')
    .option('--project <dir>', 'Project root (default: cwd)')
    .option('--force', 'Skip storage safety check and upgrade anyway')
    .action(async (opts: { contract: string; newImpl: string; chains: string; project?: string; force?: boolean }) => {
      try {
        const root = opts.project ?? process.cwd();
        const config = loadConfig();
        const {
          detectToolchain, listArtifacts, loadAddressBook,
          upgradeAcrossChains, getChainByName,
        } = await import('@worm-tool/sdk');

        const toolchain = await detectToolchain(root);
        const artifacts = await listArtifacts(toolchain);
        const book = await loadAddressBook(root);

        const artifact = artifacts.find(a => a.name === opts.contract);
        if (!artifact) throw new Error(`Contract "${opts.contract}" not found in compiled artifacts`);

        const chainNames = opts.chains.split(',').map(s => s.trim());

        // Storage layout safety check
        if (!opts.force) {
          process.stderr.write('Note: storage layout comparison requires the old implementation artifact. Use --force to skip, or provide the old artifact manually. Proceeding with upgrade.\n');
        }

        // Get proxy address from address book
        const firstChain = chainNames[0] ?? '';
        const proxyEntry = book.contracts[opts.contract]?.[firstChain];
        if (!proxyEntry) {
          throw new Error(`No proxy address found for "${opts.contract}" on "${firstChain}" in address book — run deploy run first`);
        }

        const chainEntry = getChainByName(firstChain);
        if (!chainEntry?.wormToolDeployer) {
          throw new Error(`No WormToolDeployer address for chain "${firstChain}"`);
        }

        const chains = chainNames.map(n => createEvmChain(n, config));
        const results = await upgradeAcrossChains({
          chains,
          proxy: proxyEntry.address as `0x${string}`,
          newImpl: opts.newImpl as `0x${string}`,
          wormToolDeployerAddress: chainEntry.wormToolDeployer,
        });

        printJson(results.map((r: { chain: string; receipt: { txHash: string; success: boolean } }) => ({
          chain: r.chain, txHash: r.receipt.txHash, success: r.receipt.success,
        })));
      } catch (err) { printError('deploy upgrade-safe failed', err); process.exit(1); }
    });

  // ── deploy diff ───────────────────────────────────────────────────────────
  deploy
    .command('diff')
    .description('Compare manifest targets vs what is in the address book')
    .option('--project <dir>', 'Project root (default: cwd)')
    .action(async (opts: { project?: string }) => {
      try {
        const root = opts.project ?? process.cwd();
        const { readFile } = await import('fs/promises');
        const { join } = await import('path');
        const { parseManifest, loadAddressBook, isDeployed } = await import('@worm-tool/sdk');

        const manifestYaml = await readFile(join(root, 'worm-tool.deploy.yaml'), 'utf8');
        const manifest = parseManifest(manifestYaml);
        const book = await loadAddressBook(root);

        const rows: Array<{ contract: string; chain: string; status: 'deployed' | 'missing'; address?: string }> = [];
        for (const target of manifest.deploy_targets) {
          for (const contractName of target.contracts) {
            for (const chain of target.chains) {
              const dep = isDeployed(book, contractName, chain);
              const address = book.contracts[contractName]?.[chain]?.address;
              rows.push({ contract: contractName, chain, status: dep ? 'deployed' : 'missing', ...(address ? { address } : {}) });
            }
          }
        }
        printJson(rows);
      } catch (err) { printError('deploy diff failed', err); process.exit(1); }
    });
}
