//! Static chain registry mapping names to Wormhole metadata.
//!
//! All entries are compile-time constants — no file I/O or config loading.
//! `worm_deployer` addresses are placeholders until Bootstrap.s.sol has been
//! run on each chain and the resulting addresses committed here.

/// Metadata for one supported chain.
pub struct ChainEntry {
    /// Human-readable chain name used on the CLI (e.g. "sepolia").
    pub name: &'static str,
    /// Wormhole chain ID.
    pub wormhole_id: u16,
    /// EVM chain ID (used for EIP-155 signing).
    pub evm_chain_id: u64,
    /// Default public RPC URL for this chain.
    pub default_rpc: &'static str,
    /// WormDeployer proxy address on this chain (zero address until bootstrapped).
    pub worm_deployer: &'static str,
    /// Wormhole Standard Relayer address on this chain (for gas quoting).
    pub wormhole_relayer: &'static str,
}

const CHAINS: &[ChainEntry] = &[
    ChainEntry {
        name: "sepolia",
        wormhole_id: 10002,
        evm_chain_id: 11155111,
        default_rpc: "https://rpc.sepolia.org",
        worm_deployer: "0x0000000000000000000000000000000000000000",
        wormhole_relayer: "0x7B1bD7a6b4E61c2a123AC6BC2cbfC614437D0470",
    },
    ChainEntry {
        name: "base-sepolia",
        wormhole_id: 10004,
        evm_chain_id: 84532,
        default_rpc: "https://sepolia.base.org",
        worm_deployer: "0x0000000000000000000000000000000000000000",
        wormhole_relayer: "0x93BAD53DDfB6132b0aC8E37f6029163E17396f70",
    },
    ChainEntry {
        name: "op-sepolia",
        wormhole_id: 10005,
        evm_chain_id: 11155420,
        default_rpc: "https://sepolia.optimism.io",
        worm_deployer: "0x0000000000000000000000000000000000000000",
        wormhole_relayer: "0x93BAD53DDfB6132b0aC8E37f6029163E17396f70",
    },
    ChainEntry {
        name: "arb-sepolia",
        wormhole_id: 10003,
        evm_chain_id: 421614,
        default_rpc: "https://sepolia-rollup.arbitrum.io/rpc",
        worm_deployer: "0x0000000000000000000000000000000000000000",
        wormhole_relayer: "0x7B1bD7a6b4E61c2a123AC6BC2cbfC614437D0470",
    },
    ChainEntry {
        name: "celo-alfajores",
        wormhole_id: 14,
        evm_chain_id: 44787,
        default_rpc: "https://alfajores-forno.celo-testnet.org",
        worm_deployer: "0x0000000000000000000000000000000000000000",
        wormhole_relayer: "0x306B68267Deb7c5DfCDa3619E22E9Ca39C374f84",
    },
    ChainEntry {
        name: "avax-fuji",
        wormhole_id: 6,
        evm_chain_id: 43113,
        default_rpc: "https://api.avax-test.network/ext/bc/C/rpc",
        worm_deployer: "0x0000000000000000000000000000000000000000",
        wormhole_relayer: "0xA3cF45939bD6260bcFe3D66bc73d60f19e49a8BB",
    },
    ChainEntry {
        name: "bsc-testnet",
        wormhole_id: 4,
        evm_chain_id: 97,
        default_rpc: "https://data-seed-prebsc-1-s1.binance.org:8545",
        worm_deployer: "0x0000000000000000000000000000000000000000",
        wormhole_relayer: "0x80aC94316391752A193C1c47E27D382b507c93F3",
    },
];

/// Static registry of supported testnet chains.
pub struct ChainRegistry;

impl ChainRegistry {
    /// Look up a chain entry by name. Returns `None` for unknown chains.
    pub fn get(name: &str) -> Option<&'static ChainEntry> {
        CHAINS.iter().find(|c| c.name == name)
    }

    /// List all supported chain names.
    pub fn names() -> Vec<&'static str> {
        CHAINS.iter().map(|c| c.name).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_sepolia_returns_correct_wormhole_id() {
        assert_eq!(ChainRegistry::get("sepolia").unwrap().wormhole_id, 10002);
    }

    #[test]
    fn unknown_chain_returns_none() {
        assert!(ChainRegistry::get("mainnet").is_none());
    }

    #[test]
    fn names_lists_all_seven_chains() {
        assert_eq!(ChainRegistry::names().len(), 7);
    }
}
