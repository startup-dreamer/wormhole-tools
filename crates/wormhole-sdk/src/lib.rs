//! Wormhole cross-chain protocol SDK.
//!
//! Provides core types, error definitions, VAA parsing, and chain interaction
//! primitives used by the `wormhole-cli` binary and any downstream crates.

pub mod chain;
pub mod chains;
pub mod deploy;
pub mod error;
pub mod generate;
pub mod info;
pub mod latency;
pub mod status;
pub mod tokens;
pub mod transfer;
pub mod vaa;

pub use error::WormholeError;
