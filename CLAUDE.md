# Wormhole CLI — Claude Code Rules

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
Rust CLI tool for interacting with the Wormhole cross-chain protocol.
Reference implementation: `reference/ccip-tools-ts` (TypeScript, study structure only)
Wormhole protocol reference: `reference/wormhole/clients/js/src/`

## Stack
- Language: Rust (stable)
- CLI framework: clap v4 (with derive macros)
- Async runtime: tokio
- HTTP/RPC: ethers-rs (EVM), solana-client (Solana)
- VAA parsing: custom (see src/vaa/)
- Config: dotenvy, loading from ~/.wormhole/.env
- Shell completion: clap_complete
- UI: Next.js 16.2.3 (App Router) + TypeScript, Tailwind CSS v4, Framer Motion, Lucide icons

## Architecture Rules
- Commands go in src/commands/ — one file per command group
- Chain-specific logic goes in src/chains/ — one module per chain family
- VAA encoding/decoding is isolated in src/vaa/
- No business logic in main.rs — it is entrypoint only
- Errors use thiserror crate, propagated with anyhow in CLI layer

## Code Rules
- All public functions must have doc comments
- No unwrap() in non-test code — use ? or explicit error handling
- Private keys never logged, never in error messages
- Build this project modularly, with each component having a clear purpose and interface.
- Build the cli in the pattern where it can be used as a library and as a standalone executable.
- Tests go in the same file as the code they test (Rust convention)
- Integration tests go in tests/

## Reference Usage
- Study ccip-tools-ts for: command structure, multi-RPC patterns, chain module separation
- Study reference/wormhole/clients/js/src/cmds/ for: exact VAA logic to port
- Do not copy TypeScript code verbatim — translate the logic to idiomatic Rust

## Git
- Branch naming: feat/command-name, fix/issue-description
- Commits: conventional commits format (feat:, fix:, chore:, docs:)
- Never commit .env files or private keys
