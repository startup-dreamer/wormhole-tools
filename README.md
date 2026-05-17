# wormhole-cli

Rust CLI and SDK for interacting with the [Wormhole](https://wormhole.com) cross-chain messaging protocol.

> [!IMPORTANT]
> This tool is provided for convenience and development purposes only. It is not an official Wormhole product.

## Packages

| Crate | Description |
|-------|-------------|
| [`wormhole-cli`](./crates/wormhole-cli) | Command-line interface (`worm`) |
| [`wormhole-sdk`](./crates/wormhole-sdk) | Rust library for Wormhole protocol interaction |

## Quick Start

### Track a Wormhole Message

```bash
worm status 0xb789efdb02a76692efd7f2aabde73470ad63fc9571a93f28f6ec505b79f4de3b --network mainnet
```

### Measure Guardian Signing Latency

```bash
worm latency solana --network mainnet
worm latency ethereum --network mainnet
```

### Query Chain Info

```bash
worm info chain-id solana
worm info contract-address mainnet ethereum core
```

## Installation

### From Source

Requires Rust stable (`rustup` recommended).

```bash
git clone https://github.com/your-org/wormhole-cli
cd wormhole-cli
cargo build --release
./target/release/worm --help
```

To install system-wide:

```bash
cargo install --path crates/wormhole-cli
worm --help
```

**Enable shell completion (optional):**

```bash
# bash
worm completion bash >> ~/.bashrc

# zsh
worm completion zsh >> ~/.zshrc

# fish
worm completion fish > ~/.config/fish/completions/worm.fish
```

## Supported Chains

| Chain | Status | Notes |
|-------|--------|-------|
| EVM (Ethereum, BSC, Polygon, Arbitrum, …) | Full | Read, submit, transfer |
| Solana | Read | Node info, guardian set, sequence |
| Aptos | Read | Ledger info; tx submission requires ed25519 (not yet implemented) |
| NEAR | Read | Node status only |
| Sui | Read | Latest checkpoint only |

## Documentation

📖 **[Full CLI Reference](./docs/cli/README.md)** — All commands, options, and examples.

## Development

```bash
cargo build --all
cargo test --all
```

Zero warnings policy — `RUSTFLAGS="-D warnings" cargo build --all` must pass.

## License

MIT
