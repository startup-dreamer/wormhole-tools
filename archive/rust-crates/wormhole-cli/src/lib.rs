//! Wormhole CLI library.
//!
//! Exports the `config` and `output` modules so the CLI can be used as both
//! a standalone binary and a library (enabling integration tests and reuse).

pub mod commands;
pub mod config;
pub mod output;
pub mod providers;
