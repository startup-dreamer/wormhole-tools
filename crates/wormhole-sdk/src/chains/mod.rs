pub mod aptos;
pub mod evm;
pub mod near;
pub mod solana;
pub mod sui;

/// Wormhole network environment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Network {
    Devnet,
    Testnet,
    Mainnet,
}

impl std::str::FromStr for Network {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "devnet" => Ok(Network::Devnet),
            "testnet" => Ok(Network::Testnet),
            "mainnet" => Ok(Network::Mainnet),
            other => Err(format!("unknown network: {other}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_from_str_roundtrip() {
        assert_eq!("devnet".parse::<Network>().ok(), Some(Network::Devnet));
        assert_eq!("testnet".parse::<Network>().ok(), Some(Network::Testnet));
        assert_eq!("mainnet".parse::<Network>().ok(), Some(Network::Mainnet));
        assert!("unknown".parse::<Network>().is_err());
    }
}
