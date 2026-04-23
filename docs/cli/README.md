# worm CLI Reference

Command-line interface for interacting with the Wormhole cross-chain protocol.

`worm` can query message status, measure guardian latency, read on-chain contract state, parse and
generate VAAs, and initiate token bridge transfers — across EVM chains, Solana, Aptos, NEAR, and Sui.

---

## Contents

- [Installation](#installation)
- [Networks](#networks)
- [Wallet & Private Keys](#wallet--private-keys)
- [Command Reference](#command-reference)
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
- [Known Public RPCs](#known-public-rpcs)
- [Supported Chains](#supported-chains)

---

## Installation

```bash
git clone https://github.com/your-org/wormhole-cli
cd wormhole-cli
cargo build --release
```

The binary is at `./target/release/worm`. Add it to your `PATH` or install with:

```bash
cargo install --path crates/wormhole-cli
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

Commands that submit transactions accept a private key via argument or environment variable.

**EVM:**

```bash
# via flag
worm transfer ... --private-key 0xYOUR_HEX_KEY

# via environment variable
export EVM_PRIVATE_KEY=0xYOUR_HEX_KEY
worm transfer ...
```

**Solana:**

```bash
export SOLANA_PRIVATE_KEY=<base58-64-byte-keypair>
```

> [!WARNING]
> Private keys are never logged or included in error messages. Never commit keys to source control.

---

## Command Reference

---

### `status`

Track a Wormhole message end-to-end by its source transaction hash.

```bash
worm status <TX_HASH> [--network mainnet|testnet]
```

Queries the Wormhole Scan API and prints source chain, destination chain, VAA signing status, token
metadata, and a direct link to the Wormhole explorer. Retries up to 3 times with a 1-second delay
if the transaction has not yet been indexed.

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
worm status 0xb789efdb02a76692efd7f2aabde73470ad63fc9571a93f28f6ec505b79f4de3b --network mainnet
```

**Output:**

```json
{
  "source": {
    "chain": "ethereum",
    "chain_id": 2,
    "tx_hash": "0xb789efdb...",
    "from": "0x8eeb81fc...",
    "emitter": "0x3ee18b22...",
    "timestamp": "2026-05-17T05:07:35Z"
  },
  "destination": {
    "chain": "solana",
    "chain_id": 1,
    "address": "7NoE35m1pPZEusgY9p2SERnZqH6eaK1eoswmn5dfzDiW",
    "tx_hash": "u4dATZAApDFH...",
    "timestamp": "2026-05-17T05:30:30Z"
  },
  "token": {
    "symbol": "WETH",
    "amount": "10",
    "amount_usd": "21878.3"
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

**Emitter address format:** EVM addresses are displayed as `0x` + 40 hex chars (20 bytes), Solana as base58, Sui/Aptos as `0x` + 64 hex chars.

---

### `latency`

Measure real-time guardian signing latency for a source chain.

```bash
worm latency <CHAIN> [--count N] [--network mainnet|testnet]
```

Fetches the `N` most recent VAAs for the chain from Wormhole Scan and computes p50/p95/min/max
latency — the time from the block timestamp to when guardians reached quorum.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<CHAIN>` | Chain name (e.g. `solana`, `ethereum`, `bsc`, `polygon`) |

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--count` | `20` | Number of recent VAAs to sample |
| `--network` | `mainnet` | Wormhole network |

**Examples:**

```bash
worm latency solana --network mainnet
worm latency ethereum --network mainnet
worm latency bsc --count 50 --network mainnet
```

**Output:**

```json
{
  "chain": "solana",
  "p50_secs": 15,
  "p95_secs": 22,
  "min_secs": 14,
  "max_secs": 27,
  "sample_count": 20
}
```

---

### `info`

Query Wormhole chain and contract metadata from the built-in registry.

#### `info chain-id`

Print the Wormhole chain ID for a named chain.

```bash
worm info chain-id <CHAIN_NAME>
```

**Examples:**

```bash
worm info chain-id solana      # → 1
worm info chain-id ethereum    # → 2
worm info chain-id bsc         # → 4
worm info chain-id arbitrum    # → 23
worm info chain-id base        # → 30
```

#### `info contract-address`

Print the contract address for a Wormhole module on a given chain and network.

```bash
worm info contract-address <NETWORK> <CHAIN> <MODULE>
```

`<MODULE>` is one of: `core`, `token_bridge`, `nft_bridge`.

**Examples:**

```bash
worm info contract-address mainnet ethereum core
# → "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B"

worm info contract-address mainnet ethereum token_bridge
# → "0x3ee18B2214AFF97000D974cf647E7C347E8fa585"

worm info contract-address mainnet solana token_bridge
# → "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb"

worm info contract-address testnet sepolia core
# → "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78"
```

#### `info emitter-address`

Convert a native chain address to the 32-byte Wormhole emitter format.

```bash
worm info emitter-address <CHAIN> <ADDRESS>
```

EVM addresses (20 bytes) are zero-padded on the left. Other addresses must already be 32-byte hex.

**Examples:**

```bash
worm info emitter-address ethereum 0x3ee18B2214AFF97000D974cf647E7C347E8fa585
# → "0x0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585"

worm info emitter-address solana wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb
```

---

### `parse`

Parse a VAA and print all fields as JSON.

```bash
worm parse <VAA>
```

Accepts hex (with or without `0x` prefix) and base64 (standard or URL-safe) encoded VAAs.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<VAA>` | Hex or base64-encoded VAA |

**Example:**

```bash
# Pipe a generated VAA directly into parse
worm generate registration \
  --guardian-secret cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0 \
  --module TokenBridge \
  --chain-id 2 \
  --contract-address 0x3ee18B2214AFF97000D974cf647E7C347E8fa585 \
| worm parse
```

**Output:**

```json
{
  "version": 1,
  "guardian_set_index": 0,
  "signatures": [...],
  "timestamp": 0,
  "nonce": 0,
  "emitter_chain": 1,
  "emitter_address": "0000000000000000000000000000000000000000000000000000000000000004",
  "sequence": 0,
  "consistency_level": 0,
  "payload": "...",
  "digest": "..."
}
```

---

### `generate`

Generate signed VAAs for devnet and testnet use. Requires a guardian private key.

```bash
worm generate --guardian-secret <KEY> <SUBCOMMAND>
```

**Options:**

| Option | Alias | Description |
|--------|-------|-------------|
| `--guardian-secret` | `-g` | Guardian private key(s), comma-separated hex strings |

#### `generate registration`

Generate a chain registration governance VAA.

```bash
worm generate --guardian-secret <KEY> registration \
  --module <MODULE> \
  --chain-id <CHAIN_ID> \
  --contract-address <ADDRESS>
```

| Option | Alias | Description |
|--------|-------|-------------|
| `--module` | `-m` | `Core`, `TokenBridge`, `NFTBridge`, or `WormholeRelayer` |
| `--chain-id` | `-c` | Wormhole chain ID of the chain being registered |
| `--contract-address` | `-a` | Contract address to register (hex) |

**Example:**

```bash
worm generate \
  --guardian-secret cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0 \
  registration \
  --module TokenBridge \
  --chain-id 2 \
  --contract-address 0x3ee18B2214AFF97000D974cf647E7C347E8fa585
```

#### `generate upgrade`

Generate a contract upgrade governance VAA.

```bash
worm generate --guardian-secret <KEY> upgrade \
  --module <MODULE> \
  --chain-id <CHAIN_ID> \
  --contract-address <NEW_ADDRESS>
```

Options are the same as `registration` — `--module`, `--chain-id`, `--contract-address`.

#### `generate attestation`

Generate a token attestation VAA (used to register a token with the Token Bridge).

```bash
worm generate --guardian-secret <KEY> attestation \
  --emitter-chain <CHAIN_ID> \
  --emitter-address <ADDRESS> \
  --chain <CHAIN_ID> \
  --token-address <ADDRESS> \
  --decimals <N> \
  --symbol <SYMBOL> \
  --name <NAME>
```

| Option | Alias | Description |
|--------|-------|-------------|
| `--emitter-chain` | `-e` | Wormhole chain ID of the emitter |
| `--emitter-address` | `-f` | Emitter address (hex) |
| `--chain` | `-c` | Token's Wormhole chain ID |
| `--token-address` | `-a` | Token contract address (hex) |
| `--decimals` | `-d` | Token decimals |
| `--symbol` | `-s` | Token symbol (e.g. `WETH`) |
| `--name` | `-n` | Token name (e.g. `Wrapped Ether`) |

---

### `submit`

Submit a VAA to a Wormhole contract on an EVM chain.

```bash
worm submit <VAA> [OPTIONS]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<VAA>` | Hex or base64-encoded VAA to submit |

**Options:**

| Option | Alias | Description |
|--------|-------|-------------|
| `--chain` | `-c` | Target EVM chain name (e.g. `ethereum`) |
| `--contract-address` | `-a` | Override target contract address |
| `--rpc` | | RPC endpoint URL |
| `--from` | | `from` address for devnet (unlocked account) |
| `--evm-key` | | Secp256k1 private key for signed submission (env: `WORMHOLE_EVM_KEY`) |

The target contract is selected automatically from the payload module (`Core`, `TokenBridge`, `NFTBridge`).
On devnet, pass `--from` with an unlocked Ganache/Anvil account. On testnet/mainnet, pass `--evm-key`.

**Example (devnet):**

```bash
worm submit $(cat my.vaa) \
  --rpc http://localhost:8545 \
  --from 0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1
```

---

### `redeem`

Manually redeem a stuck Wormhole VAA on the destination chain.

```bash
worm redeem <INPUT> [OPTIONS]
```

Accepts either a source transaction hash (which triggers a lookup of the VAA via Wormhole Scan) or
a raw VAA bytes string. Submits the VAA to the appropriate contract on the destination chain.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<INPUT>` | Source tx hash (`0x` + 64 hex chars) or raw VAA (hex or base64) |

**Options:**

| Option | Description |
|--------|-------------|
| `--dst-chain` | Destination chain name (e.g. `ethereum`) |
| `--rpc` | Destination chain RPC endpoint (default: `http://localhost:8545`) |
| `--from` | `from` address for devnet (env: `WORMHOLE_EVM_FROM`) |
| `--contract` | Override target contract address |
| `--network` | Network for API VAA lookup when input is a tx hash (default: `mainnet`) |

**Example:**

```bash
# Redeem by source tx hash (fetches VAA from Wormhole Scan)
worm redeem 0xb789efdb02a76692efd7f2aabde73470ad63fc9571a93f28f6ec505b79f4de3b \
  --dst-chain ethereum \
  --rpc https://ethereum.publicnode.com \
  --network mainnet

# Redeem by raw VAA
worm redeem 010000000601... \
  --rpc http://localhost:8545 \
  --from 0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1
```

---

### `transfer`

Initiate a Wormhole token bridge transfer from an EVM chain.

```bash
worm transfer [OPTIONS]
```

**Required options:**

| Option | Description |
|--------|-------------|
| `--token` | ERC-20 token address (`0x`-prefixed) |
| `--amount` | Amount in the token's smallest unit (e.g. wei) |
| `--dst-chain` | Wormhole chain ID of the destination (e.g. `1` for Solana) |
| `--recipient` | 32-byte recipient address on the destination chain (64 hex chars) |

**Optional:**

| Option | Default | Description |
|--------|---------|-------------|
| `--token-bridge` | devnet address | Token bridge contract address |
| `--rpc` | `http://localhost:8545` | EVM RPC endpoint |
| `--from` | devnet account | `from` address (unlocked devnet account) |
| `--private-key` | `EVM_PRIVATE_KEY` env | Secp256k1 private key for mainnet/testnet |
| `--arbiter-fee` | `0` | Relayer fee in token's smallest unit |
| `--nonce` | `0` | Transfer nonce for deduplication |

**Example (devnet):**

```bash
worm transfer \
  --token 0x2D8BE6BF0baA74e0A907016679CaE9190e80dD0A \
  --amount 1000000000000000000 \
  --dst-chain 1 \
  --recipient 069b8857feab8184fb687f634618c035dac439dc1aeb8b2598f6c6c71f0ebdd4 \
  --rpc http://localhost:8545
```

---

### `tokens`

Query Token Bridge registered tokens on an EVM chain.

#### `tokens wrapped`

Look up the wrapped token address for a foreign token on an EVM chain.

```bash
worm tokens wrapped \
  --origin-chain <CHAIN_NAME> \
  --token <TOKEN_ADDRESS> \
  --chain <CHAIN_NAME> \
  --rpc <RPC_URL>
```

| Option | Description |
|--------|-------------|
| `--origin-chain` | Chain name where the token originates (e.g. `solana`) |
| `--token` | Token address on the origin chain (32-byte hex or `0x`-prefixed) |
| `--chain` | Destination chain where the wrapped address is queried (e.g. `ethereum`) |
| `--rpc` | RPC endpoint of the destination chain |
| `--contract` | Override Token Bridge contract address |
| `--network` | Network for default contract lookup (default: `mainnet`) |

**Example:**

```bash
worm tokens wrapped \
  --origin-chain solana \
  --token 069b8857feab8184fb687f634618c035dac439dc1aeb8b2598f6c6c71f0ebdd4 \
  --chain ethereum \
  --rpc https://ethereum.publicnode.com
```

**Output:**

```json
{ "wrapped_address": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" }
```

#### `tokens is-wrapped`

Check whether an address is a Wormhole-wrapped token on an EVM chain.

```bash
worm tokens is-wrapped \
  --token <TOKEN_ADDRESS> \
  --chain <CHAIN_NAME> \
  --rpc <RPC_URL>
```

| Option | Description |
|--------|-------------|
| `--token` | Token address to check (`0x`-prefixed) |
| `--chain` | Chain name (e.g. `ethereum`) |
| `--rpc` | RPC endpoint |
| `--contract` | Override Token Bridge contract address |
| `--network` | Network for default contract lookup (default: `mainnet`) |

**Example:**

```bash
worm tokens is-wrapped \
  --token 0x3ee18B2214AFF97000D974cf647E7C347E8fa585 \
  --chain ethereum \
  --rpc https://ethereum.publicnode.com
```

**Output:**

```json
{ "is_wrapped": false }
```

---

### `evm`

Read state from Wormhole contracts on an EVM chain.

#### `evm init-wormhole`

Read the current guardian set index and chain ID from the core bridge contract.

```bash
worm evm init-wormhole [--rpc <URL>] [--contract <ADDRESS>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--rpc` | `http://localhost:8545` | EVM RPC endpoint |
| `--contract` | devnet core bridge | Core bridge contract address |

**Example (mainnet):**

```bash
worm evm init-wormhole \
  --rpc https://ethereum.publicnode.com \
  --contract 0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B
```

**Output:**

```json
{
  "guardianSetIndex": 6,
  "chainId": 2
}
```

> [!TIP]
> Use a reliable public RPC. RPCs that return HTML error pages (e.g. Cloudflare 5xx) will show
> `"RPC returned non-JSON (HTML error page?)"`. Use `https://ethereum.publicnode.com` or similar.

#### `evm init-token-bridge`

Read the chain ID configured in a Token Bridge contract.

```bash
worm evm init-token-bridge [--rpc <URL>] [--contract <ADDRESS>]
```

**Example:**

```bash
worm evm init-token-bridge \
  --rpc https://ethereum.publicnode.com \
  --contract 0x3ee18B2214AFF97000D974cf647E7C347E8fa585
```

**Output:**

```json
{ "chainId": 2 }
```

---

### `solana`

Interact with Wormhole contracts on Solana via JSON-RPC.

#### `solana node-info`

Print the current slot and health status of a Solana node.

```bash
worm solana node-info [--rpc <URL>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--rpc` | `https://api.mainnet-beta.solana.com` | Solana JSON-RPC endpoint |

**Example:**

```bash
worm solana node-info
```

**Output:**

```json
{ "slot": 420286647, "health": "ok" }
```

#### `solana guardian-set`

Read the current guardian set index from the Wormhole bridge state account.

```bash
worm solana guardian-set [--rpc <URL>] [--contract <ACCOUNT>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--rpc` | mainnet-beta | Solana JSON-RPC endpoint |
| `--contract` | mainnet bridge state PDA | Bridge **state** account address (PDA, not the program ID) |

> [!NOTE]
> The `--contract` argument must be the bridge **state** PDA (`2yVjuQwpsvdsrywzsJJVs9Ueh4zayyo5DYJbBNc3DDpn`
> on mainnet), not the program ID (`worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth`).
> The default is already set to the correct mainnet PDA.

**Example:**

```bash
worm solana guardian-set
```

**Output:**

```json
{ "guardian_set_index": 6 }
```

#### `solana sequence`

Read the sequence number from a Wormhole emitter sequence account.

```bash
worm solana sequence --emitter <ACCOUNT> [--rpc <URL>]
```

| Option | Description |
|--------|-------------|
| `--emitter` | Emitter sequence PDA address |
| `--rpc` | Solana JSON-RPC endpoint (default: mainnet-beta) |

**Example:**

```bash
worm solana sequence \
  --emitter HPbJ7bWR1BoQQuxx9Cx8ZhE1mEEaTeqKUJuNfMjXXVwZ
```

---

### `aptos`

Interact with Wormhole contracts on the Aptos blockchain.

#### `aptos ledger-info`

Print ledger metadata from an Aptos node (connectivity check).

```bash
worm aptos ledger-info [--rpc <URL>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--rpc` | `http://0.0.0.0:8080/v1` | Aptos REST API URL. The `/v1` suffix is appended automatically if omitted. |

**Example:**

```bash
worm aptos ledger-info --rpc https://fullnode.mainnet.aptoslabs.com
```

**Output:**

```json
{
  "chain_id": 1,
  "epoch": "15830",
  "ledger_version": "5304749945"
}
```

#### `aptos init-wormhole` / `aptos init-token-bridge`

These subcommands are placeholders. Aptos Move transaction submission requires ed25519 signing,
which is not yet implemented. They return an `unsupported` error with a descriptive message.

```bash
worm aptos init-wormhole --rpc https://fullnode.mainnet.aptoslabs.com
# Error: unsupported: Aptos Move transaction submission requires ed25519 signing...
```

---

### `near`

Interact with Wormhole contracts on NEAR.

#### `near node-status`

Print node status from a NEAR RPC endpoint (connectivity check).

```bash
worm near node-status [--rpc <URL>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--rpc` | `http://localhost:3030` | NEAR JSON-RPC endpoint |

**Example:**

```bash
worm near node-status --rpc https://rpc.mainnet.near.org
```

**Output:**

```json
{
  "chain_id": "mainnet",
  "rpc_addr": "0.0.0.0:3030",
  "protocol_version": 83
}
```

---

### `sui`

Interact with Wormhole contracts on Sui.

#### `sui node-info`

Print the latest checkpoint sequence number from a Sui node (connectivity check).

```bash
worm sui node-info [--rpc <URL>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--rpc` | `http://0.0.0.0:9000` | Sui JSON-RPC endpoint |

**Example:**

```bash
worm sui node-info --rpc https://fullnode.mainnet.sui.io:443
```

**Output:**

```json
{ "latest_checkpoint": 276528981 }
```

---

### `completion`

Generate shell tab-completion scripts.

```bash
worm completion <SHELL>
```

`<SHELL>` is one of: `bash`, `zsh`, `fish`.

**Setup:**

```bash
# bash
worm completion bash >> ~/.bashrc && source ~/.bashrc

# zsh
worm completion zsh >> ~/.zshrc && source ~/.zshrc

# fish
worm completion fish > ~/.config/fish/completions/worm.fish
```

After setup, `<TAB>` completes commands and flags:

```bash
worm st<TAB>       # → status, submit
worm latency <TAB> # → shows --count, --network
```

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

> [!IMPORTANT]
> Public RPCs may rate-limit or block certain calls. For production use, use a dedicated RPC
> provider (Alchemy, Infura, QuickNode, etc.).

---

## Supported Chains

### Chain IDs

| Chain | Wormhole ID | Notes |
|-------|-------------|-------|
| Solana | 1 | |
| Ethereum | 2 | |
| Terra | 3 | |
| BSC | 4 | |
| Polygon | 5 | |
| Avalanche | 6 | |
| Fantom | 10 | |
| Klaytn | 13 | |
| Celo | 14 | |
| Moonbeam | 16 | |
| Sui | 21 | |
| Aptos | 22 | |
| Arbitrum | 23 | |
| Optimism | 24 | |
| Base | 30 | |
| Sei | 32 | |
| Scroll | 34 | |
| Mantle | 35 | |
| Blast | 36 | |
| Linea | 38 | |
| Berachain | 39 | |
| Sepolia (testnet) | 10002 | |
| Arbitrum Sepolia (testnet) | 10003 | |
| Base Sepolia (testnet) | 10004 | |
| Optimism Sepolia (testnet) | 10005 | |

### CLI support by chain

| Chain Family | `latency` | `status` | `evm` | `tokens` | `submit` | `redeem` | Node info |
|--------------|-----------|----------|-------|----------|----------|----------|-----------|
| EVM (Ethereum, BSC, …) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | via `evm` |
| Solana | ✓ | ✓ | — | — | — | — | `solana node-info` |
| Aptos | — | — | — | — | — | — | `aptos ledger-info` |
| NEAR | — | — | — | — | — | — | `near node-status` |
| Sui | — | — | — | — | — | — | `sui node-info` |
