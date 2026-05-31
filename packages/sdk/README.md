# @wormcraft/sdk

TypeScript SDK for interacting with the [Wormhole](https://wormhole.com) cross-chain messaging protocol.

> Convenience tooling for development — not an official Wormhole product.

## Install

```bash
npm install @wormcraft/sdk
```

Requires Node.js >= 20.

## Quick start

```typescript
import {
  parseVaa,
  getMessageStatus,
  MessageStatus,
  EvmChain,
} from "@wormcraft/sdk";

// Parse a VAA (hex or base64)
const vaa = parseVaa("0x010000000001...");
console.log(vaa.emitterChain, vaa.sequence);

// Track message status
const result = await getMessageStatus({
  emitterChain: 2,
  emitterAddress:
    "0x0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585",
  sequence: 643990n,
});

if (result.status === MessageStatus.Signed) {
  console.log("VAA ready:", result.vaaBytes);
}

// EVM chain adapter (viem)
const eth = new EvmChain({
  chainId: 2n,
  chainName: "ethereum",
  rpcUrl: process.env.WORMCRAFT_ETHEREUM_RPC!,
});
```

## Modules

| Area | Exports |
| ---- | ------- |
| VAA | `parseVaa`, `encodeVaaHex`, types |
| Chains | `EvmChain`, `SolanaChain`, `WormcraftChain` |
| Deploy | `deployAcrossChains`, `callAcrossChains`, `upgradeAcrossChains`, Safe/admin-module helpers |
| Status | `getMessageStatus`, `MessageStatus` |
| Transfer | Token bridge helpers |
| Toolchain | Foundry / contract tooling utilities |

## Configuration

The SDK reads RPC URLs and keys from the environment (same as the CLI). Use the `WORMCRAFT_` prefix, e.g. `WORMCRAFT_ETHEREUM_RPC`, `WORMCRAFT_PRIVATE_KEY`. See the [CLI configuration docs](https://github.com/startup-dreamer/wormhole-tools/blob/main/docs/cli/README.md#configuration).

## Documentation

- [Full SDK reference](https://github.com/startup-dreamer/wormhole-tools/blob/main/docs/sdk/README.md)
- [Monorepo README](https://github.com/startup-dreamer/wormhole-tools#readme)

## License

MIT
