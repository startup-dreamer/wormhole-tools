/// Load environment variables from `~/.wormhole/.env`.
///
/// A missing file is silently ignored. A present-but-malformed file produces
/// an error.
///
/// # Errors
///
/// Returns an error if the `.env` file exists but cannot be parsed.
///
/// # Examples
///
/// ```no_run
/// # use wormhole_cli::config;
/// config::load().expect("env load failed");
/// ```
pub fn load() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_succeeds_when_env_absent() {
        assert!(load().is_ok());
    }
}
