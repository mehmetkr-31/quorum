<div align="center">

# 🏛️ Quorum

### Community-Governed AI Training Dataset DAO

*The community builds it. The community votes on it. The community earns from it.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with TanStack](https://img.shields.io/badge/Built%20with-TanStack%20Start-FF4154)](https://tanstack.com/start)
[![Aptos](https://img.shields.io/badge/Blockchain-Aptos-2DD8A3)](https://aptos.dev)
[![Shelby Protocol](https://img.shields.io/badge/Storage-Shelby%20Protocol-FF6B35)](https://shelbynet.com)

</div>

---

## The Problem

AI training data is controlled by a handful of companies. The people who actually produce the world's knowledge — writers, researchers, developers, domain experts — have no say in how their collective intelligence is used to train models, and no share in the value it creates.

Existing dataset platforms (HuggingFace, Kaggle) are centralized repositories. There is no governance, no quality enforcement with economic consequences, and no revenue sharing. You contribute, someone else profits.

---

## The Solution

**Quorum** is a DAO where communities collaboratively build, curate, and govern AI training datasets. Every contribution is stored on Shelby Protocol. Every vote is recorded on Aptos. When the dataset generates revenue, every contributor earns — proportional to their approved contributions.

Wikipedia built the world's largest knowledge base with volunteers. Quorum builds the world's highest-quality AI training datasets — and actually pays the people who make it.

```
Anyone contributes data (text, image, audio, structured)
        ↓
Contribution stored on Shelby Protocol (hot storage)
        ↓
DAO members vote on quality (approve / reject / improve)
        ↓
Vote recorded on Aptos — contributor weight updated
        ↓
AI team purchases dataset access via Shelby micropayment
        ↓
Shelby receipt generated per read → anchored to Aptos
        ↓
Revenue automatically split to all approved contributors
```

---

## Core Features

### 🧑‍💻 For Contributors
- Submit data in any format: text, image, audio, code, structured tables
- See your contribution weight in real time — how much of the dataset is "yours"
- Earn automatically when your approved contributions are used for training
- Full history: every submission, every vote, every payment — on-chain

### 🗳️ For Voters (DAO Members)
- Review incoming contributions: approve, reject, or flag for improvement
- Stake reputation on your votes — good curation = more voting power over time
- Specialize in domains you know: medical, legal, coding, multilingual
- Earn a share of curation fees for quality gatekeeping

### 🤖 For AI Teams
- Access high-quality, community-verified datasets via S3-compatible API
- Every read generates a Shelby cryptographic receipt anchored to Aptos
- Full data lineage: who contributed what, when, under what license
- Pay-per-read or subscription — enforced at the storage layer, not by a middleman

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                          Quorum                              │
│                                                              │
│  ┌────────────┐   ┌────────────┐   ┌──────────┐  ┌───────┐  │
│  │Contributor │   │   Voter    │   │ AI Team  │  │ Docs  │  │
│  │  Portal    │   │  Dashboard │   │  Client  │  │       │  │
│  └─────┬──────┘   └─────┬──────┘   └────┬─────┘  └───────┘  │
│        │                │               │                    │
│  ┌─────▼────────────────▼───────────────▼──────────────────┐ │
│  │            TanStack Start + tRPC Router                 │ │
│  │   submit  vote  dataset  receipts  governance  rewards  │ │
│  └─────────────────────────┬────────────────────────────────┘ │
│                            │                                 │
│         ┌──────────────────┼──────────────┐                  │
│         ▼                  ▼              ▼                  │
│  ┌────────────┐   ┌──────────────┐  ┌──────────────┐        │
│  │  Shelby    │   │    Aptos     │  │  SQLite +    │        │
│  │ Protocol   │   │  Blockchain  │  │  Drizzle ORM │        │
│  │ (storage)  │   │ (governance) │  │  (metadata)  │        │
│  └────────────┘   └──────────────┘  └──────────────┘        │
└──────────────────────────────────────────────────────────────┘
```

### Storage Layer — Shelby Protocol
- All contributions stored on Shelby (shelbynet)
- S3-compatible API for AI team dataset access
- Every dataset read generates a cryptographic receipt at the storage layer
- Micropayment channels: pay-per-read revenue flows directly to contributors

### Governance Layer — Aptos Blockchain
- Every vote recorded as an Aptos transaction — immutable, auditable
- Contributor weights calculated on-chain from approved submission history
- Move smart contracts handle: DAO membership, voting power, revenue distribution
- ~600ms finality — votes confirm fast enough for real-time UI

### Metadata Layer — SQLite + Drizzle
- Fast queries for contribution listings, vote history, leaderboards
- Type-safe schema with Drizzle ORM
- Local dev with SQLite, production-ready with Turso

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | TanStack Start |
| **API** | oRPC (`@orpc/server`) |
| **Auth** | Better Auth 1.5 (Aptos wallet plugin) |
| **Database** | SQLite / Turso + Drizzle ORM |
| **Storage** | Shelby Protocol |
| **Blockchain** | Aptos (`@aptos-labs/ts-sdk`), Move smart contracts |
| **Monorepo** | Turborepo + pnpm workspaces |
| **Linting** | Biome |
| **Tests** | Vitest (37 tests) |
| **Package Manager** | pnpm |

---

## Database Schema (Drizzle + SQLite)

```typescript
// Contributions submitted to the DAO
export const contributions = sqliteTable('contributions', {
  id: text('id').primaryKey(),
  datasetId: text('dataset_id').references(() => datasets.id),
  contributorAddress: text('contributor_address').notNull(),
  shelbyBlobAddress: text('shelby_blob_address').notNull(),
  dataHash: text('data_hash').notNull(),
  status: text('status').default('pending'), // pending | approved | rejected
  weight: integer('weight').default(0),
  aptosTxHash: text('aptos_tx_hash'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// DAO votes on contributions
export const votes = sqliteTable('votes', {
  id: text('id').primaryKey(),
  contributionId: text('contribution_id').references(() => contributions.id),
  voterAddress: text('voter_address').notNull(),
  decision: text('decision').notNull(),      // approve | reject | improve
  reason: text('reason'),
  votingPower: integer('voting_power').notNull(),
  aptosTxHash: text('aptos_tx_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// Revenue receipts from dataset reads
export const receipts = sqliteTable('receipts', {
  id: text('id').primaryKey(),
  datasetId: text('dataset_id').references(() => datasets.id),
  readerAddress: text('reader_address').notNull(),
  shelbyReceiptHash: text('shelby_receipt_hash').notNull(),
  aptosTxHash: text('aptos_tx_hash').notNull(),
  amount: integer('amount').notNull(),
  distributed: integer('distributed', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
```

---

## Smart Contract Design (Move)

```move
module quorum::dao_governance {

    struct Member has key {
        address: address,
        voting_power: u64,
        total_contributions: u64,
        approved_contributions: u64,
    }

    struct Vote has key {
        contribution_id: vector<u8>,
        voter: address,
        decision: u8,            // 0=approve, 1=reject, 2=improve
        voting_power: u64,
        timestamp: u64,
    }

    struct RevenueDistribution has key {
        dataset_id: vector<u8>,
        shelby_receipt_hash: vector<u8>,
        total_amount: u64,
        distributed: bool,
        timestamp: u64,
    }

    public entry fun submit_contribution(
        contributor: &signer,
        dataset_id: vector<u8>,
        shelby_blob_address: vector<u8>,
        data_hash: vector<u8>,
    ) { ... }

    public entry fun cast_vote(
        voter: &signer,
        contribution_id: vector<u8>,
        decision: u8,
    ) { ... }

    public entry fun distribute_revenue(
        dataset_id: vector<u8>,
        shelby_receipt_hash: vector<u8>,
        amount: u64,
    ) { ... }
}
```

---

## Voting Mechanism

A contribution is approved when it reaches **quorum** — a configurable threshold of weighted votes in favor.

```
Contribution submitted
        ↓
48-hour voting window opens
        ↓
DAO members vote (approve / reject / improve)
        ↓
Votes weighted by voter's historical curation accuracy
        ↓
Threshold reached → contribution approved, weight assigned
        ↓
Contributor's share of future dataset revenue increases
```

Voting power is not bought — it is **earned**. Members who consistently vote with the majority on high-quality contributions gain more influence over time.

---

## Revenue Model

```
AI team pays to access dataset (Shelby micropayment)
        ↓
Shelby receipt generated → revenue event triggered on Aptos
        ↓
Revenue split:
  70% → contributors (proportional to approved contribution weight)
  20% → curators (proportional to votes cast on approved contributions)
  10% → DAO treasury (protocol sustainability)
```

---

## Project Structure

```
quorum/
├── apps/
│   ├── web/                        # TanStack Start app
│   │   ├── app/
│   │   │   ├── routes/
│   │   │   │   ├── index.tsx       # Landing + active datasets
│   │   │   │   ├── contribute/     # Submit data
│   │   │   │   ├── vote/           # Review queue
│   │   │   │   ├── datasets/       # Browse + access
│   │   │   │   ├── earnings/       # Contributor dashboard
│   │   │   │   └── governance/     # DAO proposals + stats
│   │   │   └── server/
│   │   │       └── trpc/
│   │   │           ├── router.ts
│   │   │           ├── contribution.ts
│   │   │           ├── vote.ts
│   │   │           ├── dataset.ts
│   │   │           └── revenue.ts
│   └── docs/                       # Fumadocs
├── packages/
│   ├── db/                         # Drizzle schema
│   ├── shelby/                     # Shelby SDK wrapper
│   ├── aptos/                      # Aptos + Move client
│   └── mcp/                        # Quorum MCP server
├── contracts/
│   ├── sources/
│   │   ├── dao_governance.move
│   │   └── revenue_splitter.move
│   └── Move.toml
├── biome.json
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## Development Roadmap

### Phase 1 — Core Infrastructure ✅
- [x] Shelby package: upload / download / receipt capture
- [x] Aptos package: `submit_contribution` + `cast_vote` + `finalize_contribution`
- [x] Drizzle schema: contributions, votes, receipts, members, indexer_state, auth tables
- [x] oRPC: contribution, vote, dataset, governance, revenue routers
- [x] Move smart contracts: `dao_governance.move` + `revenue_splitter.move`
- **Milestone**: First on-chain vote recorded on Aptos testnet ✅

### Phase 2 — MVP DAO ✅
- [x] Contributor portal: submit UI + wallet connect (Better Auth + Aptos plugin)
- [x] Voting dashboard: review queue + decision UI + finalization
- [x] Voting power calculation (on-chain, via `get_voting_power` view function)
- [x] Revenue distribution contract + payout dashboard
- [x] IP-based rate limiting (60 req/min) + OpenAPI reference
- [x] On-chain event indexer: ContributionFinalized, VoteCast, RevenueDistributed
- [x] Unit tests: 37 tests (API + frontend)
- [x] CI/CD: GitHub Actions + Fly.io deployment
- **Milestone**: Full loop — submit → vote → approve → revenue → payout ✅

### Phase 3 — Open Platform ✅
- [x] Quorum MCP server: AI agents can query datasets, contributions, governance stats
- [x] HuggingFace-compatible export: `dataset.export` → JSONL format
- [x] Reputation leaderboard: voter accuracy % ranked by voting power
- [ ] Multiple DAO instances (any community can launch a dataset DAO)
- [ ] HuggingFace Hub direct push integration
- **Milestone**: AI agents can read and interact with Quorum datasets via MCP ✅

---

## Why This Only Works With Shelby

Traditional storage cannot make this trustless. The revenue split requires cryptographic proof of exactly how many times a dataset was read — not a server log that anyone can edit. Shelby generates that proof at the storage layer. Aptos anchors it permanently. Together they make a DAO economy around data possible for the first time.

---

## Getting Started

```bash
git clone https://github.com/mehmetkr-31/quorum
cd quorum
pnpm setup    # .env oluşturur, DB tablolarını yükler, seed çalıştırır
pnpm dev      # http://localhost:3001
```

**Manuel kurulum:**
```bash
pnpm install
cp apps/web/.env.example apps/web/.env
# .env içinde gerekli değerleri doldur
DATABASE_URL=file:./apps/web/local.db pnpm --filter @quorum/db db:push
pnpm dev
```

**Testler:**
```bash
pnpm test           # Tüm testler (37 test)
pnpm --filter @quorum/api test
pnpm --filter @quorum/web test
```

**Deployment (Fly.io):**
```bash
flyctl launch --no-deploy
flyctl secrets set DATABASE_URL="libsql://..." DATABASE_AUTH_TOKEN="..." \
  BETTER_AUTH_SECRET="$(openssl rand -hex 32)" BETTER_AUTH_URL="https://your-app.fly.dev" \
  QUORUM_CONTRACT_ADDRESS="0x63ff..." APTOS_NODE_URL="https://fullnode.testnet.aptoslabs.com/v1" \
  SHELBY_BASE_URL="..." VITE_CONTRACT_ADDRESS="0x63ff..." \
  VITE_APTOS_NODE_URL="https://fullnode.testnet.aptoslabs.com/v1"
flyctl deploy
```

---

## License

MIT
