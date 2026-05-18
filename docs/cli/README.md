# worm-tool CLI Reference

Command-line interface for interacting with the Wormhole cross-chain protocol.

`worm-tool` can query message status, measure guardian latency, read on-chain contract state, parse
and generate VAAs, initiate token bridge transfers, and **deploy contracts to deterministic addresses
across EVM chains** — across EVM chains, Solana, Aptos, NEAR, and Sui.

---

## Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Networks](#networks)
- [Wallet & Private Keys](#wallet--private-keys)
- [Command Reference](#command-reference)
  - [deploy](#deploy)
  - [status](#status)
  - [latency](#latency)
  - [info](#info)
  - [parse](#parse)
  - [generate](#generate)
  - [submit](#submit)
  - [redeem](#redeem)
  - [transfer](#transfer)
  - [tokens](#tokens)
  - [evm](#evm)
  - [solana](#solana)
  - [aptos](#aptos)
  - [near](#near)
  - [sui](#sui)
  - [completion](#completion)
- [Exit Codes](#exit-codes)
- [JSON Output](#json-output)
- [Known Public RPCs](#known-public-rpcs)
- [Supported Chains](#supported-chains)

---

## Installation

```bash
npm install -g worm-tool
worm-tool --help
```

Or run without installing:

```bash
npx worm-tool --help
```

---

## Configuration

`worm-tool` loads environment variables from `~/.worm-tool/.env` at startup. All recognized
variables use the `WORM_TOOL_` prefix.

| Variable | Description |
|----------|-------------|
| `WORM_TOOL_PRIVATE_KEY` | EVM private key (`0x`-prefixed hex) used by submit/transfer/deploy commands |
| `WORM_TOOL_SOLANA_PRIVATE_KEY` | Solana keypair (base58, 64-byte) |
| `WORM_TOOL_EVM_RPC` | Default EVM RPC URL (overridden per-command with `--rpc`) |
| `WORM_TOOL_SOLANA_RPC` | Default Solana RPC URL |

You can also set variables inline:

```bash
WORM_TOOL_PRIVATE_KEY=0xYOUR_KEY worm-tool transfer ...
```

---

## Networks

Most commands accept a `--network` flag:

| Value | API used |
|-------|----------|
| `mainnet` (default) | `https://api.wormholescan.io` |
| `testnet` | `https://api.testnet.wormholescan.io` |
| `devnet` | `https://api.testnet.wormholescan.io` |

---

## Wallet & Private Keys

Commands that submit transactions read the private key from `WORM_TOOL_PRIVATE_KEY` or an explicit
flag.

**EVM:**

```bash
# via flag
worm-tool transfer ... --private-key 0xYOUR_HEX_KEY

# via environment variable
export WORM_TOOL_PRIVATE_KEY=0xYOUR_HEX_KEY
worm-tool transfer ...
```

**Solana:**

```bash
export WORM_TOOL_SOLANA_PRIVATE_KEY=<base58-64-byte-keypair>
```

> **Warning:** Private keys are never logged or included in error messages. Never commit keys to
> source control.

---

## Command Reference

---

### `deploy`

Deploy and manage contracts at deterministic addresses across EVM chains via `WormToolDeployer`.

See the full guide at **[docs/deploy.md](../deploy.md)** for address determinism, upgradeability, and bootstrapping.

#### `deploy address`

Compute the CREATE2 deployment address offline — no gas required.

```bash
worm-tool deploy address \
  --artifact contracts/out/MyContract.sol/MyContract.json \
  --salt "my-project-v1" \
  --deployer 0x0aA4B5899bAF7326397b1041db9c854056126F57
```

| Option | Description |
|--------|-------------|
| `--artifact <path>` | Hardhat/Foundry artifact JSON |
| `--bytecode <hex>` | Raw init bytecode (alternative to `--artifact`) |
| `--salt <salt>` | CREATE2 salt: 32-byte hex or arbitrary string (keccak256'd) |
| `--deployer <address>` | WormToolDeployer address acting as CREATE2 factory |

#### `deploy multi`

Deploy bytecode on the source chain and optionally propagate cross-chain via Wormhole.

```bash
# Local only (no fee)
worm-tool deploy multi \
  --artifact contracts/out/Counter.sol/Counter.json \
  --salt "counter-v1" \
  --source sepolia

# Cross-chain (requires Wormhole relayer fee)
worm-tool deploy multi \
  --artifact contracts/out/Counter.sol/Counter.json \
  --salt "counter-v1" \
  --source sepolia \
  --targets arbitrum-sepolia,base-sepolia \
  --value 33000000000000000
```

| Option | Description |
|--------|-------------|
| `--artifact <path>` | Hardhat/Foundry artifact JSON |
| `--bytecode <hex>` | Raw init bytecode |
| `--salt <salt>` | CREATE2 salt |
| `--source <chain>` | Source chain (transaction sent here) |
| `--targets <chains>` | Comma-separated cross-chain targets (optional) |
| `--init-hex <hex>` | ABI-encoded initializer calldata |
| `--value <wei>` | ETH for Wormhole relayer fees (required with `--targets`) |
| `--deployer <address>` | Override WormToolDeployer address |

#### `deploy upgrade`

Upgrade a UUPS proxy to a new implementation across chains in one transaction.

```bash
# 1. Deploy v2 impl on each chain
worm-tool deploy multi --artifact out/V2.json --salt "my-v2-impl" --source sepolia
worm-tool deploy multi --artifact out/V2.json --salt "my-v2-impl" --source arbitrum-sepolia
worm-tool deploy multi --artifact out/V2.json --salt "my-v2-impl" --source base-sepolia

# 2. Upgrade — one call propagates to all chains via Wormhole
worm-tool deploy upgrade \
  --proxy 0xPROXY_ADDRESS \
  --new-impl 0xV2_IMPL_ADDRESS \
  --chains sepolia,arbitrum-sepolia,base-sepolia \
  --value 33000000000000000
```

| Option | Description |
|--------|-------------|
| `--proxy <address>` | Proxy contract address |
| `--new-impl <address>` | New implementation address |
| `--chains <chains>` | Comma-separated chain names; first is the source |
| `--value <wei>` | ETH for Wormhole relayer fees |
| `--deployer <address>` | Override WormToolDeployer address |

The proxy must inherit `WormToolProxy` to authorize cross-chain upgrades from WormToolDeployer.

#### `deploy call`

Send an arbitrary function call through WormToolDeployer to the same contract on multiple chains.

```bash
worm-tool deploy call \
  --target 0xCONTRACT_ADDRESS \
  --calldata $(cast calldata "setValue(uint256)" 42) \
  --chains sepolia,arbitrum-sepolia,base-sepolia \
  --value 33000000000000000
```

| Option | Description |
|--------|-------------|
| `--target <address>` | Target contract address |
| `--calldata <hex>` | ABI-encoded calldata |
| `--chains <chains>` | Comma-separated chain names; first is the source |
| `--value <wei>` | ETH for Wormhole relayer fees |
| `--deployer <address>` | Override WormToolDeployer address |

#### `deploy status`

Check whether a contract is deployed at an address on one or more chains.

```bash
worm-tool deploy status \
  --address 0x8a7a833a0ffb9947102be06a6ebf9f8447bb6823 \
  --chains sepolia,arbitrum-sepolia,base-sepolia
```

```json
[
  { "chain": "sepolia",          "address": "0x8a7a...", "deployed": true },
  { "chain": "arbitrum-sepolia", "address": "0x8a7a...", "deployed": true },
  { "chain": "base-sepolia",     "address": "0x8a7a...", "deployed": true }
]
```

---

### `status`

Track a Wormhole message end-to-end by its source transaction hash.

```bash
worm-tool status <TX_HASH> [--network mainnet|testnet]
```

Queries the Wormhole Scan API and prints source chain, destination chain, VAA signing status, token
metadata, and a direct link to the Wormhole explorer.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<TX_HASH>` | Source transaction hash (`0x`-prefixed, 66 chars) |

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--network` | `mainnet` | Wormhole network (`mainnet`, `testnet`, `devnet`) |

**Example:**

```bash
worm-tool status 0xb789efdb02a76692efd7f2aabde73470ad63fc9571a93f28f6ec505b79f4de3b
```

**Output:**

```json
{
  "source": {
    "chain": "ethereum",
    "chainId": 2,
    "txHash": "0xb789efdb...",
    "emitter": "0x3ee18b22...",
    "timestamp": "2026-05-17T05:07:35Z"
  },
  "destination": {
    "chain": "solana",
    "chainId": 1,
    "address": "7NoE35m1pPZEusgY9p2SERnZqH6eaK1eoswmn5dfzDiW",
    "txHash": "u4dATZAApDFH...",
    "timestamp": "2026-05-17T05:30:30Z"
  },
  "vaa": {
    "sequence": 643990,
    "signed": true,
    "signatures": 18,
    "delivered": true
  },
  "explorer": "https://wormholescan.io/tx/0xb789efdb..."
}
```

---

### `latency`

Measure real-time guardian signing latency for a source chain.

```bash
worm-tool latency <CHAIN> [--count N] [--network mainnet|testnet]
```

Fetches the `N` most recent VAAs for the chain and computes p50/p95/min/max latency.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<CHAIN>` | Chain name (e.g. `solana`, `ethereum`, `bsc`) |

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--count` | `20` | Number of recent VAAs to sample |
| `--network` | `mainnet` | Wormhole network |

**Examples:**

```bash
worm-tool latency solana
worm-tool latency ethereum --count 50
```

**Output:**

```json
{
  "chain": "solana",
  "p50Secs": 15,
  "p95Secs": 22,
  "minSecs": 14,
  "maxSecs": 27,
  "sampleCount": 20
}
```

---

### `info`

Query Wormhole chain and contract metadata from the built-in registry.

#### `info chain-id`

Print the Wormhole chain ID for a named chain.

```bash
worm-tool info chain-id <CHAIN_NAME>
```

**Examples:**

```bash
worm-tool info chain-id solana      # → 1
worm-tool info chain-id ethereum    # → 2
worm-tool info chain-id arbitrum    # → 23
```

#### `info contract-address`

Print the contract address for a Wormhole module on a given chain and network.

```bash
worm-tool info contract-address <NETWORK> <CHAIN> <MODULE>
```

`<MODULE>` is one of: `core`, `token_bridge`, `nft_bridge`.

**Examples:**

```bash
worm-tool info contract-address mainnet ethereum core
worm-tool info contract-address mainnet solana token_bridge
worm-tool info contract-address testnet sepolia core
```

#### `info emitter-address`

Convert a native chain address to the 32-byte Wormhole emitter format.

```bash
worm-tool info emitter-address <CHAIN> <ADDRESS>
```

**Example:**

```bash
worm-tool info emitter-address ethereum 0x3ee18B2214AFF97000D974cf647E7C347E8fa585
# → "0x0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585"
```

---

### `parse`

Parse a VAA and print all fields as JSON.

```bash
worm-tool parse <VAA>
```

Accepts hex (with or without `0x` prefix) and base64-encoded VAAs.

**Example:**

```bash
worm-tool parse 010000000001...
```

**Output:**

```json
{
  "version": 1,
  "guardianSetIndex": 0,
  "signatures": [],
  "timestamp": 0,
  "nonce": 0,
  "emitterChain": 1,
  "emitterAddress": "0x0000000000000000000000000000000000000000000000000000000000000004",
  "sequence": "0",
  "consistencyLevel": 0,
  "payload": "0x...",
  "hash": "0x..."
}
```

---

### `generate`

Generate signed VAAs for devnet and testnet use. Requires a guardian private key.

```bash
worm-tool generate --guardian-secret <KEY> <SUBCOMMAND>
```

**Options:**

| Option | Alias | Description |
|--------|-------|-------------|
| `--guardian-secret` | `-g` | Guardian private key(s), comma-separated hex strings |

#### `generate registration`

Generate a chain registration governance VAA.

```bash
worm-tool generate --guardian-secret <KEY> registration \
  --module <MODULE> \
  --chain-id <CHAIN_ID> \
  --contract-address <ADDRESS>
```

| Option | Alias | Description |
|--------|-------|-------------|
| `--module` | `-m` | `Core`, `TokenBridge`, `NFTBridge`, or `WormholeRelayer` |
| `--chain-id` | `-c` | Wormhole chain ID of the chain being registered |
| `--contract-address` | `-a` | Contract address to register (hex) |

#### `generate upgrade`

Generate a contract upgrade governance VAA.

```bash
worm-tool generate --guardian-secret <KEY> upgrade \
  --module <MODULE> \
  --chain-id <CHAIN_ID> \
  --contract-address <NEW_ADDRESS>
```

#### `generate attestation`

Generate a token attestation VAA.

```bash
worm-tool generate --guardian-secret <KEY> attestation \
  --emitter-chain <CHAIN_ID> \
  --emitter-address <ADDRESS> \
  --chain <CHAIN_ID> \
  --token-address <ADDRESS> \
  --decimals <N> \
  --symbol <SYMBOL> \
  --name <NAME>
```

---

### `submit`

Submit a VAA to a Wormhole contract on an EVM chain.

```bash
worm-tool submit <VAA> [OPTIONS]
```

**Options:**

| Option | Alias | Description |
|--------|-------|-------------|
| `--chain` | `-c` | Target EVM chain name (e.g. `ethereum`) |
| `--contract-address` | `-a` | Override target contract address |
| `--rpc` | | RPC endpoint URL |
| `--evm-key` | | Private key (env: `WORM_TOOL_PRIVATE_KEY`) |

**Example (devnet):**

```bash
worm-tool submit 010000000001... \
  --rpc http://localhost:8545 \
  --chain ethereum
```

---

### `redeem`

Manually redeem a stuck Wormhole VAA on the destination chain.

```bash
worm-tool redeem <INPUT> [OPTIONS]
```

Accepts a source transaction hash or raw VAA bytes.

**Options:**

| Option | Description |
|--------|-------------|
| `--dst-chain` | Destination chain name (e.g. `ethereum`) |
| `--rpc` | Destination chain RPC endpoint |
| `--contract` | Override target contract address |
| `--network` | Network for API VAA lookup (default: `mainnet`) |

**Examples:**

```bash
# Redeem by source tx hash
worm-tool redeem 0xb789efdb... --dst-chain ethereum --rpc https://ethereum.publicnode.com

# Redeem by raw VAA
worm-tool redeem 010000000601... --rpc http://localhost:8545
```

---

### `transfer`

Initiate a Wormhole token bridge transfer from an EVM chain.

```bash
worm-tool transfer [OPTIONS]
```

**Required options:**

| Option | Description |
|--------|-------------|
| `--token` | ERC-20 token address (`0x`-prefixed) |
| `--amount` | Amount in the token's smallest unit (e.g. wei) |
| `--dst-chain` | Wormhole chain ID of the destination |
| `--recipient` | 32-byte recipient address on the destination chain (64 hex chars) |

**Optional:**

| Option | Default | Description |
|--------|---------|-------------|
| `--token-bridge` | registry default | Token bridge contract address |
| `--rpc` | `http://localhost:8545` | EVM RPC endpoint |
| `--private-key` | `WORM_TOOL_PRIVATE_KEY` env | EVM private key |
| `--arbiter-fee` | `0` | Relayer fee in token's smallest unit |
| `--nonce` | `0` | Transfer nonce |

---

### `tokens`

Query Token Bridge registered tokens on an EVM chain.

#### `tokens wrapped`

Look up the wrapped token address for a foreign token on an EVM chain.

```bash
worm-tool tokens wrapped \
  --origin-chain <CHAIN_NAME> \
  --token <TOKEN_ADDRESS> \
  --chain <CHAIN_NAME> \
  --rpc <RPC_URL>
```

#### `tokens is-wrapped`

Check whether an address is a Wormhole-wrapped token.

```bash
worm-tool tokens is-wrapped \
  --token <TOKEN_ADDRESS> \
  --chain <CHAIN_NAME> \
  --rpc <RPC_URL>
```

---

### `evm`

Read state from Wormhole contracts on an EVM chain.

#### `evm init-wormhole`

Read the current guardian set index and chain ID from the core bridge contract.

```bash
worm-tool evm init-wormhole [--rpc <URL>] [--contract <ADDRESS>]
```

#### `evm init-token-bridge`

Read the chain ID configured in a Token Bridge contract.

```bash
worm-tool evm init-token-bridge [--rpc <URL>] [--contract <ADDRESS>]
```

---

### `solana`

Interact with Wormhole contracts on Solana.

#### `solana node-info`

```bash
worm-tool solana node-info [--rpc <URL>]
```

#### `solana guardian-set`

Read the current guardian set index from the Wormhole bridge state account.

```bash
worm-tool solana guardian-set [--rpc <URL>] [--contract <ACCOUNT>]
```

#### `solana sequence`

Read the sequence number from a Wormhole emitter sequence account.

```bash
worm-tool solana sequence --emitter <ACCOUNT> [--rpc <URL>]
```

---

### `aptos`

Interact with Wormhole contracts on Aptos.

#### `aptos ledger-info`

```bash
worm-tool aptos ledger-info [--rpc <URL>]
```

---

### `near`

Interact with Wormhole contracts on NEAR.

#### `near node-status`

```bash
worm-tool near node-status [--rpc <URL>]
```

---

### `sui`

Interact with Wormhole contracts on Sui.

#### `sui node-info`

```bash
worm-tool sui node-info [--rpc <URL>]
```

---

### `completion`

Generate shell tab-completion scripts.

```bash
worm-tool completion <SHELL>
```

`<SHELL>` is one of: `bash`, `zsh`, `fish`.

**Setup:**

```bash
# bash
worm-tool completion bash >> ~/.bashrc && source ~/.bashrc

# zsh
worm-tool completion zsh >> ~/.zshrc && source ~/.zshrc

# fish
worm-tool completion fish > ~/.config/fish/completions/worm-tool.fish
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (invalid input, RPC failure, contract error, etc.) |

---

## JSON Output

All commands write JSON to stdout on success. Errors are written to stderr as plain text with a
non-zero exit code. Use `--json` (where supported) to force JSON error output for programmatic
use.

---

## Known Public RPCs

| Chain | URL |
|-------|-----|
| Ethereum mainnet | `https://ethereum.publicnode.com` |
| Solana mainnet | `https://api.mainnet-beta.solana.com` |
| Aptos mainnet | `https://fullnode.mainnet.aptoslabs.com` |
| NEAR mainnet | `https://rpc.mainnet.near.org` |
| Sui mainnet | `https://fullnode.mainnet.sui.io:443` |
| BSC mainnet | `https://bsc-dataseed.binance.org` |

> **Note:** Public RPCs may rate-limit or block certain calls. For production use, use a dedicated
> RPC provider (Alchemy, Infura, QuickNode, etc.).

---

## Supported Chains

### Chain IDs

| Chain | Wormhole ID |
|-------|-------------|
| Solana | 1 |
| Ethereum | 2 |
| BSC | 4 |
| Polygon | 5 |
| Avalanche | 6 |
| Fantom | 10 |
| Klaytn | 13 |
| Celo | 14 |
| Moonbeam | 16 |
| Sui | 21 |
| Aptos | 22 |
| Arbitrum | 23 |
| Optimism | 24 |
| Base | 30 |
| Sei | 32 |
| Scroll | 34 |
| Mantle | 35 |
| Blast | 36 |
| Linea | 38 |
| Berachain | 39 |
| Sepolia (testnet) | 10002 |
| Arbitrum Sepolia (testnet) | 10003 |
| Base Sepolia (testnet) | 10004 |
| Optimism Sepolia (testnet) | 10005 |
