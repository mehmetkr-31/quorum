# Contract Deploy — Status

## ✅ Deployed on Aptos Devnet (2026-03-23) — v1 (single-DAO)

| Contract | Tx Hash |
|---|---|
| Publish | `0x391e15bcf0a9856b41ce84c2072d1f182dcd6bf7a39b8afc442a5c97d6f31125` |
| dao_governance::initialize | `0xd88143b16baf9508c580697a9a95b2bbff48c92233461e2c2a354888f7e0d582` |
| revenue_splitter::initialize | `0x673596fe924fcfc37053b28a08bcaf07f78b44f77c7d191b15105cb0ccc22448` |

**Contract Address:** `0x928d7052d85f63b206fab9f837b2c3302813e4798931ff0d78a420611dc20d4e`

---

## ⚠️ v3 Re-deploy Required — Phase 4 (Token Economy)

Contracts updated through Phase 4. Full re-deploy required:

**New contracts:**
- `qrm_token.move` — QRM Fungible Asset token
- `staking.move` — QRM staking with voting power boost

**Updated contracts:**
- `dao_governance.move` — Proposal system, delegation, input validation
- `revenue_splitter.move` — `dao_id` in events

### v3 Deploy Commands

```bash
# 1. Publish all contracts (includes qrm_token + staking)
aptos move publish \
  --named-addresses quorum=<YOUR_ADDRESS> \
  --url https://fullnode.testnet.aptoslabs.com/v1 \
  --gas-unit-price 100 \
  --max-gas 500000 \
  --assume-yes

# 2. Initialize governance (creates DAORegistry, all stores)
aptos move run \
  --function-id <YOUR_ADDRESS>::dao_governance::initialize \
  --url https://fullnode.testnet.aptoslabs.com/v1 \
  --assume-yes

# 3. Initialize revenue splitter
aptos move run \
  --function-id <YOUR_ADDRESS>::revenue_splitter::initialize \
  --args "address:<TREASURY_ADDRESS>" \
  --url https://fullnode.testnet.aptoslabs.com/v1 \
  --assume-yes

# 4. Initialize QRM token (creates 1B token, 40% to admin as treasury)
aptos move run \
  --function-id <YOUR_ADDRESS>::qrm_token::initialize \
  --url https://fullnode.testnet.aptoslabs.com/v1 \
  --assume-yes

# 5. Initialize staking
aptos move run \
  --function-id <YOUR_ADDRESS>::staking::initialize \
  --args "address:<TREASURY_ADDRESS>" \
  --url https://fullnode.testnet.aptoslabs.com/v1 \
  --assume-yes

# 6. Create the default Genesis DAO
aptos move run \
  --function-id <YOUR_ADDRESS>::dao_governance::create_dao \
  --args \
    "address:<YOUR_ADDRESS>" \
    "hex:$(echo -n 'dao-1' | xxd -p)" \
    "hex:$(echo -n 'Quorum Genesis DAO' | xxd -p)" \
    "address:<TREASURY_ADDRESS>" \
    "u64:172800000000" \
    "u64:60" \
  --url https://fullnode.testnet.aptoslabs.com/v1 \
  --assume-yes
```

---

## Fly.io Deployment

### 1. GitHub Secrets Setup

Go to: `https://github.com/<your-org>/quorum/settings/secrets/actions`

Add these repository secrets:

| Secret | Description |
|--------|-------------|
| `FLY_API_TOKEN` | `flyctl tokens create deploy -x 999999h` |
| `DATABASE_AUTH_TOKEN` | Turso DB token |

### 2. GitHub Environments Setup

Go to: `Settings → Environments`, create:
- `production` — no extra rules (auto-deploy on main)
- `staging` — manual approval required
- `preview` — for PR previews

### 3. Environment Variables on Fly.io

```bash
flyctl secrets set \
  DATABASE_URL="libsql://your-db.turso.io" \
  DATABASE_AUTH_TOKEN="your-token" \
  BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  BETTER_AUTH_URL="https://your-app.fly.dev" \
  QUORUM_CONTRACT_ADDRESS="<YOUR_ADDRESS>" \
  APTOS_NODE_URL="https://fullnode.testnet.aptoslabs.com/v1" \
  APTOS_PRIVATE_KEY="<SERVER_PRIVATE_KEY>" \
  SHELBY_BASE_URL="https://api.shelbynet.shelby.xyz/v1" \
  SHELBY_API_KEY="<KEY>" \
  SHELBY_NETWORK="SHELBYNET" \
  VITE_CONTRACT_ADDRESS="<YOUR_ADDRESS>" \
  VITE_APTOS_NODE_URL="https://fullnode.testnet.aptoslabs.com/v1" \
  HUGGINGFACE_TOKEN="hf_..."
```

### 4. Database Migration

```bash
# Generate any pending migrations
pnpm --filter @quorum/db db:generate

# Apply to production Turso DB
DATABASE_URL="libsql://..." DATABASE_AUTH_TOKEN="..." \
  pnpm --filter @quorum/db db:migrate

# Seed default Genesis DAO
DATABASE_URL="libsql://..." DATABASE_AUTH_TOKEN="..." pnpm seed
```

### 5. Deploy

```bash
# Manual deploy (or just push to main — GitHub Actions will handle it)
flyctl deploy --remote-only
```

---

## ⏳ Shelbynet — Pending

Shelbynet (chain_id=113) is running but has **0 user transactions** on-chain.
Re-deploy to Shelbynet once user transactions are enabled — same commands as above but with `--url https://api.shelbynet.shelby.xyz/v1`.


| Contract | Tx Hash |
|---|---|
| Publish | `0x391e15bcf0a9856b41ce84c2072d1f182dcd6bf7a39b8afc442a5c97d6f31125` |
| dao_governance::initialize | `0xd88143b16baf9508c580697a9a95b2bbff48c92233461e2c2a354888f7e0d582` |
| revenue_splitter::initialize | `0x673596fe924fcfc37053b28a08bcaf07f78b44f77c7d191b15105cb0ccc22448` |

**Contract Address:** `0x928d7052d85f63b206fab9f837b2c3302813e4798931ff0d78a420611dc20d4e`

---

## ⚠️ v2 Re-deploy Required — Multi-DAO Architecture

The contracts have been significantly updated for Phase 3 (multiple DAO instances).
The v1 contract must be replaced with the new v2 contracts.

### What changed in v2

**`dao_governance.move`:**
- Added `DAORegistry` — stores all DAO configs
- Added `DAOMemberStore` — DAO-scoped memberships with per-DAO voting power
- New entry functions: `create_dao`, `join_dao`
- `submit_contribution` now takes `dao_id` as parameter
- `cast_vote` uses DAO-scoped voting power
- `finalize_contribution` uses DAO's custom quorum threshold
- All events include `dao_id`
- New view functions: `get_dao_voting_power`, `get_dao_member_count`, `get_dao_count`

**`revenue_splitter.move`:**
- `anchor_receipt` and `distribute_revenue` now include `dao_id`
- Events include `dao_id` for multi-DAO tracking

### Re-deploy Commands (Aptos Testnet/Devnet)

```bash
# 1. Publish updated contracts
aptos move publish \
  --named-addresses quorum=<YOUR_ADDRESS> \
  --url https://fullnode.testnet.aptoslabs.com/v1 \
  --gas-unit-price 100 \
  --max-gas 200000 \
  --assume-yes

# 2. Initialize governance (creates DAORegistry, ContributionStore, VoteStore, DAOMemberStore)
aptos move run \
  --function-id <YOUR_ADDRESS>::dao_governance::initialize \
  --url https://fullnode.testnet.aptoslabs.com/v1 \
  --assume-yes

# 3. Initialize revenue splitter (treasury = your address or a multisig)
aptos move run \
  --function-id <YOUR_ADDRESS>::revenue_splitter::initialize \
  --args "address:<TREASURY_ADDRESS>" \
  --url https://fullnode.testnet.aptoslabs.com/v1 \
  --assume-yes

# 4. (Optional) Create the default "Genesis DAO" on-chain
aptos move run \
  --function-id <YOUR_ADDRESS>::dao_governance::create_dao \
  --args \
    "address:<YOUR_ADDRESS>" \
    "hex:$(echo -n 'dao-1' | xxd -p)" \
    "hex:$(echo -n 'Quorum Genesis DAO' | xxd -p)" \
    "address:<TREASURY_ADDRESS>" \
    "u64:60000000" \
    "u64:60" \
  --url https://fullnode.testnet.aptoslabs.com/v1 \
  --assume-yes
```

### Fly.io Deployment

Update `flyctl secrets set` with all required env vars:

```bash
flyctl secrets set \
  DATABASE_URL="libsql://your-db.turso.io" \
  DATABASE_AUTH_TOKEN="your-token" \
  BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  BETTER_AUTH_URL="https://your-app.fly.dev" \
  QUORUM_CONTRACT_ADDRESS="<YOUR_ADDRESS>" \
  APTOS_NODE_URL="https://fullnode.testnet.aptoslabs.com/v1" \
  APTOS_PRIVATE_KEY="<SERVER_PRIVATE_KEY>" \
  SHELBY_BASE_URL="https://api.shelbynet.shelby.xyz/v1" \
  SHELBY_API_KEY="<KEY>" \
  SHELBY_NETWORK="SHELBYNET" \
  VITE_CONTRACT_ADDRESS="<YOUR_ADDRESS>" \
  VITE_APTOS_NODE_URL="https://fullnode.testnet.aptoslabs.com/v1" \
  HUGGINGFACE_TOKEN="hf_..."    # Optional — for dataset.pushToHub

flyctl deploy
```

---

## Database Migration

New tables in v2: `daos`, `dao_memberships`. `datasets` table gets a new `dao_id` column.

### Production (Turso) Migration

```bash
# Generate migration file (already done locally — see drizzle/0001_stiff_guardian.sql)
pnpm --filter @quorum/db db:generate

# Apply to production Turso DB
DATABASE_URL="libsql://..." DATABASE_AUTH_TOKEN="..." pnpm --filter @quorum/db db:migrate

# Seed the default Genesis DAO
DATABASE_URL="libsql://..." DATABASE_AUTH_TOKEN="..." pnpm seed
```

### Important: datasets.dao_id is NOT NULL

Existing `datasets` rows without a `dao_id` will need to be updated before migration:

```sql
-- Run this BEFORE applying the migration if you have existing data:
-- 1. Insert a default DAO
INSERT OR IGNORE INTO daos (id, name, slug, owner_address, treasury_address, created_at)
VALUES ('dao-legacy', 'Legacy DAO', 'legacy', '0x...', '0x...', unixepoch());

-- 2. Backfill all existing datasets to the legacy DAO
UPDATE datasets SET dao_id = 'dao-legacy' WHERE dao_id IS NULL;

-- 3. Now apply the migration
```

---

## ⏳ Shelbynet — Pending

Shelbynet (chain_id=113) is running but has **0 user transactions** on-chain.
The faucet accepts requests and returns tx hashes, but no user transactions are being included in blocks.
Re-deploy to Shelbynet once user transactions are enabled — same commands as above but with `--url https://api.shelbynet.shelby.xyz/v1`.
