# WH-001 Architecture Document

## Overview

Exact module layout, public API surface, boundary rules, and sequenced task list for the WH-001 Workspace Scaffold. No runtime functionality is introduced. The sole acceptance criterion is `cargo build --all` passing with zero warnings.

---

## Crate Placement

```
wormhole-cli/                         ← workspace root
├── Cargo.toml                        ← workspace manifest (already correct)
├── crates/
│   ├── wormhole-sdk/
│   │   └── src/
│   │       ├── lib.rs                ← MODIFIED: remove add(), declare modules, re-export
│   │       └── error.rs              ← NEW: WormholeError enum (thiserror)
│   └── wormhole-cli/
│       └── src/
│           ├── main.rs               ← MODIFIED: tokio::main, clap Cli, calls config::load()
│           ├── config.rs             ← NEW: load() -> anyhow::Result<()> via dotenvy
│           └── output.rs             ← NEW: print_json<T>, print_error
```

---

## Public API Surface

### `crates/wormhole-sdk/src/error.rs`

```rust
use thiserror::Error;

/// All errors produced by the wormhole-sdk crate.
#[derive(Debug, Error)]
pub enum WormholeError {
    /// Placeholder variant — used until a real variant is needed.
    #[error("not implemented: {0}")]
    NotImplemented(&'static str),
}
```

No other variants for WH-001. The `&'static str` payload allows callers to name the unimplemented feature without heap allocation.

### `crates/wormhole-sdk/src/lib.rs`

```rust
pub mod error;

pub use error::WormholeError;
```

The `add()` function and its `#[cfg(test)]` block are removed entirely. No other modules are declared (chains, vaa, etc. are out of scope for WH-001).

### `crates/wormhole-cli/src/config.rs`

```rust
/// Load environment variables from `~/.wormhole/.env`.
///
/// A missing `.env` file is silently ignored. Present-but-malformed files
/// produce an error.
///
/// # Examples
///
/// ```no_run
/// config::load().expect("env load failed");
/// ```
pub fn load() -> anyhow::Result<()>
```

Use `dotenvy::dotenv().ok()` — `.ok()` discards the `NotPresent` variant so an absent `.env` is not an error. Returns `Ok(())` unconditionally for WH-001. No key validation.

### `crates/wormhole-cli/src/output.rs`

```rust
use serde::Serialize;

/// Write `value` serialized as pretty-printed JSON to **stdout**.
///
/// This is the only authorised path for data output in the CLI.
///
/// # Examples
///
/// ```no_run
/// output::print_json(&my_struct)?;
/// ```
pub fn print_json<T: Serialize>(value: &T) -> anyhow::Result<()>

/// Write a human-readable error message to **stderr**.
///
/// Use this for diagnostics, not for data. Does not terminate the process.
///
/// # Examples
///
/// ```no_run
/// output::print_error("something went wrong");
/// ```
pub fn print_error(msg: &str)
```

`print_json` serialises with `serde_json::to_string_pretty` and writes via `println!` to stdout. `print_error` uses `eprintln!`. Neither function touches the other stream.

### `crates/wormhole-cli/src/main.rs`

```rust
use clap::{Parser, Subcommand};

mod config;
mod output;

/// Wormhole cross-chain protocol CLI.
#[derive(Debug, Parser)]
#[command(name = "worm", version, about)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

/// Top-level subcommands.
///
/// Empty for WH-001; subcommand variants are added in subsequent tasks.
#[derive(Debug, Subcommand)]
pub enum Commands {}

#[tokio::main]
async fn main() -> anyhow::Result<()>
```

`main()` body: (1) call `config::load()?`, (2) parse `Cli::parse()`, (3) match on `cli.command` — the empty enum requires no match arms.

---

## Boundary Enforcement

| Crate | Forbidden | Required |
|---|---|---|
| `wormhole-sdk` | `clap`, `dotenvy`, `anyhow`, `process::exit`, `println!` | `thiserror` on all errors; no `unwrap()`/`expect()` outside tests |
| `wormhole-cli` | `println!` for data (use `output::print_json`); `thiserror`; clap types leaked into SDK | `anyhow::Result` on `main`; all data to stdout via `output.rs` |

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  wormhole-cli/src/main.rs                                       │
│                                                                 │
│  #[tokio::main]                                                 │
│  async fn main() -> anyhow::Result<()>                          │
│         │                                                       │
│         ├──► config::load()                                     │
│         │         │                                             │
│         │         └──► dotenvy::dotenv().ok()                   │
│         │                   │                                   │
│         │          .env present? ──yes──► loads vars into env   │
│         │          .env absent?  ──────► silently ignored       │
│         │                   │                                   │
│         │         returns Ok(())                                │
│         │                                                       │
│         ├──► Cli::parse()   (clap parses argv)                  │
│         │                                                       │
│         └──► match cli.command { }  (empty enum, no arms)       │
│                                                                 │
│  On error: anyhow chain propagates to runtime → stderr          │
└─────────────────────────────────────────────────────────────────┘

stdout (data)                    stderr (diagnostics)
─────────────                    ────────────────────
output::print_json()  ──────►  [stdout fd 1]
output::print_error() ──────────────────────────►  [stderr fd 2]
anyhow error chain    ──────────────────────────►  [stderr fd 2]

wormhole-sdk boundary (never crosses into CLI territory):
┌─────────────────────────────────┐
│ wormhole-sdk                    │
│  lib.rs  ──► error.rs           │
│               WormholeError     │
│               └─ NotImplemented │
│                                 │
│  NO: clap / dotenvy / println!  │
└─────────────────────────────────┘
```

---

## Sequenced Task List

Tasks are ordered so each step compiles independently before the next begins. Verify with `cargo build --all` after each.

### Task 1 — Create `crates/wormhole-sdk/src/error.rs`

New file. `WormholeError` enum with `NotImplemented(&'static str)` variant, `#[derive(Debug, thiserror::Error)]`. Nothing else.

Verify: `cargo build -p wormhole-sdk`

### Task 2 — Rewrite `crates/wormhole-sdk/src/lib.rs`

Remove `add()` and its test. Add `pub mod error;` and `pub use error::WormholeError;`. Add `//!` crate-level doc comment.

Verify: `cargo build -p wormhole-sdk` — zero warnings.

### Task 3 — Create `crates/wormhole-cli/src/config.rs`

`pub fn load() -> anyhow::Result<()>` using `dotenvy::dotenv().ok()`. Unit test asserting `load()` returns `Ok(())` when no `.env` is present.

Verify: `cargo build -p wormhole-cli`

### Task 4 — Create `crates/wormhole-cli/src/output.rs`

`print_json<T: Serialize>` and `print_error`. Unit test for `print_json` using a trivial `#[derive(Serialize)]` struct asserting it returns `Ok(())`.

Note: add `serde = { workspace = true }` to `crates/wormhole-cli/Cargo.toml` so `use serde::Serialize` is an explicit dependency (pre-approved).

Verify: `cargo build -p wormhole-cli`

### Task 5 — Rewrite `crates/wormhole-cli/src/main.rs`

Replace entire file. Declare `mod config; mod output;`. Define `Cli` (clap `Parser`) and `Commands` (empty `Subcommand` enum). `#[tokio::main] async fn main()` calls `config::load()?`, parses `Cli::parse()`, matches on empty `Commands`.

Verify: `cargo build --all` — zero warnings.

### Task 6 — Quality gate

```bash
cargo fmt --all
cargo clippy --all-targets -- -D warnings
cargo test --all
```

All three must exit 0. No `#[allow]` suppressions.

---

## Deliverable Checklist

1. `wormhole-sdk/src/error.rs` exists — `WormholeError` with `NotImplemented` variant, `thiserror::Error` derive
2. `wormhole-sdk/src/lib.rs` — no `add()`, declares `pub mod error`, re-exports `WormholeError`
3. `wormhole-cli/src/config.rs` — `pub fn load() -> anyhow::Result<()>`, uses dotenvy
4. `wormhole-cli/src/output.rs` — `print_json<T: Serialize>` → stdout, `print_error` → stderr
5. `wormhole-cli/src/main.rs` — `#[tokio::main]`, `Cli`/`Commands`, calls `config::load()`
6. `cargo build --all` — zero warnings
7. `cargo clippy --all-targets -- -D warnings` — exits 0
8. `cargo test --all` — exits 0
9. No `unwrap()`/`expect()` in non-test code
10. No `println!` in `wormhole-sdk`
11. No clap types visible in `wormhole-sdk`
