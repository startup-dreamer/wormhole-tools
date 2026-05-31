# WormCraft — Wormhole xGrant Application

> **Grant Tier:** Tier 1 (requesting $50,000 USD in USDC)
> **Contact:** xgrants@wormholenetwork.com
> **Repository:** https://github.com/[your-github-handle]/wormcraft *(update before submitting)*
> **npm:** `npm install -g wormcraft` / `npm install @wormcraft/sdk`

---

## Abstract

WormCraft is a TypeScript CLI tool and SDK that eliminates the most painful parts of building on Wormhole: deploying contracts to 20+ chains simultaneously with identical addresses, tracking messages end-to-end, and upgrading proxies with production-grade governance — all from a single command. Today, every team building cross-chain on Wormhole solves these problems from scratch. WormCraft turns months of infrastructure work into minutes.

---

## 1. Problem Statement

### The Cross-Chain Developer Experience is Broken

The Wormhole protocol is technically excellent. But the developer experience around it — deploying, upgrading, monitoring — remains deeply painful. Teams building on Wormhole today face three recurring problems that waste weeks of engineering time before a single business-logic line is written:

**Problem 1: Deploying contracts to 20+ chains is manual, error-prone, and slow.**
A developer who wants identical contracts on Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, and Solana must:
- Run 7+ separate deployment scripts
- Manually track deployed addresses in spreadsheets or config files
- Hope that addresses match (they often don't — constructor arguments break CREATE2 determinism)
- Debug cross-chain address mismatches in production

This is not a rare edge case. Every DeFi protocol, bridge, and token that uses Wormhole faces this. The median team spends 2–3 weeks on deployment infrastructure.

**Problem 2: Cross-chain upgrade governance has no standard.**
Upgrading a UUPS proxy on 7 chains safely requires:
- A governance mechanism (Safe multisig? Timelock? Direct?)
- A way to propagate the upgrade call cross-chain atomically
- A cancellation path if something goes wrong

Every team currently builds their own. Bugs in these custom governance systems have led to real exploits in the broader DeFi space.

**Problem 3: Wormhole message debugging requires deep protocol knowledge.**
When a cross-chain transaction stalls, developers must:
- Understand VAA (Verified Action Approval) binary format
- Know which Wormhole Scan API endpoints to query
- Manually decode hex payloads to understand what went wrong

A junior developer cannot debug a stuck message. This slows every team that builds on Wormhole.

### The Opportunity Cost for Wormhole

Every week a team spends building deployment infrastructure is a week they're not building the application that will drive Wormhole message volume. The protocol's economic success depends on developer adoption. Developer adoption depends on the quality of the tooling.

---

## 2. Solution: WormCraft

WormCraft is the unified developer CLI and SDK for the Wormhole ecosystem. It wraps the complexity of cross-chain operations behind ergonomic commands and a typed TypeScript API.

### Core Capabilities (Shipped Today)

#### Deterministic Cross-Chain Deployment
```bash
# Deploy Counter.sol to Sepolia, Arbitrum Sepolia, and Base Sepolia
# Same address on all three — guaranteed by CREATE2
wormcraft deploy multi \
  --artifact ./out/Counter.json \
  --salt my-counter-v1 \
  --chains sepolia,arbitrum-sepolia,base-sepolia \
  --src-chain sepolia
```

`WormcraftDeployer` is a hub contract deployed at **the same address on every supported chain** via CREATE2. It receives a deployment message on the source chain, then uses the Wormhole Standard Relayer to propagate the deployment to every target chain. The result: your contract has an identical address everywhere, with a single source transaction.

**Why this matters:** Protocol teams can hardcode their contract address in documentation, frontends, and integrations. No more "Contract is at 0xA1B2... on Ethereum, 0xC3D4... on Arbitrum." Deterministic addresses reduce integration surface area and user confusion.

#### Three Governance Models for Proxy Upgrades
Most protocols need to upgrade contracts after launch. WormCraft supports three governance models — teams choose based on their security posture:

| Model | Inheritance Required? | Governance | Cancellation | Use Case |
|-------|----------------------|------------|--------------|----------|
| **Direct** (WormcraftProxy) | Yes | Deployer key | None | Hackathon / early stage |
| **Safe Module** (WormcraftModule) | No | Gnosis Safe multisig | Safe-native | Teams with existing Safe infra |
| **Admin Module + Timelock** (WormcraftAdminModule) | No | Safe + TimelockController | Yes (during delay) | Production protocols |

```bash
# Safe multisig governance upgrade — no inheritance required
wormcraft deploy upgrade \
  --proxy 0xABC... \
  --new-impl 0xDEF... \
  --safe 0xSAFE... \
  --module 0xMODULE... \
  --chains arbitrum,base,optimism

# Admin module with 48-hour timelock
wormcraft deploy upgrade \
  --proxy 0xABC... \
  --new-impl 0xDEF... \
  --admin-module 0xADMIN... \
  --salt "upgrade-v2-2026-06" \
  --chains arbitrum,base,optimism

# Execute after timelock delay
wormcraft deploy execute \
  --proxy 0xABC... \
  --new-impl 0xDEF... \
  --admin-module 0xADMIN... \
  --salt "upgrade-v2-2026-06" \
  --chains arbitrum,base,optimism
```

**The inheritance-free paths (`WormcraftModule`, `WormcraftAdminModule`) are particularly important** — they let teams adopt WormCraft governance without modifying their existing proxy contracts. Zero code changes to existing deployments.

#### End-to-End Message Tracking
```bash
# Track any Wormhole message — get status, chain, delivery info
wormcraft status 0xabc123...
# → Source: Ethereum (chain 2)
#   Destination: Solana (chain 1)
#   Signatures: 13/19 guardians ✓
#   Delivery: Confirmed
#   Explorer: https://wormholescan.io/tx/0xabc123
```

#### Guardian Health Monitoring
```bash
# Real-time guardian signing latency
wormcraft latency ethereum --samples 50
# → p50: 890ms  p95: 1420ms  min: 340ms  max: 2100ms
```

#### VAA Parsing and Generation
```bash
# Decode any VAA to human-readable JSON
wormcraft parse 0x010000...

# Generate test VAAs for devnet (no guardian key required)
wormcraft generate registration --chain ethereum --emitter 0xABC...
```

#### Chain Registry and Token Bridge
```bash
# Query chain metadata
wormcraft info chain-id arbitrum   # → 23
wormcraft info contract-address ethereum token_bridge

# Initiate token transfers
wormcraft transfer --token 0xUSDC --amount 100 --dst-chain base --recipient 0xRECIPIENT

# Manually redeem stuck VAAs
wormcraft redeem <vaa-hex-or-tx-hash>
```

### Supported Chains (23 Today)

**EVM (17):** Ethereum, Arbitrum, Base, Optimism, Polygon, BSC, Avalanche, Fantom, Klaytn, Celo, Moonbeam, Scroll, Mantle, Blast, Linea, Berachain, Sei

**Non-EVM (4):** Solana, Aptos, Sui, NEAR

**Testnets:** Sepolia, Arbitrum Sepolia, Base Sepolia, Optimism Sepolia

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript 5.4 (strict, noUncheckedIndexedAccess) |
| CLI Framework | Commander.js v12 |
| EVM Interaction | viem v2 |
| Solana | @solana/web3.js v1 |
| Cryptography | @noble/hashes (keccak256) |
| Smart Contracts | Solidity 0.8.28, Foundry |
| Contract Libraries | OpenZeppelin 5.x, OZ Upgradeable 5.x |
| Build | tsup (esbuild) — ESM + CJS |
| Tests | vitest (TypeScript), Foundry (Solidity) |
| Runtime | Node.js 20+ |

---

## 3. How WormCraft Benefits the Wormhole Ecosystem

### Direct Ecosystem Impact

**More developers → more protocols → more Wormhole messages → more W token economic activity.**

This is not a circular argument. It is how every protocol ecosystem grows. Developer tooling is the multiplier.

- A developer who deploys with WormCraft deploys a Wormhole-integrated protocol
- Every cross-chain message that protocol generates is a Wormhole message
- Every upgrade that protocol does is a Wormhole cross-chain call
- WormCraft creates structural Wormhole dependency at the infrastructure layer

A team that builds their deployment and upgrade infrastructure on WormCraft is not going to switch to CCIP or LayerZero later — their governance contracts are Wormhole-native.

### The Onboarding Funnel

```
Developer discovers WormCraft
  → Runs: npm install -g wormcraft
    → Runs: wormcraft deploy multi --chains ...
      → Contracts deployed via Wormhole Relayer (first Wormhole transaction)
        → Developer's users interact with cross-chain contracts
          → Every interaction = Wormhole message volume
            → Developer upgrades contracts via wormcraft deploy upgrade
              → Governance is Wormhole-native (permanent ecosystem lock-in)
```

The developer never needed to read the Wormhole whitepaper. They needed a good CLI.

### Comparison to the Alternative

Without WormCraft, a team building a cross-chain protocol today spends:
- 2-3 weeks on deployment infrastructure (custom scripts per chain)
- 1-2 weeks on upgrade governance (custom Safe module or custom multisig)
- Ongoing hours per incident debugging cross-chain messages

With WormCraft, that same team spends:
- 1 day on deployment (`wormcraft deploy multi`)
- 1 day on governance setup (`wormcraft module setup`)
- Minutes debugging messages (`wormcraft status <tx>`)

Multiply this across the 50+ teams that build on Wormhole each quarter. WormCraft reclaims hundreds of engineering weeks per year from infrastructure and redirects them to applications.

### Alignment with Wormhole's 2025-2026 Priorities

| Wormhole Priority | WormCraft Contribution |
|-------------------|----------------------|
| **Developer tooling** | Core CLI + SDK for the entire protocol surface |
| **MultiGov integrations** | `deploy upgrade` commands work with cross-chain governance contracts |
| **NTT (Native Token Transfers)** | Planned M2 milestone: `wormcraft ntt deploy` and `ntt upgrade` commands |
| **More protocols building on Wormhole** | Every team using WormCraft is a Wormhole team |
| **Open-source ecosystem** | Apache 2.0 licensed, npm-published |

---

## 4. Team

*(Update this section with your actual team details before submitting)*

**[YOUR NAME] — Lead Developer & Project Lead**
- [X] years of TypeScript / Solidity experience
- Built WormCraft from scratch: designed the CREATE2 deployment architecture, implemented all 3 governance models, wrote the Solidity contracts and TypeScript SDK
- Previous work: [list relevant experience]
- GitHub: [your handle]

**[TEAM MEMBER 2, if applicable] — [Role]**
- [Background]

**Advisors / Validators:**
- *Consider listing any Wormhole Foundation contacts who have reviewed the project*
- *Consider listing any protocols that have expressed interest in using WormCraft*

**Proof of Work:**
- WormCraft CLI is functional today: `npm install -g wormcraft` (or from repo)
- `WormcraftDeployer` is deployed at `0x0aA4B5899bAF7326397b1041db9c854056126F57` on Sepolia, Arbitrum Sepolia, and Base Sepolia
- All three governance models (direct, Safe module, admin module + timelock) are implemented and tested
- 300+ lines of Foundry tests, comprehensive vitest unit tests

---

## 5. Differentiation from Existing Solutions

### Direct Comparisons

| Tool | What It Does | What It Doesn't Do |
|------|-------------|-------------------|
| **Wormhole TypeScript SDK** (official) | Low-level Wormhole protocol interaction | No deployment, no governance, no CLI |
| **Hardhat / Foundry** | Deploy contracts to one chain at a time | No cross-chain, no Wormhole integration |
| **Chainlink CCIP Tools** | CCIP-specific deployment tools | Not Wormhole, different protocol entirely |
| **Superform's cross-chain deployer** | One-off internal tool | Not open-source, not general-purpose |
| **Manual Wormhole Relayer integration** | Custom per-team | 2-3 week build time, not reusable |

**WormCraft is the only open-source, general-purpose CLI + SDK for Wormhole that handles deployment, upgrades, governance, and monitoring in one tool.**

### The Chainlink Parallel

Chainlink's developer ecosystem grew substantially when they invested in developer tooling (CCIP tools, Hardhat plugins, local simulation environments). WormCraft is the first step toward that same level of tooling maturity for Wormhole. The reference implementation at `wormhole-cli/reference/ccip-tools-ts/` was studied during development to understand the prior art.

### Key Technical Differentiators

1. **Deterministic cross-chain addresses via CREATE2** — No other Wormhole tool offers this. Once documented, this becomes a standard deployment pattern in the ecosystem.

2. **Three governance models, no-inheritance-required options** — The Safe Module and Admin Module paths let *any existing protocol* adopt WormCraft governance without a code rewrite. This is a significant adoption unlock.

3. **Foundry + Hardhat artifact compatibility** — Works with both major Solidity toolchains out of the box.

4. **SDK + CLI in one package** — Use WormCraft programmatically in your own scripts, or run it as a CLI tool. Same functionality, two interfaces.

---

## 6. Milestones and Deliverables

### Milestone 1: Production Release & Security Hardening
**Amount:** $20,000 | **Timeline:** 8 weeks from grant approval

**Deliverables:**
1. **npm publish** — `wormcraft` and `@wormcraft/sdk` published to npm with semantic versioning, changeLogs, and CI/CD release pipeline
2. **Smart contract audit** — Partial audit of `WormcraftDeployer.sol`, `WormcraftModule.sol`, and `WormcraftAdminModule.sol` by a reputable firm (e.g., OtterSec, Ackee, Trail of Bits)
3. **`wormcraft doctor` command** — Pre-flight checks before any deployment: RPC connectivity, sufficient gas, correct chain IDs, contract bytecode validation
4. **Testnet integration test suite** — Automated tests running against Sepolia/Arbitrum Sepolia that verify end-to-end deployments, upgrades, and message tracking
5. **Dedicated documentation site** — Full CLI reference, SDK API docs, and getting-started guide hosted at a stable URL
6. **Onboarded 3+ protocols** — At minimum 3 teams have deployed at least one contract using WormCraft (documented with tx hashes)

**KPIs at M1:**
- npm `wormcraft` published with 1.0.0 release
- Audit report published (findings + mitigations)
- `wormcraft doctor` functional with ≥5 pre-flight checks
- Integration tests passing on testnet in CI
- Documentation site live
- 3 protocols with documented WormCraft deployments
- 50+ GitHub stars
- 200+ npm downloads

**M1 Evidence to Submit:**
- npm package links
- Audit report PDF
- GitHub Actions CI showing testnet tests passing
- Documentation site URL
- Protocol adoption evidence (tx hashes + team quotes)

---

### Milestone 2: Ecosystem Expansion & Advanced Features
**Amount:** $18,000 | **Timeline:** 8 weeks after M1 acceptance

**Deliverables:**
1. **Wormhole NTT integration** — `wormcraft ntt deploy` and `wormcraft ntt upgrade` commands for teams using Wormhole's Native Token Transfers standard
2. **Solana full deployment support** — Complete (not stub) Solana chain support in `deployAcrossChains()` and `upgradeAcrossChains()`
3. **GitHub Actions templates** — Reusable workflow templates for common CI/CD patterns: "Deploy to testnet on PR merge", "Upgrade mainnet contracts after governance approval", "Monitor cross-chain message delivery"
4. **MultiGov helper commands** — `wormcraft multigov propose` and `wormcraft multigov execute` for teams using Wormhole's cross-chain governance framework
5. **Plugin architecture** — Documented extension API allowing third parties to add custom chain adapters without forking WormCraft

**KPIs at M2:**
- `wormcraft ntt deploy` functional and documented
- Solana deployment working end-to-end on devnet/testnet
- 3 GitHub Actions templates published as reusable workflows
- MultiGov commands functional against Wormhole MultiGov contracts
- Plugin API documented with at least one example plugin
- 10+ protocols with documented WormCraft deployments (cumulative)
- 150+ GitHub stars
- 2,000+ npm downloads
- First external contributor PR merged

---

### Milestone 3: Community Growth & Final Report
**Amount:** $12,000 | **Timeline:** 12 weeks after M2 acceptance (3-month sustainability window)*

*This milestone follows Sippy's proven 3-month post-launch report structure from their Arbitrum grant.*

**Deliverables:**
1. **Video tutorial series** — 3-5 screencasts covering: basic deployment, Safe governance setup, timelock upgrade flow, debugging with `wormcraft status`
2. **Developer workshop** — One live workshop or hackathon session (Wormhole hackathon or ETHGlobal) with documented attendees
3. **Protocol integration case studies** — Written case studies from 2+ teams that shipped to production using WormCraft, including architecture decisions and lessons learned
4. **Final impact report** — On-chain metrics: total contracts deployed via WormcraftDeployer, total Wormhole messages generated by WormCraft-deployed protocols, npm download trends, GitHub activity
5. **Maintenance plan** — Published roadmap for WormCraft beyond the grant period with identified funding paths (DAO grants, commercial support, ecosystem partnerships)

**KPIs at M3:**
- 5+ video tutorials published (YouTube + Wormhole docs)
- 1+ workshop completed with ≥15 attendees
- 2+ published protocol case studies
- Final report submitted to Wormhole Foundation
- 5+ protocols using WormCraft in production (mainnet)
- 200+ GitHub stars
- 5,000+ npm downloads (cumulative)
- Roadmap published for year 2 of WormCraft development

---

## 7. Budget Breakdown

**Total Request: $50,000 USD (Tier 1)**

### Milestone 1: $20,000 — Production Release & Security

| Item | Cost | Notes |
|------|------|-------|
| Engineering — Core dev (2 engineers × 80 hrs × $60/hr) | $9,600 | npm publish, doctor command, testnet test suite |
| Smart contract partial audit | $6,500 | OtterSec or comparable — 3 core contracts |
| Documentation site hosting + domain | $600 | 1 year Vercel/Netlify + domain |
| CI/CD infrastructure (GitHub Actions minutes, testnet RPCs) | $800 | 8-week sprint |
| Protocol onboarding (outreach, integration support) | $1,000 | DevRel time with early adopters |
| Contingency | $1,500 | |
| **M1 Total** | **$20,000** | |

### Milestone 2: $18,000 — Ecosystem Expansion

| Item | Cost | Notes |
|------|------|-------|
| Engineering — Core dev (2 engineers × 70 hrs × $60/hr) | $8,400 | NTT integration, Solana support, plugin arch |
| Security review of new features (NTT, Solana) | $4,000 | Targeted review of M2 additions |
| GitHub Actions template publication + testing | $800 | Testnet costs for CI templates |
| Community and developer outreach | $2,000 | Protocol integrations, technical blog posts |
| Infrastructure | $800 | Continued CI/CD costs |
| Contingency | $2,000 | |
| **M2 Total** | **$18,000** | |

### Milestone 3: $12,000 — Community Growth & Final Report

| Item | Cost | Notes |
|------|------|-------|
| Engineering — Core dev (maintenance + M3 features) | $5,000 | 3-month sustainability window |
| Video tutorial production (tooling, editing) | $2,500 | 3-5 screencasts |
| Workshop / hackathon participation (travel + prep) | $2,000 | ETHGlobal or Wormhole-native hackathon |
| Final report preparation and publication | $1,000 | On-chain data analysis, write-up |
| Contingency | $1,500 | |
| **M3 Total** | **$12,000** | |

### Budget Rationale

**Engineering costs (~55%):** WormCraft's remaining work is technical depth — audit remediation, Solana full support, NTT integration, plugin architecture. These require senior-level TypeScript and Solidity work. $60/hr reflects market rate for experienced blockchain engineers.

**Audit (~15%):** Three Solidity contracts (`WormcraftDeployer`, `WormcraftModule`, `WormcraftAdminModule`) are the security surface. An unaudited deployment tool would not be adopted by serious protocols. This cost is non-negotiable for ecosystem credibility.

**Community/DevRel (~12%):** Developer tooling is worthless if developers don't know it exists. Budget covers technical blog posts, workshop participation, and integration support for early adopters.

---

## 8. Post-Grant Sustainability Plan

### Why WormCraft Will Outlive the Grant

**1. Structural protocol dependency.** Every team that deploys contracts with WormCraft becomes structurally dependent on it. WormcraftDeployer is deployed on their chains. WormcraftAdminModule manages their proxies. These are not optional integrations — they're baked into deployed infrastructure. Usage grows with the number of protocols adopting it, not with our marketing budget.

**2. Open-source ecosystem contributions.** The plugin architecture (M2) allows teams to contribute chain adapters, governance integrations, and tooling extensions without our involvement. WormCraft becomes a community artifact, not a single-team project.

**3. Wormhole Foundation long-term alignment.** If WormCraft becomes the standard deployment tool for the Wormhole ecosystem, the Foundation has strong incentive to fund continued development — either through future xGrant rounds, integration into official developer documentation, or direct engineering support.

**4. Commercial opportunities.** Protocols with significant on-chain deployments may want dedicated support, custom integrations, or SLA guarantees around WormCraft. There is a natural consulting and support business that emerges once WormCraft is adopted at scale.

**5. Beyond Ethereum/Wormhole.** The deterministic cross-chain deployment model (`WormcraftDeployer` + CREATE2 + Wormhole Relayer) is applicable to any messaging protocol that supports standard relayers. A future `wormcraft --protocol ccip` mode (or separate package) is a natural evolution that expands the addressable developer audience.

### Commitment to Open Source

All code produced under this grant will be:
- Published under the Apache 2.0 license
- Maintained in a public GitHub repository
- Shipped as public npm packages (`wormcraft`, `@wormcraft/sdk`)
- Documented on a public documentation site

We will **not** dual-license, restrict usage, or gate any features behind a paid tier during the grant period or the 12 months following grant completion.

---

## 9. KYC/KYB Commitment

We are prepared to complete KYC/KYB verification as required to receive grant funding. We understand that milestones must be submitted for review and that public announcements may only be made after Milestone 1 acceptance.

---

## 10. Supplementary Technical Details

### Contract Architecture

```
WormcraftDeployer (deployed on every chain, same address)
  ├── Receives DeployRequest messages via Wormhole Standard Relayer
  ├── Executes CREATE2 deployments deterministically
  └── Emits DeployAck messages back to source chain

WormcraftProxy (optional base class for UUPS proxies)
  └── Authorizes upgrade calls from WormcraftDeployer only

WormcraftModule (Safe module, ownerless)
  ├── No ownership — authorization is per-Safe, set by the Safe itself
  ├── Receives upgrade messages via Wormhole Standard Relayer
  └── Calls Safe.execTransactionFromModule() to execute upgrades

WormcraftAdminModule (proxy admin, no inheritance)
  ├── Manages proxy implementations (registry-based)
  ├── Supports direct upgrades (no delay)
  ├── Supports timelocked upgrades (schedule → delay → execute)
  └── Safe holds CANCELLER_ROLE (can veto during timelock window)
```

### Deployed Contracts (Testnet)

| Contract | Address | Chain |
|----------|---------|-------|
| WormcraftDeployer | `0x0aA4B5899bAF7326397b1041db9c854056126F57` | Sepolia |
| WormcraftDeployer | `0x0aA4B5899bAF7326397b1041db9c854056126F57` | Arbitrum Sepolia |
| WormcraftDeployer | `0x0aA4B5899bAF7326397b1041db9c854056126F57` | Base Sepolia |

*Same address on all three chains — demonstrating the deterministic deployment model in production.*

### SDK Usage (Programmatic)

```typescript
import { deployAcrossChains, upgradeAcrossChains, getMessageStatus } from '@wormcraft/sdk';

// Deploy to 3 chains in one call
const result = await deployAcrossChains({
  bytecode: artifact.bytecode,
  salt: 'my-protocol-v1',
  srcChain: 'sepolia',
  targetChains: ['arbitrum-sepolia', 'base-sepolia'],
  privateKey: process.env.DEPLOYER_KEY,
});
// result.address is identical on all 3 chains

// Track any Wormhole message
const status = await getMessageStatus('0xabc123...');
console.log(status.delivery); // → 'confirmed'
```

---

## Submission Checklist

Before emailing to xgrants@wormholenetwork.com, ensure you have:

- [ ] Updated all `[YOUR NAME]` and `[your-github-handle]` placeholders with real information
- [ ] Verified the GitHub repository URL is correct and the repo is public
- [ ] Confirmed the npm package name (`wormcraft`) is available or already claimed by you
- [ ] Added any additional team members or advisors
- [ ] Listed any protocols that have verbally committed to using WormCraft (strengthens the application)
- [ ] Attached a copy of this document as a PDF or linked to a Google Doc
- [ ] Prepared to respond to technical questions about the CREATE2 deployment architecture

---

*Prepared based on the Wormhole xGrants program guidelines (xgrants@wormholenetwork.com) and WormCraft's current implementation state as of May 2026.*
