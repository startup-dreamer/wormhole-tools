# wormcraft — Claude Code Rules

Auto-loaded by Claude Code sessions in this repo. Contains the hard facts needed to build correctly.
These rules apply to every task in this project unless explicitly overridden. Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

State your assumptions explicitly. If uncertain, ask.
If multiple interpretations exist, present them - don't pick silently.
If a simpler approach exists, say so. Push back when warranted.
If something is unclear, stop. Name what's confusing. Ask.
2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting.
Don't refactor things that aren't broken.
Match existing style, even if you'd do it differently.
If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused.
Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

"Add validation" → "Write tests for invalid inputs, then make them pass"
"Fix the bug" → "Write a test that reproduces it, then make it pass"
"Refactor X" → "Ensure tests pass before and after"

## What this project is about
TypeScript CLI and SDK for interacting with the Wormhole cross-chain protocol. The project was previously named `wormhole-cli` (Rust); this is the TypeScript rewrite.
Binary name: `wormcraft`. SDK package: `@wormcraft/sdk`.
Reference implementation: `reference/ccip-tools-ts` (TypeScript, study structure only)
Wormhole protocol reference: `reference/wormhole/clients/js/src/`

## Stack
- Language: TypeScript 5.4 (strict mode, `"noUncheckedIndexedAccess": true`)
- CLI framework: Commander.js v12
- Runtime: Node.js native async/await
- EVM: viem v2
- Solana: @solana/web3.js v1
- VAA parsing/encoding: custom (see packages/sdk/src/vaa/)
- Config: dotenv, loading from ~/.wormcraft/.env, env var prefix `WORMCRAFT_`
- Build: tsup (esbuild)
- Tests: vitest
- Solidity: 0.8.28, OpenZeppelin Contracts 5.x / Contracts-Upgradeable 5.x, Foundry
- Package structure: `packages/cli` (binary `wormcraft`) and `packages/sdk` (`@wormcraft/sdk`)

## Architecture Rules
- Commands go in packages/cli/src/commands/ — one file per command group
- Chain-specific logic goes in packages/sdk/src/chains/ — one module per chain family
- VAA encoding/decoding is isolated in packages/sdk/src/vaa/
- No business logic in packages/cli/src/index.ts — it is the entrypoint only
- Errors use WormcraftError class hierarchy (see packages/sdk/src/error.ts), propagated in CLI layer

## Solidity Contracts (contracts/)
Three upgrade governance models are implemented — choose based on protocol needs:

| Contract | Path | Purpose |
|----------|------|---------|
| `WormcraftDeployer` | `contracts/src/` | Hub contract; orchestrates cross-chain deploy/call/upgrade via Wormhole relayer |
| `WormcraftProxy` | `contracts/src/` | Base for UUPS proxies that accept upgrades from WormcraftDeployer directly |
| `WormcraftModule` | `contracts/src/` | Ownerless Gnosis Safe module; receives Wormhole messages and calls `Safe.execTransactionFromModule` |
| `WormcraftAdminModule` | `contracts/src/` | Standalone proxy admin; supports direct upgrades + OZ TimelockController + Safe canceller; **no inheritance required in proxy** |
| `IWormcraftAdminModule` | `contracts/src/interfaces/` | Interface + `ProxyKind` enum + `ProxyConfig` struct for `WormcraftAdminModule` |

### WormcraftAdminModule upgrade flows
```
Direct mode (no timelock):
  WormcraftDeployer ──callAcrossChains──▶ adminModule.scheduleOrUpgrade()
                                               └──▶ proxy.upgradeToAndCall()

Timelock mode (Safe as canceller):
  WormcraftDeployer ──callAcrossChains──▶ adminModule.scheduleOrUpgrade()
                                               └──▶ TimelockController.schedule()
                                                    [delay — Safe can cancel]
  anyone            ──────────────────▶ adminModule.executeTimelocked()
                                               └──▶ TimelockController.execute()
                                                         └──▶ proxy.upgradeToAndCall()
```

## SDK Deploy Module (packages/sdk/src/deploy/)
Key exports from `@wormcraft/sdk`:

| Function | Description |
|----------|-------------|
| `deployAcrossChains` | Deploy bytecode via WormcraftDeployer to one or more chains |
| `callAcrossChains` | Send arbitrary calldata to a target contract cross-chain |
| `upgradeAcrossChains` | Upgrade a WormcraftProxy-based UUPS proxy across chains |
| `executeViaModule` | Upgrade via WormcraftModule + Gnosis Safe (Safe as upgrade authority) |
| `scheduleUpgradeViaManagedAdmin` | Schedule (or direct-execute) upgrade via WormcraftAdminModule |
| `executeUpgradeViaManagedAdmin` | Execute a timelocked upgrade via WormcraftAdminModule after delay |
| `encodeScheduleUpgradeMessage` | ABI-encode calldata for `scheduleOrUpgrade(address,address,bytes32)` |
| `encodeExecuteUpgradeMessage` | ABI-encode calldata for `executeTimelocked(address,address,bytes32)` |

## CLI Commands Reference (packages/cli/)

### `wormcraft deploy upgrade`
Supports three governance modes via flag combination:

```bash
# 1. Direct (WormcraftProxy inheritance)
wormcraft deploy upgrade --proxy $PROXY --new-impl $IMPL --chains sepolia

# 2. Via Gnosis Safe module (WormcraftModule)
wormcraft deploy upgrade --proxy $PROXY --new-impl $IMPL --chains sepolia \
  --safe $SAFE --module $WORMCRAFT_MODULE

# 3. Via WormcraftAdminModule (no inheritance, optional timelock)
wormcraft deploy upgrade --proxy $PROXY --new-impl $IMPL --chains sepolia \
  --admin-module $ADMIN_MODULE --salt my-upgrade-salt
```

### `wormcraft deploy execute`
Execute a timelocked AdminModule upgrade after the TimelockController delay:

```bash
wormcraft deploy execute \
  --proxy $PROXY --new-impl $IMPL --chains sepolia \
  --admin-module $ADMIN_MODULE --salt my-upgrade-salt
```

### `wormcraft module setup`
Generate Safe Transaction Builder JSON for one-time WormcraftModule setup:

```bash
wormcraft module setup \
  --safe $SAFE --module $WORMCRAFT_MODULE \
  --source-chain 10002 --authorized $WALLET
```

## Code Rules
- All exported functions and classes must have JSDoc comments
- No non-null assertions (`!`) in non-test code — use explicit checks or optional chaining
- Private keys never logged, never in error messages
- Build this project modularly, with each component having a clear purpose and interface.
- Build the cli in the pattern where it can be used as a library and as a standalone executable.
- Tests go in the same file as the code they test (vitest `*.test.ts` co-located)
- Integration tests go in tests/
- Solidity tests go in contracts/test/ (Foundry `.t.sol` pattern)

## Reference Usage
- Study ccip-tools-ts for: command structure, multi-RPC patterns, chain module separation
- Study reference/wormhole/clients/js/src/cmds/ for: exact VAA logic to port
- Translate logic to idiomatic TypeScript — do not copy verbatim

## Git
- Branch naming: feat/command-name, fix/issue-description
- Commits: conventional commits format (feat:, fix:, chore:, docs:)
- Never commit .env files or private keys
