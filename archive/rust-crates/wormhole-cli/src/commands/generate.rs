use clap::{Args, Subcommand};
use wormhole_sdk::generate::{self, AttestationParams, Module, RegistrationParams, UpgradeParams};

use crate::output;

/// Generate VAAs for devnet and testnet use.
#[derive(Debug, Args)]
pub struct GenerateArgs {
    /// Guardian private key(s), comma-separated hex strings.
    #[arg(short = 'g', long)]
    pub guardian_secret: String,

    #[command(subcommand)]
    pub subcommand: GenerateSubcommand,
}

/// `worm generate` subcommands.
#[derive(Debug, Subcommand)]
pub enum GenerateSubcommand {
    /// Generate a chain registration VAA.
    Registration(RegistrationArgs),
    /// Generate a contract upgrade VAA.
    Upgrade(UpgradeArgs),
    /// Generate a token attestation VAA.
    Attestation(AttestationArgs),
}

/// Arguments for `worm generate registration`.
#[derive(Debug, Args)]
pub struct RegistrationArgs {
    /// Module to register (Core, TokenBridge, NFTBridge, WormholeRelayer).
    #[arg(short = 'm', long)]
    pub module: String,
    /// Wormhole chain ID of the chain being registered.
    #[arg(short = 'c', long)]
    pub chain_id: u16,
    /// Contract address to register (hex).
    #[arg(short = 'a', long)]
    pub contract_address: String,
}

/// Arguments for `worm generate upgrade`.
#[derive(Debug, Args)]
pub struct UpgradeArgs {
    /// Module to upgrade (Core, TokenBridge, NFTBridge, WormholeRelayer).
    #[arg(short = 'm', long)]
    pub module: String,
    /// Wormhole chain ID of the target chain.
    #[arg(short = 'c', long)]
    pub chain_id: u16,
    /// New contract address (hex).
    #[arg(short = 'a', long)]
    pub contract_address: String,
}

/// Arguments for `worm generate attestation`.
#[derive(Debug, Args)]
pub struct AttestationArgs {
    /// Wormhole chain ID of the emitter.
    #[arg(short = 'e', long)]
    pub emitter_chain: u16,
    /// Emitter address (hex).
    #[arg(short = 'f', long)]
    pub emitter_address: String,
    /// Token's Wormhole chain ID.
    #[arg(short = 'c', long)]
    pub chain: u16,
    /// Token contract address (hex).
    #[arg(short = 'a', long)]
    pub token_address: String,
    /// Token decimals.
    #[arg(short = 'd', long)]
    pub decimals: u8,
    /// Token symbol.
    #[arg(short = 's', long)]
    pub symbol: String,
    /// Token name.
    #[arg(short = 'n', long)]
    pub name: String,
}

/// Run the `worm generate` command.
///
/// Delegates to the appropriate generator and prints the resulting hex VAA to
/// stdout as a JSON string.
///
/// # Errors
///
/// Returns an error if VAA generation fails.
pub fn run(args: &GenerateArgs) -> anyhow::Result<()> {
    let hex = match &args.subcommand {
        GenerateSubcommand::Registration(a) => {
            let module = parse_module(&a.module)?;
            generate::generate_registration(RegistrationParams {
                module,
                chain_id: a.chain_id,
                contract_address: a.contract_address.clone(),
                guardian_secrets: args.guardian_secret.clone(),
            })
            .map_err(|e| anyhow::anyhow!("generate registration failed: {e}"))?
        }
        GenerateSubcommand::Upgrade(a) => {
            let module = parse_module(&a.module)?;
            generate::generate_upgrade(UpgradeParams {
                module,
                chain_id: a.chain_id,
                new_address: a.contract_address.clone(),
                guardian_secrets: args.guardian_secret.clone(),
            })
            .map_err(|e| anyhow::anyhow!("generate upgrade failed: {e}"))?
        }
        GenerateSubcommand::Attestation(a) => generate::generate_attestation(AttestationParams {
            emitter_chain: a.emitter_chain,
            emitter_address: a.emitter_address.clone(),
            token_chain: a.chain,
            token_address: a.token_address.clone(),
            decimals: a.decimals,
            symbol: a.symbol.clone(),
            name: a.name.clone(),
            guardian_secrets: args.guardian_secret.clone(),
        })
        .map_err(|e| anyhow::anyhow!("generate attestation failed: {e}"))?,
    };
    output::print_json(&hex)
}

/// Parse a module name string into the SDK [`Module`] enum.
fn parse_module(s: &str) -> anyhow::Result<Module> {
    match s {
        "Core" => Ok(Module::Core),
        "TokenBridge" => Ok(Module::TokenBridge),
        "NFTBridge" => Ok(Module::NftBridge),
        "WormholeRelayer" => Ok(Module::WormholeRelayer),
        other => Err(anyhow::anyhow!(
            "unknown module '{other}'; expected Core, TokenBridge, NFTBridge, or WormholeRelayer"
        )),
    }
}
