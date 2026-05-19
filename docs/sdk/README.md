# @wormcraft/sdk

TypeScript SDK for interacting with the Wormhole cross-chain messaging protocol.

---

## Installation

```bash
npm install @wormcraft/sdk
```

Requires Node.js >= 18 (native `fetch`, `atob`).

---

## Key Exports

### VAA Parsing and Encoding

```typescript
import { parseVaa, encodeVaaHex } from "@wormcraft/sdk";

// Parse a VAA from hex or base64
const vaa = parseVaa("0x010000000001...");
console.log(vaa.emitterChain, vaa.sequence, vaa.payload);

// Re-encode back to hex
const hex = encodeVaaHex(vaa);
```

`parseVaa(input: string): ParsedVaa` — Accepts `0x`-prefixed hex, raw hex, or base64. Throws
`VaaParseError` on malformed input.

`encodeVaaHex(vaa: ParsedVaa): `0x${string}``— Re-encode a`ParsedVaa` to hex.

### Chain Adapters

```typescript
import { EvmChain, SolanaChain } from "@wormcraft/sdk";

const eth = new EvmChain({
  chainId: 2n,
  chainName: "ethereum",
  rpcUrl: "https://ethereum.publicnode.com",
  privateKey: process.env.WORMCRAFT_EVM_PRIVATE_KEY,
});

const balance = await eth.getBalance("0xYourAddress");
const receipt = await eth.sendTransaction("0xContractAddress", "0xCalldata");
```

`EvmChain` — viem-backed adapter for EVM chains. Implements `WormcraftChain`.

`SolanaChain` — @solana/web3.js-backed adapter for Solana. Implements `WormcraftChain`.

Both implement the `WormcraftChain` interface:

```typescript
interface WormcraftChain {
  readonly chainId: bigint;
  readonly chainName: string;
  getBalance(address: string): Promise<bigint>;
  call(to: string, data: `0x${string}`): Promise<`0x${string}`>;
  sendTransaction(
    to: string,
    data: `0x${string}`,
    value?: bigint,
  ): Promise<TransactionReceipt>;
  waitForTransaction(txHash: string): Promise<TransactionReceipt>;
  getCode(address: string): Promise<`0x${string}`>;
}
```

### Cross-Chain Deployment

```typescript
import {
  deployAcrossChains,
  callAcrossChains,
  upgradeAcrossChains,
} from "@wormcraft/sdk";

// Deploy the same bytecode to multiple chains in parallel
const results = await deployAcrossChains({
  chains: [eth, polygon, arbitrum],
  bytecode: "0x...",
  salt: "0x0000000000000000000000000000000000000000000000000000000000000001",
  wormToolDeployerAddress: "0xDeployerAddress",
});

// Call a function on a deployed contract across chains
await callAcrossChains({
  chains: [eth, polygon],
  target: "0xContractAddress",
  calldata: "0x...",
  wormToolDeployerAddress: "0xDeployerAddress",
});

// Upgrade a proxy to a new implementation across chains
await upgradeAcrossChains({
  chains: [eth, polygon],
  proxy: "0xProxyAddress",
  newImpl: "0xNewImplAddress",
  wormToolDeployerAddress: "0xDeployerAddress",
});
```

### Message Status

```typescript
import { getMessageStatus, MessageStatus } from "@wormcraft/sdk";

const result = await getMessageStatus({
  emitterChain: 2,
  emitterAddress:
    "0x0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585",
  sequence: 643990n,
  network: "mainnet",
});

if (result.status === MessageStatus.Signed) {
  console.log("VAA bytes:", result.vaaBytes);
}
```

### Chain Info

```typescript
import { getChainInfo } from "@wormcraft/sdk";

const info = getChainInfo("ethereum");
// { name: 'ethereum', wormholeChainId: 2, evmChainId: 1, ... }

const info2 = getChainInfo(2); // lookup by Wormhole chain ID
```

### Test VAA Generation

```typescript
import { generateTestVaaHex } from "@wormcraft/sdk";

// Generate a synthetic VAA for testing — do NOT use on mainnet
const hex = generateTestVaaHex({
  emitterChain: 2,
  emitterAddress:
    "0x0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585",
  sequence: 1n,
  payload: "0xdeadbeef",
});
```

---

## Error Classes

All errors extend `WormcraftError` and are importable from `@wormcraft/sdk`.

| Class                    | Thrown when                                         |
| ------------------------ | --------------------------------------------------- |
| `WormcraftError`          | Base class for all wormcraft errors                 |
| `RpcError`               | An RPC call to a chain endpoint fails               |
| `ChainNotSupportedError` | A chain name or ID is not in the registry           |
| `VaaParseError`          | A VAA cannot be parsed from hex or base64           |
| `ContractCallError`      | An on-chain contract call reverts or errors         |
| `PrivateKeyError`        | `WORMCRAFT_EVM_PRIVATE_KEY` is missing or invalid   |
| `ArtifactParseError`     | A Hardhat or Foundry artifact JSON cannot be parsed |

**Example:**

```typescript
import { parseVaa, VaaParseError, RpcError } from "@wormcraft/sdk";

try {
  const vaa = parseVaa(userInput);
} catch (e) {
  if (e instanceof VaaParseError) {
    console.error("Bad VAA input:", e.message);
  }
}
```
