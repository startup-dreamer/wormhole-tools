# worm-tool

TypeScript CLI and SDK for interacting with the [Wormhole](https://wormhole.com) cross-chain
messaging protocol.

> This tool is provided for convenience and development purposes only. It is not an official
> Wormhole product.

## Packages

| Package | Description |
|---------|-------------|
| [`worm-tool`](./packages/cli) | Command-line interface (`worm-tool` binary) |
| [`@worm-tool/sdk`](./packages/sdk) | TypeScript SDK for Wormhole protocol interaction |

## Install

```bash
npm install -g worm-tool
```

## Configuration

Create `~/.worm-tool/.env`:

```env
WORM_TOOL_PRIVATE_KEY=0xYOUR_EVM_PRIVATE_KEY
WORM_TOOL_SOLANA_PRIVATE_KEY=YOUR_BASE58_SOLANA_KEY
```

## Quick Examples

**Track a Wormhole message:**

```bash
worm-tool status 0xb789efdb02a76692efd7f2aabde73470ad63fc9571a93f28f6ec505b79f4de3b
```

**Measure guardian signing latency:**

```bash
worm-tool latency solana
worm-tool latency ethereum --count 50
```

**Query chain info:**

```bash
worm-tool info chain-id solana       # → 1
worm-tool info contract-address mainnet ethereum core
```

**Parse a VAA:**

```bash
worm-tool parse 010000000001...
```

**Initiate a token bridge transfer:**

```bash
worm-tool transfer \
  --token 0x2D8BE6BF0baA74e0A907016679CaE9190e80dD0A \
  --amount 1000000000000000000 \
  --dst-chain 1 \
  --recipient 069b8857feab8184fb687f634618c035dac439dc1aeb8b2598f6c6c71f0ebdd4
```

## SDK Usage

```typescript
import { parseVaa, EvmChain, getMessageStatus, MessageStatus } from '@worm-tool/sdk';

// Parse a VAA
const vaa = parseVaa('0x010000000001...');
console.log(vaa.emitterChain, vaa.sequence);

// Check message status
const result = await getMessageStatus({
  emitterChain: 2,
  emitterAddress: '0x0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585',
  sequence: 643990n,
});

if (result.status === MessageStatus.Signed) {
  console.log('VAA ready:', result.vaaBytes);
}
```

## Documentation

- [CLI Reference](./docs/cli/README.md) — All commands, options, and examples
- [SDK Reference](./docs/sdk/README.md) — API reference for `@worm-tool/sdk`

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
