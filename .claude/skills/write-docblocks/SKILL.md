---
name: write-docblocks
description: Write Rust doc comments (/// and //!) for public functions, structs, enums, and modules. Use when doc coverage is low or when asked to document new public APIs in wormhole-sdk or wormhole-cli.
---

# Writing Rust Doc Comments

Write `///` and `//!` documentation for public items in this Rust workspace. Good doc comments help both humans and `cargo doc` generate useful API documentation.

## When to Use

- After adding new public items to `wormhole-sdk` (the library crate)
- When `cargo doc --no-deps 2>&1 | grep "missing documentation"` shows gaps
- When asked to document a batch of public items

## Rust Doc Comment Conventions

### Item-level (`///`)

Use `///` for functions, structs, enums, traits, and their fields/variants:

```rust
/// Parses a raw VAA byte buffer and returns a decoded [`Vaa`].
///
/// # Errors
///
/// Returns [`VaaError::InvalidHeader`] if the buffer is too short.
/// Returns [`VaaError::InvalidSignature`] if guardian signatures fail verification.
///
/// # Examples
///
/// ```rust
/// let raw = hex::decode("01000000...")?;
/// let vaa = parse_vaa(&raw)?;
/// assert_eq!(vaa.emitter_chain, Chain::Solana);
/// ```
pub fn parse_vaa(data: &[u8]) -> Result<Vaa, VaaError> {
```

### Module-level (`//!`)

Use `//!` at the top of `lib.rs` or `mod.rs` to describe the module:

```rust
//! VAA (Verified Action Approval) encoding and decoding.
//!
//! A VAA is a signed message produced by Wormhole guardians attesting to
//! an event on a source chain. This module handles binary serialization,
//! deserialization, and signature verification.
```

## Required Sections

| Section | When Required |
|---------|--------------|
| One-line summary | Always — first line, imperative mood ("Parse a VAA", not "Parses") |
| `# Errors` | Any function returning `Result` |
| `# Panics` | Any function that may `panic!` |
| `# Examples` | Public functions with non-obvious usage |
| `# Safety` | Any `unsafe fn` |

## Style Rules

- First line: imperative mood, no trailing period ("Returns the chain ID", not "This function returns the chain ID.")
- Blank line between summary and sections
- Use `[`Type`]` for intra-doc links to other items in the crate
- Keep examples compilable — they run as doctests with `cargo test`
- Don't restate the type signature in prose

## Process

1. Run `cargo doc --no-deps 2>&1 | grep warning` to find missing docs
2. Read the function/struct to understand its purpose and contract
3. Write the summary line first
4. Add `# Errors` section if it returns `Result`
5. Add `# Examples` for public SDK functions
6. Verify with `cargo test --doc` that examples compile
