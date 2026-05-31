# wormcraft

Command-line interface for the [Wormhole](https://wormhole.com) cross-chain messaging protocol.

> Convenience tooling for development — not an official Wormhole product.

## Install

```bash
npm install -g wormcraft
```

Or run without installing:

```bash
npx wormcraft --help
```

## Configuration

Create `~/.wormcraft/.env`. RPC URLs use the pattern `WORMCRAFT_{CHAIN_TICKER}_RPC`:

```env
WORMCRAFT_ETHEREUM_RPC=https://mainnet.infura.io/v3/YOUR_KEY
WORMCRAFT_SOLANA_RPC=https://api.mainnet-beta.solana.com
WORMCRAFT_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
WORMCRAFT_NETWORK=mainnet
```

See the [configuration reference](https://github.com/startup-dreamer/wormhole-tools/blob/main/docs/cli/README.md#configuration) for all variables.

## Examples

```bash
# Track a Wormhole message
wormcraft status 0xb789efdb02a76692efd7f2aabde73470ad63fc9571a93f28f6ec505b79f4de3b

# Guardian signing latency
wormcraft latency solana
wormcraft latency ethereum --count 50

# Chain info
wormcraft info chain-id solana
wormcraft info contract-address mainnet ethereum core

# Parse a VAA
wormcraft parse 010000000001...

# Token bridge transfer
wormcraft transfer \
  --token 0x2D8BE6BF0baA74e0A907016679CaE9190e80dD0A \
  --amount 1000000000000000000 \
  --dst-chain 1 \
  --recipient 069b8857feab8184fb687f634618c035dac439dc1aeb8b2598f6c6c71f0ebdd4

# Cross-chain deploy / upgrade
wormcraft deploy --help
wormcraft deploy upgrade --help
```

## Library usage

The CLI package exports config and provider helpers for embedding:

```typescript
import { loadConfig, createEvmChain } from "wormcraft";
```

For protocol logic (VAA parsing, deploy, status), use [`@wormcraft/sdk`](https://www.npmjs.com/package/@wormcraft/sdk).

## Documentation

- [Full CLI reference](https://github.com/startup-dreamer/wormhole-tools/blob/main/docs/cli/README.md)
- [SDK package](https://www.npmjs.com/package/@wormcraft/sdk)

## License

MIT
