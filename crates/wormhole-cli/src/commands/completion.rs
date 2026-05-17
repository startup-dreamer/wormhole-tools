use clap::Args;
use clap_complete::{generate, shells};
use std::io;

/// Shell to generate completions for.
#[derive(Debug, Clone, clap::ValueEnum)]
pub enum Shell {
    Bash,
    Zsh,
    Fish,
}

/// Generate shell completion scripts for worm.
#[derive(Debug, Args)]
pub struct CompletionArgs {
    /// Target shell.
    pub shell: Shell,
}

/// Run the `worm completion` command.
///
/// Writes the shell completion script to stdout.  Pipe to a file or source
/// directly, e.g. `worm completion bash >> ~/.bashrc`.
///
/// # Errors
///
/// Returns an error if writing to stdout fails.
pub fn run<C: clap::CommandFactory>(args: &CompletionArgs) -> anyhow::Result<()> {
    let mut cmd = C::command();
    let name = cmd.get_name().to_string();
    match args.shell {
        Shell::Bash => generate(shells::Bash, &mut cmd, &name, &mut io::stdout()),
        Shell::Zsh => generate(shells::Zsh, &mut cmd, &name, &mut io::stdout()),
        Shell::Fish => generate(shells::Fish, &mut cmd, &name, &mut io::stdout()),
    }
    Ok(())
}
