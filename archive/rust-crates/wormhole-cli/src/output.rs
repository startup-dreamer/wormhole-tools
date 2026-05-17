use serde::Serialize;

/// Write `value` as pretty-printed JSON to **stdout**.
///
/// This is the only authorised path for structured data output in the CLI.
/// Do not use `println!` directly in command handlers.
///
/// # Errors
///
/// Returns an error if serialization fails.
///
/// # Examples
///
/// ```no_run
/// # use wormhole_cli::output;
/// # use serde::Serialize;
/// # #[derive(Serialize)]
/// # struct Point { x: f64 }
/// # let my_struct = Point { x: 1.0 };
/// output::print_json(&my_struct)?;
/// # Ok::<(), anyhow::Error>(())
/// ```
pub fn print_json<T: Serialize>(value: &T) -> anyhow::Result<()> {
    let json = serde_json::to_string_pretty(value)?;
    println!("{json}");
    Ok(())
}

/// Write a human-readable diagnostic message to **stderr**.
///
/// Use for errors and warnings — not for data. Does not terminate the process.
///
/// # Examples
///
/// ```no_run
/// # use wormhole_cli::output;
/// output::print_error("connection timed out");
/// ```
pub fn print_error(msg: &str) {
    eprintln!("{msg}");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Serialize;

    #[derive(Serialize)]
    struct Sample {
        ok: bool,
    }

    #[test]
    fn print_json_returns_ok_for_valid_value() {
        assert!(print_json(&Sample { ok: true }).is_ok());
    }
}
