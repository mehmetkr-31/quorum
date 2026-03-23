# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Quorum is a community-governed AI training dataset DAO. Contributors submit data stored on Shelby Protocol, DAO members vote on quality via Aptos blockchain, and revenue from dataset access is automatically split among contributors, curators, and the treasury.

## Monorepo Structure

Turborepo + pnpm workspaces. All packages are under `packages/`, all deployable apps under `apps/`.

```
apps/web/        # TanStack Start frontend + tRPC server
apps/docs/       # Fumadocs documentation site
packages/db/     # Drizzle ORM schema (SQLite / Turso)
packages/aptos/  # Aptos blockchain client + Move contract interactions
packages/shelby/ # Shelby Protocol SDK wrapper
packages/mcp/    # Quorum MCP server
contracts/       # Move smart contracts (Aptos)
```

## Commands

> Note: config files (`package.json`, `turbo.json`, `biome.json`, `pnpm-workspace.yaml`) are currently empty stubs — fill these in as the project is built out.

```bash
pnpm install                        # install all workspace dependencies
pnpm dev                            # start all apps in dev mode (via Turborepo)
pnpm build                          # build all packages and apps
pnpm lint                           # run Biome linter across all packages
pnpm --filter @quorum/db migrate    # run database migrations
pnpm --filter <package> <script>    # run a script in a specific workspace package
```

## Architecture

### Data flow
1. Contributor submits data → stored on **Shelby Protocol** (blob address returned)
2. tRPC `contribution.submit` writes metadata to **SQLite via Drizzle**, calls Aptos `submit_contribution`
3. DAO members vote via tRPC `vote.cast` → recorded on **Aptos** (`cast_vote` entry function)
4. On quorum threshold, contribution status → `approved`, contributor weight updated on-chain
5. AI team reads dataset → Shelby generates cryptographic receipt → anchored to Aptos
6. tRPC `revenue.distribute` triggers `distribute_revenue` Move contract: 70% contributors / 20% curators / 10% treasury

### tRPC routers (`apps/web/app/server/trpc/`)
- `contribution.ts` — submit, list, status
- `vote.ts` — cast vote, get vote history
- `dataset.ts` — browse datasets, read access
- `revenue.ts` — receipts, distribution, earnings dashboard
- `router.ts` — root router combining all sub-routers

### Smart contracts (`contracts/sources/`)
- `dao_governance.move` — `Member`, `Vote` structs; `submit_contribution`, `cast_vote` entry functions; voting power calculation
- `revenue_splitter.move` — `RevenueDistribution` struct; `distribute_revenue` entry function

### Database schema (`packages/db/`)
Three core tables: `contributions` (with `shelby_blob_address`, `aptos_tx_hash`, `weight`, `status`), `votes` (with `voting_power`, `decision`: approve/reject/improve), `receipts` (with `shelby_receipt_hash`, `distributed`).

### Auth
Better Auth handles wallet-based authentication.

## Key conventions

- **Linting**: Biome (not ESLint/Prettier)
- **Package manager**: pnpm only — do not use npm or yarn
- **Database**: SQLite locally, Turso in production — both via Drizzle ORM
- **Blockchain**: Aptos testnet during development; ~600ms finality means votes can reflect in UI in real time
- **Storage**: All data blobs go through Shelby Protocol — never store raw data in the database, only the `shelby_blob_address`
