use thiserror::Error;

/// All errors produced by the wormhole-sdk crate.
#[derive(Debug, Error)]
pub enum WormholeError {
    /// The input string is not valid hex or base64.
    #[error("invalid encoding: {0}")]
    InvalidEncoding(String),

    /// The byte buffer was too short to read the next field.
    #[error("buffer too short: needed {needed} bytes at offset {offset}, only {remaining} remain")]
    BufferTooShort {
        offset: usize,
        needed: usize,
        remaining: usize,
    },

    /// The VAA envelope begins with an unrecognised version byte.
    #[error("unsupported VAA version: {0}")]
    UnsupportedVersion(u8),

    /// A cursor read would exceed the buffer bounds.
    #[error("read overrun at offset {offset}: needed {needed}, only {remaining} remain")]
    Overread {
        offset: usize,
        needed: usize,
        remaining: usize,
    },

    /// ECDSA signing failed.
    #[error("signing failed: {0}")]
    Signing(String),

    /// A network or RPC call failed.
    #[error("network error: {0}")]
    Network(String),

    /// The requested operation is not supported in this context.
    #[error("unsupported: {0}")]
    Unsupported(String),
}
