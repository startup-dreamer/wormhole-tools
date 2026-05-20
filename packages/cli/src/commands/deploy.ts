import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Command } from 'commander';
import {
  extractBytecode,
  computeCreate2Address,
  keccak256Hex,
  bytesToHex,
  deployAcrossChains,
  callAcrossChains,
  upgradeAcrossChains,
  executeViaModule,
  checkContractDeployed,
  getChainByName,
  diffStorageLayouts,
} from '@wormcraft/sdk';
import type { StorageLayout } from '@wormcraft/sdk';
import { keccak_256 } from '@noble/hashes/sha3';
import { loadConfig } from '../config.js';
import { createEvmChain } from '../providers/evm.js';
import { printJson, printError, formatTable } from '../output.js';

function handleManifestMissing(commandName: string, err: unknown): never {
  if (
    err instanceof Error &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT' &&
    String((err as NodeJS.ErrnoException).path ?? '').endsWith('wormcraft.deploy.yaml')
  ) {
    printError('wormcraft.deploy.yaml not found — run `wormcraft deploy init` to create one');
  } else {
    printError(`${commandName} failed`, err);
  }
  process.exit(1);
}

function saltFromStr(s: string): `0x${string}` {
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) {
    return (s.startsWith('0x') ? s : '0x' + s) as `0x${string}`;
  }
  return bytesToHex(keccak_256(new TextEncoder().encode(s)));
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
    throw new Error(`No WormcraftDeployer address known for ${chainName} — set --deployer`);
  }
  return entry.wormToolDeployer;
}

/** Exported for testing. Builds a starter manifest YAML for the given contract names. */
export function buildStarterManifestYaml(contractNames: string[]): string {
  const contractsYaml = contractNames.map(n =>
    `  - name: ${n}\n    contract: ${n}\n    args: []   # TODO: fill constructor args`
  ).join('\n');

  const targetContracts = `[${contractNames.join(', ')}]`;

  return `version: "1"

# Network definitions — set RPC env vars before running
networks:
  sepolia:
    chain: sepolia
    rpc: "\${WORMCRAFT_RPC_SEPOLIA}"

# Deployer salt — change this to get a different deterministic address
deployer:
  salt: "my-project-v1"

# Contracts to deploy — add constructor args as {type, value} pairs
contracts:
${contractsYaml}

# Deploy targets — which contracts go to which chains
deploy_targets:
  - contracts: ${targetContracts}
    chains: [sepolia]
    strategy: sequential
`;
}

export function registerDeployCommand(program: Command): void {
  const deploy = program
    .command('deploy')
    .description('Deploy and manage contracts across chains via WormcraftDeployer');

  deploy
    .command('init')
    .description('Generate a starter wormcraft.deploy.yaml from compiled artifacts')
    .option('--project <dir>', 'Project root (default: cwd)')
    .option('--force', 'Overwrite existing manifest')
    .action(async (opts: { project?: string; force?: boolean }) => {
      try {
        const root = opts.project ?? process.cwd();
        const manifestPath = join(root, 'wormcraft.deploy.yaml');

        if (!opts.force) {
          try {
            await readFile(manifestPath, 'utf8');
            printError('wormcraft.deploy.yaml already exists — use --force to overwrite');
            process.exit(1);
          } catch (err) {
            if (!(err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT')) {
              throw err;
            }
          }
        }

        const { detectToolchain, listArtifacts, ToolchainNotFoundError } = await import('@wormcraft/sdk');
        let contractNames: string[];
        try {
          const toolchain = await detectToolchain(root);
          const artifacts = await listArtifacts(toolchain);
          contractNames = artifacts.filter(a => !a.isAbstract && !a.isInterface).map(a => a.name);
        } catch (err) {
          if (err instanceof ToolchainNotFoundError) {
            process.stderr.write('No toolchain found — generating manifest with empty contracts list.\n');
            contractNames = [];
          } else {
            throw err;
          }
        }

        const { writeFile } = await import('fs/promises');
        await writeFile(manifestPath, buildStarterManifestYaml(contractNames), 'utf8');
        process.stdout.write(`Created ${manifestPath}\n`);
        if (contractNames.length > 0) {
          process.stdout.write(`Found ${contractNames.length} deployable contract(s): ${contractNames.join(', ')}\n`);
          process.stdout.write('Edit the file to fill in constructor args and networks.\n');
        }
      } catch (err) { printError('deploy init failed', err); process.exit(1); }
    });

  deploy
    .command('address')
    .description('Compute the CREATE2 deployment address offline (no key required)')
    .option('--artifact <path>', 'Path to Hardhat/Foundry artifact JSON')
    .option('--bytecode <hex>', 'Raw init bytecode (0x-prefixed)')
    .requiredOption('--salt <salt>', 'CREATE2 salt: 32-byte hex or an arbitrary string (keccak256\'d)')
    .requiredOption('--deployer <address>', 'WormcraftDeployer contract address (20-byte hex)')
    .action(async (opts: { artifact?: string; bytecode?: string; salt: string; deployer: string }) => {
      try {
        const bytecode = await resolveBytecode(opts.artifact, opts.bytecode);
        const salt = saltFromStr(opts.salt);
        const initCodeHash = keccak256Hex(bytecode);
        const address = computeCreate2Address(opts.deployer, salt, initCodeHash);
        printJson({ address, salt, initCodeHash, deployer: opts.deployer });
      } catch (err) { printError('deploy address failed', err); process.exit(1); }
    });

  deploy
    .command('multi')
    .description('Deploy bytecode to multiple chains in one source transaction')
    .option('--artifact <path>', 'Path to Hardhat/Foundry artifact JSON')
    .option('--bytecode <hex>', 'Raw init bytecode (0x-prefixed)')
    .requiredOption('--salt <salt>', 'CREATE2 salt')
    .requiredOption('--source <chain>', 'Source chain (where the tx is sent)')
    .option('--targets <chains>', 'Comma-separated cross-chain target names (omit for local-only)')
    .option('--init-hex <hex>', 'ABI-encoded constructor calldata')
    .option('--deployer <address>', 'Override WormcraftDeployer address')
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

  deploy
    .command('call')
    .description('Send a cross-chain function call through WormcraftDeployer')
    .requiredOption('--target <address>', 'Target contract address')
    .requiredOption('--calldata <hex>', 'ABI-encoded calldata (0x-prefixed)')
    .requiredOption('--chains <chains>', 'Comma-separated chain names')
    .option('--deployer <address>', 'Override WormcraftDeployer address')
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

  deploy
    .command('upgrade')
    .description('Upgrade a proxy across chains — direct (WormcraftProxy) or via Gnosis Safe module')
    .requiredOption('--proxy <address>', 'Proxy contract address')
    .requiredOption('--new-impl <address>', 'New implementation address')
    .requiredOption('--chains <chains>', 'Comma-separated chain names')
    .option('--safe <address>', 'Route upgrade through a Gnosis Safe (requires WormcraftModule setup)')
    .option('--module <address>', 'WormcraftModule address (required when --safe is used)')
    .option('--deployer <address>', 'Override WormcraftDeployer address')
    .option('--value <wei>', 'ETH (in wei) to send for Wormhole relayer fees when using cross-chain targets')
    .action(async (opts: {
      proxy: string; newImpl: string; chains: string;
      safe?: string; module?: string; deployer?: string; value?: string;
    }) => {
      try {
        const config = loadConfig();
        const chainNames = opts.chains.split(',').map(s => s.trim());
        const chains = chainNames.map(n => createEvmChain(n, config));
        const deployer = resolveDeployer(chainNames[0]!, opts.deployer);

        if (opts.safe) {
          if (!opts.module) {
            printError('--module <WormcraftModule address> is required when using --safe');
            process.exit(1);
          }
          const { encodeFunctionData } = await import('viem');
          const calldata = encodeFunctionData({
            abi: [{
              name: 'upgradeToAndCall',
              type: 'function',
              inputs: [
                { name: 'newImplementation', type: 'address' },
                { name: 'data', type: 'bytes' },
              ],
            }] as const,
            functionName: 'upgradeToAndCall',
            args: [opts.newImpl as `0x${string}`, '0x'],
          });
          const results = await executeViaModule({
            chains,
            moduleAddress: opts.module as `0x${string}`,
            safe: opts.safe as `0x${string}`,
            target: opts.proxy as `0x${string}`,
            calldata,
            wormToolDeployerAddress: deployer,
            ...(opts.value !== undefined && { value: BigInt(opts.value) }),
          });
          printJson(results.map((r: { chain: string; receipt: { txHash: string; success: boolean } }) => ({
            chain: r.chain, txHash: r.receipt.txHash, success: r.receipt.success,
          })));
        } else {
          const results = await upgradeAcrossChains({
            chains,
            proxy: opts.proxy as `0x${string}`,
            newImpl: opts.newImpl as `0x${string}`,
            wormToolDeployerAddress: deployer,
            ...(opts.value !== undefined && { value: BigInt(opts.value) }),
          });
          printJson(results.map((r: { chain: string; receipt: { txHash: string; success: boolean } }) => ({
            chain: r.chain, txHash: r.receipt.txHash, success: r.receipt.success,
          })));
        }
      } catch (err) { printError('deploy upgrade failed', err); process.exit(1); }
    });

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

  deploy
    .command('plan')
    .description('Dry-run: show what would be deployed and in what order')
    .option('--project <dir>', 'Project root (default: cwd)')
    .option('--json', 'Output as JSON array instead of a table')
    .action(async (opts: { project?: string; json?: boolean }) => {
      try {
        const root = opts.project ?? process.cwd();
        const { parseManifest, loadAddressBook, buildDeployPlan } = await import('@wormcraft/sdk');
        const manifestYaml = await readFile(join(root, 'wormcraft.deploy.yaml'), 'utf8');
        const manifest = parseManifest(manifestYaml);
        const book = await loadAddressBook(root);
        const plan = buildDeployPlan(manifest, book);

        if (opts.json) {
          printJson(plan);
        } else {
          const rows = plan.map(e => [
            e.name,
            e.targetChains.join(', '),
            e.alreadyDeployed ? '✓ deployed' : '✗ pending',
            e.strategy,
          ]);
          console.log(formatTable(['Contract', 'Chains', 'Status', 'Strategy'], rows));
        }
      } catch (err) { handleManifestMissing('deploy plan', err); }
    });

  deploy
    .command('run')
    .description('Execute wormcraft.deploy.yaml — deploy all contracts to target chains')
    .option('--project <dir>', 'Project root (default: cwd)')
    .option('--network <name>', 'Limit to one network from the manifest')
    .option('--only <contract>', 'Deploy only this contract')
    .option('--dry-run', 'Simulate deployment — compute addresses without sending transactions')
    .action(async (opts: { project?: string; network?: string; only?: string; dryRun?: boolean }) => {
      try {
        const root = opts.project ?? process.cwd();
        const config = loadConfig();
        const {
          parseManifest, loadAddressBook, saveAddressBook,
          detectToolchain, listArtifacts, runDeployment,
          deployAcrossChains, getChainByName,
        } = await import('@wormcraft/sdk');

        const manifestYaml = await readFile(join(root, 'wormcraft.deploy.yaml'), 'utf8');
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

        const result = await runDeployment({
          manifest,
          book,
          artifacts,
          saltFn: saltFromStr,
          onProgress: (msg) => process.stderr.write(msg + '\n'),
          ...(opts.dryRun ? {
            dryRun: true,
            dryRunDeployerAddress: '0x4e59b44847b379578588920cA78FbF26c0B4956C',
          } : {}),
          deployFn: async ({ bytecode, constructorArgs, salt, chains }) => {
            const firstChain = chains[0] ?? '';
            const networkEntry = manifest.networks[firstChain];
            const resolvedChainName = networkEntry?.chain ?? firstChain;
            const chainEntry = getChainByName(resolvedChainName);
            if (!chainEntry?.wormToolDeployer) {
              throw new Error(`No WormcraftDeployer address for chain "${firstChain}" — set --deployer or add to chain registry`);
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

            const initCode = (constructorArgs !== '0x' && constructorArgs.length > 2)
              ? (bytecode + constructorArgs.slice(2)) as `0x${string}`
              : bytecode;
            const initCodeHash = keccak256Hex(initCode);
            const deployedAddress = computeCreate2Address(chainEntry.wormToolDeployer, salt, initCodeHash);

            return txResults.map((r: { chain: string; receipt: { txHash: string } }) => ({
              chain: r.chain,
              address: deployedAddress,
              txHash: r.receipt.txHash,
            }));
          },
        });

        if (opts.dryRun) {
          process.stderr.write('DRY RUN — no transactions sent\n');
        } else {
          await saveAddressBook(root, result.book);
        }
        printJson({
          deployed: result.deployed,
          skipped: result.skipped.map(s => s.name),
        });
      } catch (err) { handleManifestMissing('deploy run', err); }
    });

  deploy
    .command('verify')
    .description('Verify deployed contracts on block explorers (requires WORMCRAFT_ETHERSCAN_API_KEY)')
    .option('--project <dir>', 'Project root (default: cwd)')
    .option('--network <name>', 'Limit to one network')
    .option('--contract <name>', 'Verify only this contract')
    .option('--constructor-args <hex>', 'ABI-encoded constructor arguments (0x-prefixed) for contracts that require them')
    .action(async (opts: { project?: string; network?: string; contract?: string; constructorArgs?: string }) => {
      try {
        const root = opts.project ?? process.cwd();
        const { parseManifest, loadAddressBook, detectToolchain, listArtifacts, verifyContract, getChainByName } = await import('@wormcraft/sdk');

        const apiKey = process.env['WORMCRAFT_ETHERSCAN_API_KEY'];
        if (!apiKey) throw new Error('WORMCRAFT_ETHERSCAN_API_KEY environment variable is required');

        const manifestYaml = await readFile(join(root, 'wormcraft.deploy.yaml'), 'utf8');
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
      } catch (err) { handleManifestMissing('deploy verify', err); }
    });

  deploy
    .command('upgrade-safe')
    .description('Check storage layout safety then upgrade a UUPS proxy across chains')
    .requiredOption('--contract <name>', 'Contract name (must match address book)')
    .requiredOption('--new-impl <address>', 'New implementation address')
    .requiredOption('--chains <chains>', 'Comma-separated chain names')
    .option('--project <dir>', 'Project root (default: cwd)')
    .option('--force', 'Skip storage safety check and upgrade anyway')
    .option('--old-artifact <path>', 'Path to old implementation artifact JSON (for storage layout comparison)')
    .action(async (opts: { contract: string; newImpl: string; chains: string; project?: string; force?: boolean; oldArtifact?: string }) => {
      try {
        const root = opts.project ?? process.cwd();
        const config = loadConfig();
        const {
          detectToolchain, listArtifacts, loadAddressBook,
          upgradeAcrossChains, getChainByName,
        } = await import('@wormcraft/sdk');

        const toolchain = await detectToolchain(root);
        const artifacts = await listArtifacts(toolchain);
        const book = await loadAddressBook(root);

        const artifact = artifacts.find(a => a.name === opts.contract);
        if (!artifact) throw new Error(`Contract "${opts.contract}" not found in compiled artifacts`);

        const chainNames = opts.chains.split(',').map(s => s.trim());

        if (!opts.force && opts.oldArtifact) {
          const oldJson = JSON.parse(await readFile(opts.oldArtifact, 'utf8')) as {
            storageLayout?: StorageLayout;
          };
          const oldLayout = oldJson.storageLayout;
          const newLayout = artifact.storageLayout;
          if (oldLayout && newLayout) {
            const diff = diffStorageLayouts(oldLayout, newLayout);
            if (!diff.safe) {
              printError('Storage layout check failed — upgrade blocked (use --force to override)', undefined);
              printJson(diff.issues);
              process.exit(1);
            }
            process.stderr.write('Storage layout check passed.\n');
          } else {
            process.stderr.write('Warning: storageLayout not available in artifact(s). Proceeding without safety check.\n');
          }
        } else if (!opts.force) {
          process.stderr.write('Tip: use --old-artifact <path> to enable storage layout safety check before upgrading.\n');
        }

        const firstChain = chainNames[0] ?? '';
        const proxyEntry = book.contracts[opts.contract]?.[firstChain];
        if (!proxyEntry) {
          throw new Error(`No proxy address found for "${opts.contract}" on "${firstChain}" in address book — run deploy run first`);
        }

        const chainEntry = getChainByName(firstChain);
        if (!chainEntry?.wormToolDeployer) {
          throw new Error(`No WormcraftDeployer address for chain "${firstChain}"`);
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

  deploy
    .command('diff')
    .description('Compare manifest targets vs what is in the address book')
    .option('--project <dir>', 'Project root (default: cwd)')
    .option('--json', 'Output as JSON array instead of a table')
    .action(async (opts: { project?: string; json?: boolean }) => {
      try {
        const root = opts.project ?? process.cwd();
        const { parseManifest, loadAddressBook, isDeployed } = await import('@wormcraft/sdk');

        const manifestYaml = await readFile(join(root, 'wormcraft.deploy.yaml'), 'utf8');
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

        if (opts.json) {
          printJson(rows);
        } else {
          const tableRows = rows.map(r => [
            r.contract,
            r.chain,
            r.status === 'deployed' ? '✓ deployed' : '✗ missing',
            r.address ?? '—',
          ]);
          console.log(formatTable(['Contract', 'Chain', 'Status', 'Address'], tableRows));
        }
      } catch (err) { handleManifestMissing('deploy diff', err); }
    });
}

export function registerModuleCommand(program: Command): void {
  const moduleCmd = program
    .command('module')
    .description('Helpers for WormcraftModule setup with Gnosis Safe');

  moduleCmd
    .command('setup')
    .description('Generate Safe Transaction Builder JSON for one-time WormcraftModule setup')
    .requiredOption('--safe <address>', 'Safe address on this chain')
    .requiredOption('--module <address>', 'WormcraftModule address on this chain')
    .requiredOption('--source-chain <id>', 'Wormhole chain ID of the source chain where upgrades are initiated')
    .requiredOption('--authorized <address>', 'Wallet/Safe address on the source chain that will initiate upgrades')
    .action(async (opts: { safe: string; module: string; sourceChain: string; authorized: string }) => {
      try {
        const { encodeFunctionData } = await import('viem');

        const enableModuleCalldata = encodeFunctionData({
          abi: [{
            name: 'enableModule',
            type: 'function',
            inputs: [{ name: 'module', type: 'address' }],
          }] as const,
          functionName: 'enableModule',
          args: [opts.module as `0x${string}`],
        });

        const callerBytes32 = ('0x' + opts.authorized.toLowerCase().replace('0x', '').padStart(64, '0')) as `0x${string}`;
        const authorizeCalldata = encodeFunctionData({
          abi: [{
            name: 'authorize',
            type: 'function',
            inputs: [
              { name: 'sourceChainId', type: 'uint16' },
              { name: 'caller', type: 'bytes32' },
            ],
          }] as const,
          functionName: 'authorize',
          args: [Number(opts.sourceChain), callerBytes32],
        });

        const batch = {
          version: '1.0',
          chainId: 'auto',
          createdAt: Date.now(),
          meta: {
            name: 'WormcraftModule setup',
            description: 'Enable WormcraftModule + authorize source caller',
          },
          transactions: [
            { to: opts.safe,   value: '0', data: enableModuleCalldata,  contractMethod: null, contractInputsValues: null },
            { to: opts.module, value: '0', data: authorizeCalldata,      contractMethod: null, contractInputsValues: null },
          ],
        };

        process.stdout.write(JSON.stringify(batch, null, 2) + '\n');
        process.stderr.write('\nImport this JSON into Safe > Transaction Builder > Load JSON\n');
        process.stderr.write('Both transactions will execute atomically.\n');
      } catch (err) { printError('module setup failed', err); process.exit(1); }
    });
}
