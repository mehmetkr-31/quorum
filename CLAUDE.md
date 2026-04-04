# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Quorum is a **multi-DAO platform** for community-governed AI training datasets. Any community can launch their own DAO to collaboratively build, curate, and govern datasets. Contributors submit data stored on Shelby Protocol, DAO members vote on quality via Aptos blockchain, and revenue from dataset access is automatically split among contributors, curators, and the treasury.

## Monorepo Structure

Turborepo + pnpm workspaces. All packages are under `packages/`, all deployable apps under `apps/`.

```
apps/web/        # TanStack Start frontend + oRPC server
apps/fumadocs/   # Fumadocs documentation site
packages/api/    # oRPC routers, context, indexer
packages/db/     # Drizzle ORM schema (SQLite / Turso)
packages/aptos/  # Aptos blockchain client + Move contract interactions
packages/shelby/ # Shelby Protocol SDK wrapper
packages/auth/   # Better Auth with Aptos wallet plugin
packages/env/    # Zod-validated env vars
packages/mcp/    # Quorum MCP server (multi-DAO)
contracts/       # Move smart contracts (Aptos) — DAO Registry pattern
```

## Commands

```bash
pnpm install                        # install all workspace dependencies
pnpm dev                            # start all apps in dev mode (via Turborepo)
pnpm build                          # build all packages and apps
pnpm lint                           # run Biome linter across all packages
pnpm db:push                        # push DB schema to SQLite
pnpm seed                           # seed default DAO + dataset
pnpm test                           # run all tests (37 tests)
pnpm --filter <package> <script>    # run a script in a specific workspace package
```

## Architecture

### Multi-DAO Model
- **DAOs** are top-level entities. Any community can create a DAO via `/daos`.
- Each DAO has its own **members** (with DAO-scoped voting power), **datasets**, and **governance settings** (voting window, quorum threshold, treasury).
- A user can be a member of multiple DAOs with independent voting power.
- On-chain: DAO Registry pattern on a single contract — `DAORegistry` stores all DAOs, `DAOMemberStore` stores per-DAO memberships.

### Data flow
1. Community creates a DAO → on-chain via `create_dao` → off-chain DB row
2. DAO member creates a dataset within the DAO
3. Contributor submits data → stored on **Shelby Protocol** (blob address returned)
4. oRPC `contribution.submit` writes metadata to **SQLite via Drizzle**, client calls Aptos `submit_contribution` with `dao_id`
5. DAO members vote via oRPC `vote.cast` → recorded on **Aptos** (`cast_vote` entry function, scoped to DAO)
6. On quorum threshold, contribution status → `approved`, contributor weight updated on-chain (both global and DAO-scoped)
7. AI team reads dataset → Shelby generates cryptographic receipt → anchored to Aptos
8. oRPC `revenue.distribute` triggers `distribute_revenue` Move contract: 70% contributors / 20% curators / 10% treasury
9. Dataset can be pushed to HuggingFace Hub via `dataset.pushToHub`

### oRPC routers (`packages/api/src/routers/`)
- `dao.ts` — create, get, list, join, listMembers, getMembership, getStats
- `contribution.ts` — submit, confirmOnChain, getContent, listMine, list
- `vote.ts` — cast vote, get vote history
- `dataset.ts` — create (DAO-scoped), list (filterable by DAO), export (JSONL), pushToHub (HuggingFace)
- `revenue.ts` — anchorReceipt, getEarnings, listReceipts, distribute
- `governance.ts` — global and DAO-scoped stats, leaderboard

### Smart contracts (`contracts/sources/`)
- `dao_governance.move` — `DAORegistry`, `DAOMemberStore`, `ContributionStore`, `VoteStore`; entry functions: `initialize`, `create_dao`, `join_dao`, `register_member`, `submit_contribution`, `cast_vote`, `finalize_contribution`; view functions: `get_voting_power`, `get_dao_voting_power`, `get_dao_member_count`, `get_dao_count`
- `revenue_splitter.move` — `DistributionStore` with `dao_id` in events; entry functions: `initialize`, `anchor_receipt`, `distribute_revenue`

### Database schema (`packages/db/`)
Core tables: `daos` (with slug, treasury, voting settings), `dao_memberships` (composite DAO+member with scoped voting power), `datasets` (FK to dao), `contributions`, `votes`, `receipts`, `members` (legacy global). Auth tables via Better Auth.

### Auth
Better Auth handles wallet-based authentication via Aptos wallet plugin (nonce → sign → verify).

### Frontend routes
- `/` — Landing page with live metrics
- `/daos` — DAO explorer + create DAO form
- `/daos/$slug` — DAO detail page (overview, datasets, members, governance tabs)
- `/datasets` — Global dataset browser
- `/contribute` — Contribution submission
- `/vote` — Review queue + voting
- `/governance` — Global governance dashboard
- `/earnings` — Contributor earnings

## Key conventions

- **API**: oRPC (`@orpc/server`) — NOT tRPC
- **Linting**: Biome (not ESLint/Prettier)
- **Package manager**: pnpm only — do not use npm or yarn
- **Database**: SQLite locally, Turso in production — both via Drizzle ORM
- **Blockchain**: Aptos testnet during development; ~600ms finality means votes can reflect in UI in real time
- **Storage**: All data blobs go through Shelby Protocol — never store raw data in the database, only blob references
- **Multi-DAO**: All new features should be DAO-scoped. The `members` table is kept for backward compatibility but new code should use `daoMemberships`.
