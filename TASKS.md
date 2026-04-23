# Wormhole CLI — Task Backlog

## How to use this file
Each task has an ID, status, and description.
When starting a task, tell Claude: "Work on task WH-001"
Update status manually as you go: TODO → IN_PROGRESS → DONE

---

## Status: TODO

---

## Status: IN_PROGRESS

---

## Status: DONE

### WH-018: Wallet provider pattern ✓
Implemented wormhole-cli/src/providers/{mod,evm,solana}.rs
- WalletProvider trait: address() + sign_tx(tx) → signed bytes
- EvmWallet: hex key → k256 SigningKey; derive address via keccak256(pubkey_uncompressed[1..])[12..]; sign_tx via sign_prehash_recoverable
- SolanaWallet: base58 64-byte keypair → public key (last 32 bytes) as address; sign_tx stub → Err
- load_wallet(chain, key): "solana" → SolanaWallet; known EVM chain → EvmWallet; unknown → error
- EVM_PRIVATE_KEY / SOLANA_PRIVATE_KEY env fallback; --private-key arg takes precedence
- worm transfer: added --private-key arg; uses EvmWallet.address() as from when key is provided
- bs58 = "0.5" added to workspace deps
5 unit tests (address derivation from key=1, invalid hex, missing EVM key, missing Solana key, unknown chain), 0 warnings ✓

### WH-017: `WormholeChain` trait ✓
Implemented wormhole-sdk/src/chain.rs + wired into lib.rs
- WormholeChain async_trait: chain_id(), node_info(), guardian_set_index(), submit_vaa()
- EvmChain struct: id, rpc, contract; delegates to chains/evm free functions
- chain_from_rpc() factory: looks up chain_id via info::chain_id, constructs EvmChain
- async-trait = "0.1" added to workspace deps + wormhole-sdk direct deps
- anyhow added as direct dep to wormhole-sdk
3 unit tests (trait object construction, chain_id return, unknown chain error), 0 warnings ✓

### WH-016: Solana chain module ✓
Implemented wormhole-sdk/src/chains/solana.rs + wormhole-cli/src/commands/solana.rs
- node_info(): getHealth + getSlot JSON-RPC; SolanaNodeInfo { slot, health }
- read_guardian_set(): getAccountInfo + decode u32 LE at offset 8 (after Anchor discriminator)
- read_sequence(): getAccountInfo + decode u64 LE at offset 0
- No solana-client dep; raw reqwest (same pattern as near.rs); base64 decode for account data
- `worm solana node-info / guardian-set / sequence` CLI subcommands
- pub mod solana in chains/mod.rs
4 unit tests (node_info struct, guardian_set_index offset math ×2, sequence LE), 0 warnings ✓

### WH-015: `worm latency` ✓
Implemented wormhole-sdk/src/latency.rs + wormhole-cli/src/commands/latency.rs
- fetch_recent_vaas(): GET /api/v1/vaas/{chainId}?pageSize={count}; uses indexedAt as quorum proxy
- VaaTiming: sequence, block_time, signed_time, latency_secs
- compute_percentiles(): sort + index (div_ceil) for p50/p95/min/max; returns None for empty
- `worm latency <chain> [--count N] [--network mainnet|testnet]`; --count 0 → non-zero exit
4 unit tests (URL ×2, percentile calc, API deserialization), 0 warnings ✓

### WH-014: `worm tokens` ✓
Implemented wormhole-sdk/src/tokens.rs + wormhole-cli/src/commands/tokens.rs
- wrapped_asset(): ABI-encodes wrappedAsset(uint16,bytes32) → eth_call → 0x address
- is_wrapped_asset(): ABI-encodes isWrappedAsset(address) → eth_call → bool
- fn_selector(): keccak256 4-byte selector (same pattern as WH-010)
- `worm tokens wrapped --origin-chain <c> --token <addr> --chain <c> --rpc <url>`
- `worm tokens is-wrapped --token <addr> --chain <c> --rpc <url>`
- --contract overrides default; --chain looks up via info::contract_address
5 unit tests (selectors ×2, ABI encoding, bool decode ×2), 0 warnings ✓

### WH-013: `worm redeem` ✓
Implemented wormhole-sdk/src/status.rs (fetch_vaa_bytes, vaa_api_url) + wormhole-cli/src/commands/redeem.rs
- is_tx_hash(): detects 0x-prefixed 64-hex-char strings as tx hashes
- Tx-hash path: fetch_vaa_bytes() → resolve via fetch_vaa_status → GET /api/v1/vaas/{chain}/{addr}/{seq}
- VAA-bytes path: decode_vaa_bytes() → submit directly (same as worm submit)
- `worm redeem <input> --rpc <url> [--contract <addr>] [--from <addr>] [--network mainnet|testnet]`
3 unit tests (tx-hash detection ×2, URL format), 0 warnings ✓

### WH-012: `worm status` ✓
Implemented wormhole-sdk/src/status.rs + wormhole-cli/src/commands/status.rs
- fetch_vaa_status(tx_hash, network) → GET Wormhole Scan API with 3-retry / 1 s delay on 404
- VaaStatus: emitter_chain, emitter_address, sequence, signed, signatures, delivered, destination_tx
- api_url() helper builds mainnet / testnet URL; Network reused from chains::Network
- `worm status <tx-hash> [--network mainnet|testnet]` CLI command
4 unit tests (URL construction ×2, parse valid, parse error), 0 warnings ✓

### WH-011: Shell completion ✓
Implemented crates/wormhole-cli/src/commands/completion.rs
- clap_complete generates bash/zsh/fish scripts from the Cli CommandFactory
- `worm completion bash|zsh|fish` command writes script to stdout
- Smoke-tested: `worm completion bash` produces valid bash function
- clap_complete = "4" already in Cargo.toml
0 new tests (clap_complete handles generation), 0 warnings ✓

### WH-010: Token transfer ✓
Implemented wormhole-sdk/src/transfer.rs
- TransferParams struct + initiate_transfer() via eth_sendTransaction
- build_transfer_calldata: ABI-encodes transferTokens(address,uint256,uint16,bytes32,uint256,uint32)
- Returns tx hash; selector verified against keccak256
- `worm transfer --token --amount --dst-chain --recipient` CLI command
6 unit tests (calldata encoding, error cases), 0 warnings ✓

### WH-009: Sui chain module ✓
Implemented wormhole-sdk/src/chains/sui.rs
- node_info(rpc) → sui_getLatestCheckpointSequenceNumber JSON-RPC (connectivity check)
- deploy_package / get_object → WormholeError::Unsupported (tx signing not yet implemented)
- NodeInfo struct: latest_checkpoint
- `worm sui node-info / deploy-package` CLI subcommands
4 unit tests, 0 warnings ✓

### WH-008: NEAR chain module ✓
Implemented wormhole-sdk/src/chains/near.rs
- node_status(rpc) → JSON-RPC `status` call (connectivity check)
- contract_update / deploy → WormholeError::Unsupported (ed25519 signing not yet implemented)
- NodeStatus struct: chain_id, rpc_addr, protocol_version
- `worm near node-status / contract-update / deploy` CLI subcommands
4 unit tests, 0 warnings ✓

### WH-007: Aptos chain module ✓
Implemented wormhole-sdk/src/chains/aptos.rs
- ledger_info(rpc) → GET /v1/ Aptos REST API (connectivity check)
- init_wormhole / init_token_bridge → WormholeError::Unsupported (ed25519 signing not yet implemented)
- LedgerInfo struct: chain_id, epoch, ledger_version
- `worm aptos ledger-info / init-wormhole / init-token-bridge` CLI subcommands
4 unit tests, 0 warnings ✓

### WH-006: EVM chain module ✓
Extended wormhole-sdk/src/chains/evm.rs
- read_guardian_set_index(rpc, core) → getCurrentGuardianSetIndex() via eth_call
- read_chain_id(rpc, contract) → chainId() via eth_call
- decode_u32_result: right-aligned 32-byte ABI word → u32
- `worm evm init-wormhole / init-token-bridge` CLI subcommands
10 unit tests total in evm.rs, 0 warnings ✓

### WH-005: worm info queries ✓
Implemented wormhole-sdk/src/info.rs
- chain_id(name) → Wormhole chain ID from 53-entry lookup table (official SDK consts)
- contract_address(network, chain, module) → address from static contract table
- emitter_address(chain, addr) → 32-byte zero-padded hex (EVM: left-pad 20→32 bytes)
- `worm info chain-id / contract-address / emitter-address` CLI subcommands
7 unit tests, 0 warnings ✓

### WH-004: worm submit ✓
Implemented VAA submission to EVM chains in wormhole-sdk/src/chains/
- submit_vaa via eth_sendTransaction (devnet unlocked accounts)
- ABI encoding: selector(4) + offset(32) + length(32) + padded data
- Module detection from first 32 bytes of payload
- Network enum with FromStr trait
- `worm submit <vaa>` CLI command, supports --rpc, --contract-address, --from, --evm-key
7 unit tests, 0 warnings ✓

### WH-003: VAA generation ✓
Implemented wormhole-sdk/src/generate.rs
- generate_registration, generate_upgrade, generate_attestation
- k256 secp256k1 signing, double-keccak256 digest
- `worm generate registration/upgrade/attestation` CLI subcommands
- Round-trip tested through worm parse
9 unit tests, 0 warnings ✓

### WH-002: VAA parsing ✓
Implemented VAA decode in wormhole-sdk/src/vaa/
- Parses hex (0x-prefixed or bare) and base64 (standard + URL-safe) encoded VAAs
- Deserializes all fields: version, guardian_set_index, signatures, timestamp, nonce,
  emitterChain, emitterAddress, sequence, consistencyLevel, payload
- Computes double-keccak256 digest of body bytes
- Returns structured VaaData type (serde Serialize)
- `worm parse <vaa>` CLI command → prints JSON to stdout
9 unit tests, 0 warnings ✓

### WH-001: Workspace scaffold
Set up Cargo workspace with wormhole-sdk and wormhole-cli crates.
- Cargo.toml workspace manifest
- crates/wormhole-sdk/src/lib.rs (empty public API)
- crates/wormhole-cli/src/main.rs (clap entrypoint, no logic)
- crates/wormhole-cli/src/output.rs (stdout/stderr routing)
- crates/wormhole-cli/src/config.rs (load ~/.wormhole/.env)
- crates/wormhole-sdk/src/error.rs (WormholeError with thiserror)
- crates/wormhole-cli/src/lib.rs (lib target for library+binary pattern)
Acceptance: `cargo build --all` passes with zero warnings ✓

