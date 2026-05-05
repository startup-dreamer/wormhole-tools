use clap::{Parser, Subcommand};
use wormhole_cli::commands::{
    aptos, completion, deploy, evm, generate, info, latency, near, parse, redeem, solana, status,
    submit, sui, tokens, transfer,
};
use wormhole_cli::config;

/// Wormhole cross-chain protocol CLI.
#[derive(Debug, Parser)]
#[command(name = "worm", version, about)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

/// Top-level subcommands.
#[derive(Debug, Subcommand)]
enum Commands {
    /// Parse a VAA and print its fields as JSON.
    Parse(parse::ParseArgs),
    /// Generate VAAs for devnet and testnet use.
    Generate(generate::GenerateArgs),
    /// Submit a VAA to an EVM chain.
    Submit(submit::SubmitArgs),
    /// Query chain and contract metadata.
    Info(info::InfoArgs),
    /// Deploy contracts to multiple chains via Wormhole.
    Deploy(deploy::DeployArgs),
    /// Interact with Wormhole contracts on EVM chains.
    Evm(evm::EvmArgs),
    /// Interact with Wormhole contracts on Aptos.
    Aptos(aptos::AptosArgs),
    /// Interact with Wormhole contracts on NEAR.
    Near(near::NearArgs),
    /// Interact with Wormhole contracts on Sui.
    Sui(sui::SuiArgs),
    /// Interact with Wormhole contracts on Solana.
    Solana(solana::SolanaArgs),
    /// Measure guardian signing latency for a source chain.
    Latency(latency::LatencyArgs),
    /// Query Token Bridge registered tokens on an EVM chain.
    Tokens(tokens::TokensArgs),
    /// Manually redeem a stuck Wormhole VAA on the destination chain.
    Redeem(redeem::RedeemArgs),
    /// Track a Wormhole message by source transaction hash.
    Status(status::StatusArgs),
    /// Initiate a Wormhole token bridge transfer.
    Transfer(transfer::TransferArgs),
    /// Generate shell completion scripts.
    Completion(completion::CompletionArgs),
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    config::load()?;
    match Cli::parse().command {
        Commands::Parse(args) => parse::run(&args),
        Commands::Generate(args) => generate::run(&args),
        Commands::Submit(args) => submit::run(&args).await,
        Commands::Info(args) => info::run(&args),
        Commands::Deploy(args) => deploy::run(&args).await,
        Commands::Evm(args) => evm::run(&args).await,
        Commands::Aptos(args) => aptos::run(&args).await,
        Commands::Near(args) => near::run(&args).await,
        Commands::Sui(args) => sui::run(&args).await,
        Commands::Solana(args) => solana::run(&args).await,
        Commands::Latency(args) => latency::run(&args).await,
        Commands::Tokens(args) => tokens::run(&args).await,
        Commands::Redeem(args) => redeem::run(&args).await,
        Commands::Status(args) => status::run(&args).await,
        Commands::Transfer(args) => transfer::run(&args).await,
        Commands::Completion(args) => completion::run::<Cli>(&args),
    }
}
