use clap::Args;
use wormhole_sdk::vaa;

use crate::output;

/// Parse a VAA and print its fields as JSON.
#[derive(Debug, Args)]
pub struct ParseArgs {
    /// Hex (with or without 0x prefix) or base64-encoded VAA.
    pub vaa: String,
}

/// Run the `worm parse` command.
///
/// # Errors
///
/// Returns an error if the VAA cannot be decoded or printed.
pub fn run(args: &ParseArgs) -> anyhow::Result<()> {
    let vaa_data =
        vaa::parse(&args.vaa).map_err(|e| anyhow::anyhow!("failed to parse VAA: {e}"))?;
    output::print_json(&vaa_data)
}
