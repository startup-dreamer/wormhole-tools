use clap::{Args, Subcommand};
use wormhole_sdk::info;

use crate::output;

/// Query Wormhole chain and contract metadata.
#[derive(Debug, Args)]
pub struct InfoArgs {
    #[command(subcommand)]
    pub subcommand: InfoCommand,
}

/// Info subcommands.
#[derive(Debug, Subcommand)]
pub enum InfoCommand {
    /// Print the Wormhole chain ID for a named chain.
    ChainId(ChainIdArgs),
    /// Print the contract address for a module on a chain.
    ContractAddress(ContractAddressArgs),
    /// Print the 32-byte emitter address for a native chain address.
    EmitterAddress(EmitterAddressArgs),
}

/// Arguments for `worm info chain-id`.
#[derive(Debug, Args)]
pub struct ChainIdArgs {
    /// Chain name (e.g. ethereum, solana, bsc).
    pub chain: String,
}

/// Arguments for `worm info contract-address`.
#[derive(Debug, Args)]
pub struct ContractAddressArgs {
    /// Network: devnet, testnet, or mainnet.
    pub network: String,
    /// Chain name (e.g. ethereum, solana).
    pub chain: String,
    /// Module: core, token_bridge, or nft_bridge.
    pub module: String,
}

/// Arguments for `worm info emitter-address`.
#[derive(Debug, Args)]
pub struct EmitterAddressArgs {
    /// Chain name (e.g. ethereum, solana).
    pub chain: String,
    /// Native address on that chain.
    pub address: String,
}

/// Run the `worm info` command.
///
/// # Errors
///
/// Returns an error if the requested chain, contract, or address is unknown.
pub fn run(args: &InfoArgs) -> anyhow::Result<()> {
    match &args.subcommand {
        InfoCommand::ChainId(a) => {
            let id =
                info::chain_id(&a.chain).map_err(|e| anyhow::anyhow!("chain-id failed: {e}"))?;
            output::print_json(&id)
        }
        InfoCommand::ContractAddress(a) => {
            let addr = info::contract_address(&a.network, &a.chain, &a.module)
                .map_err(|e| anyhow::anyhow!("contract-address failed: {e}"))?;
            output::print_json(&addr)
        }
        InfoCommand::EmitterAddress(a) => {
            let addr = info::emitter_address(&a.chain, &a.address)
                .map_err(|e| anyhow::anyhow!("emitter-address failed: {e}"))?;
            output::print_json(&addr)
        }
    }
}
