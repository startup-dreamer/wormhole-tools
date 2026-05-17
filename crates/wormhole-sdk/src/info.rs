//! Chain metadata queries: chain IDs, contract addresses, emitter addresses.

use crate::WormholeError;

/// Wormhole chain ID for a named chain.
///
/// Returns the Wormhole protocol chain ID (u16) for the given lowercase chain
/// name, or an error if the name is not recognised.
pub fn chain_id(name: &str) -> Result<u16, WormholeError> {
    CHAIN_IDS
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(_, id)| *id)
        .ok_or_else(|| WormholeError::Unsupported(format!("unknown chain: {name}")))
}

/// Devnet/testnet/mainnet contract address for a module on a chain.
///
/// `module` is one of `"core"`, `"token_bridge"`, or `"nft_bridge"`.
/// Returns the address string, or an error if the combination is unknown.
pub fn contract_address(network: &str, chain: &str, module: &str) -> Result<String, WormholeError> {
    CONTRACTS
        .iter()
        .find(|(n, c, m, _)| *n == network && *c == chain && *m == module)
        .map(|(_, _, _, addr)| addr.to_string())
        .ok_or_else(|| {
            WormholeError::Unsupported(format!("no {module} contract for {chain} on {network}"))
        })
}

/// Look up the chain name for a Wormhole chain ID.
///
/// Returns the lowercase chain name (e.g. `"ethereum"`, `"solana"`) or `None`
/// if the chain ID is not in the registry.
pub fn chain_name(id: u16) -> Option<&'static str> {
    CHAIN_IDS
        .iter()
        .find(|(_, cid)| *cid == id)
        .map(|(name, _)| *name)
}

/// Convert a 32-byte Wormhole emitter address to the chain-native display format.
///
/// | Chain family              | Output format                              |
/// |---------------------------|--------------------------------------------|
/// | EVM (20-byte addresses)   | `0x` + 40 lowercase hex chars (last 20 B)  |
/// | Solana / Pythnet          | Base58-encoded 32 bytes                    |
/// | Sui / Aptos               | `0x` + 64 lowercase hex chars              |
/// | All others / unknown      | Raw 64 lowercase hex chars (unchanged)     |
///
/// Falls back to the raw input string on any decode error.
pub fn native_address(chain_id: u16, wormhole_hex: &str) -> String {
    let hex = wormhole_hex.trim_start_matches("0x").to_lowercase();

    let bytes = match hex::decode(&hex) {
        Ok(b) if b.len() == 32 => b,
        _ => return wormhole_hex.to_string(),
    };

    if is_evm_chain_id(chain_id) {
        return format!("0x{}", hex::encode(&bytes[12..]));
    }

    match chain_id {
        1 | 26 => bs58::encode(&bytes).into_string(), // Solana, Pythnet
        21 | 22 => format!("0x{}", hex::encode(&bytes)), // Sui, Aptos
        _ => hex,
    }
}

/// Returns `true` if the given Wormhole chain ID belongs to an EVM-compatible chain.
pub fn is_evm_chain_id(id: u16) -> bool {
    CHAIN_IDS
        .iter()
        .find(|(_, cid)| *cid == id)
        .map(|(name, _)| EVM_CHAINS.contains(name))
        .unwrap_or(false)
}

/// Convert a native chain address to a 32-byte zero-padded hex emitter address.
///
/// EVM addresses are 20 bytes; they are zero-padded on the left.
/// Other addresses must already be 32-byte hex strings (64 hex chars).
pub fn emitter_address(chain: &str, address: &str) -> Result<String, WormholeError> {
    let addr = address.trim_start_matches("0x").to_lowercase();

    let is_evm = EVM_CHAINS.contains(&chain);

    if is_evm && addr.len() == 40 {
        // 20-byte EVM address → left-pad to 32 bytes (lowercase, Wormhole convention)
        return Ok(format!("0x{:0>64}", addr));
    }

    if addr.len() == 64 {
        return Ok(format!("0x{addr}"));
    }

    Err(WormholeError::InvalidEncoding(format!(
        "address has unexpected length {} for chain {chain}",
        addr.len()
    )))
}

// ---------------------------------------------------------------------------
// Static data tables
// ---------------------------------------------------------------------------

/// Wormhole chain IDs sourced from the official SDK.
/// <https://github.com/wormhole-foundation/wormhole/blob/main/sdk/js/src/utils/consts.ts>
const CHAIN_IDS: &[(&str, u16)] = &[
    ("unset", 0),
    ("solana", 1),
    ("ethereum", 2),
    ("terra", 3),
    ("bsc", 4),
    ("polygon", 5),
    ("avalanche", 6),
    ("oasis", 7),
    ("algorand", 8),
    ("aurora", 9),
    ("fantom", 10),
    ("karura", 11),
    ("acala", 12),
    ("klaytn", 13),
    ("celo", 14),
    ("near", 15),
    ("moonbeam", 16),
    ("neon", 17),
    ("terra2", 18),
    ("injective", 19),
    ("osmosis", 20),
    ("sui", 21),
    ("aptos", 22),
    ("arbitrum", 23),
    ("optimism", 24),
    ("gnosis", 25),
    ("pythnet", 26),
    ("xpla", 28),
    ("btc", 29),
    ("base", 30),
    ("sei", 32),
    ("rootstock", 33),
    ("scroll", 34),
    ("mantle", 35),
    ("blast", 36),
    ("xlayer", 37),
    ("linea", 38),
    ("berachain", 39),
    ("seievm", 40),
    ("snaxchain", 43),
    ("wormchain", 3104),
    ("cosmoshub", 4000),
    ("evmos", 4001),
    ("kujira", 4002),
    ("neutron", 4003),
    ("celestia", 4004),
    ("stargaze", 4005),
    ("seda", 4006),
    ("dymension", 4007),
    ("provenance", 4008),
    ("sepolia", 10002),
    ("arbitrum_sepolia", 10003),
    ("base_sepolia", 10004),
    ("optimism_sepolia", 10005),
    ("holesky", 10006),
    ("polygon_sepolia", 10007),
];

/// EVM-platform chains (20-byte addresses).
const EVM_CHAINS: &[&str] = &[
    "ethereum",
    "bsc",
    "polygon",
    "avalanche",
    "oasis",
    "aurora",
    "fantom",
    "karura",
    "acala",
    "klaytn",
    "celo",
    "moonbeam",
    "neon",
    "arbitrum",
    "optimism",
    "gnosis",
    "base",
    "rootstock",
    "scroll",
    "mantle",
    "blast",
    "xlayer",
    "linea",
    "berachain",
    "seievm",
    "snaxchain",
    "sepolia",
    "arbitrum_sepolia",
    "base_sepolia",
    "optimism_sepolia",
    "holesky",
    "polygon_sepolia",
];

/// (network, chain, module, address) contract table.
/// Covers devnet EVM core + token bridge and a representative set of mainnet/testnet entries.
const CONTRACTS: &[(&str, &str, &str, &str)] = &[
    // devnet
    (
        "devnet",
        "ethereum",
        "core",
        "0xC89Ce4735882C9F0f0FE26686c53074E09B0D550",
    ),
    (
        "devnet",
        "ethereum",
        "token_bridge",
        "0x0290FB167208Af455bB137780163b7B7a9a10C16",
    ),
    (
        "devnet",
        "ethereum",
        "nft_bridge",
        "0x26b4afb60d6c903165150c6f0aa14f8016be4aec",
    ),
    // mainnet ethereum
    (
        "mainnet",
        "ethereum",
        "core",
        "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B",
    ),
    (
        "mainnet",
        "ethereum",
        "token_bridge",
        "0x3ee18B2214AFF97000D974cf647E7C347E8fa585",
    ),
    (
        "mainnet",
        "ethereum",
        "nft_bridge",
        "0x6FFd7EdE62328b3Af38FCD61461Bbfc52F5651fE",
    ),
    // mainnet solana
    (
        "mainnet",
        "solana",
        "core",
        "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth",
    ),
    (
        "mainnet",
        "solana",
        "token_bridge",
        "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb",
    ),
    // testnet ethereum (sepolia)
    (
        "testnet",
        "sepolia",
        "core",
        "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78",
    ),
    (
        "testnet",
        "sepolia",
        "token_bridge",
        "0xDB5492265f6038831E89f495670FF909aDe94bd9",
    ),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_chain_ids_are_correct() {
        assert_eq!(chain_id("ethereum").unwrap(), 2);
        assert_eq!(chain_id("solana").unwrap(), 1);
        assert_eq!(chain_id("bsc").unwrap(), 4);
        assert_eq!(chain_id("sui").unwrap(), 21);
        assert_eq!(chain_id("aptos").unwrap(), 22);
    }

    #[test]
    fn unknown_chain_returns_error() {
        assert!(chain_id("notachain").is_err());
    }

    #[test]
    fn contract_address_devnet_core() {
        let addr = contract_address("devnet", "ethereum", "core").unwrap();
        assert_eq!(addr, "0xC89Ce4735882C9F0f0FE26686c53074E09B0D550");
    }

    #[test]
    fn contract_address_unknown_returns_error() {
        assert!(contract_address("devnet", "solana", "core").is_err());
    }

    #[test]
    fn emitter_address_evm_pads_to_32_bytes() {
        let addr =
            emitter_address("ethereum", "0x3ee18B2214AFF97000D974cf647E7C347E8fa585").unwrap();
        assert_eq!(addr.len(), 2 + 64); // "0x" + 64 hex chars
        assert!(
            addr.starts_with("0x0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585")
        );
    }

    #[test]
    fn native_address_evm_strips_padding() {
        // Ethereum token bridge: 32-byte padded → 20-byte EVM address
        let wh = "0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585";
        let native = native_address(2, wh); // chain 2 = Ethereum
        assert_eq!(native, "0x3ee18b2214aff97000d974cf647e7c347e8fa585");
    }

    #[test]
    fn native_address_solana_is_base58() {
        // 32 zero bytes → base58 "11111111111111111111111111111111" (System Program)
        let wh = "0000000000000000000000000000000000000000000000000000000000000000";
        let native = native_address(1, wh); // chain 1 = Solana
        assert_eq!(native, "11111111111111111111111111111111");
    }

    #[test]
    fn native_address_sui_has_0x_prefix() {
        let wh = "0000000000000000000000000000000000000000000000000000000000000005";
        let native = native_address(21, wh); // chain 21 = Sui
        assert_eq!(native, format!("0x{wh}"));
    }

    #[test]
    fn native_address_unknown_chain_returns_raw_hex() {
        let wh = "0000000000000000000000000000000000000000000000000000000000000001";
        let native = native_address(9999, wh);
        assert_eq!(native, wh);
    }

    #[test]
    fn emitter_address_32_byte_passthrough() {
        let hex = "0000000000000000000000000000000000000000000000000000000000000001";
        let addr = emitter_address("solana", hex).unwrap();
        assert_eq!(addr, format!("0x{hex}"));
    }

    #[test]
    fn emitter_address_invalid_length_returns_error() {
        assert!(emitter_address("ethereum", "0xdeadbeef").is_err());
    }
}
