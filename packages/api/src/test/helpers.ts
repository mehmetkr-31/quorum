import { createClient } from "@libsql/client"
import * as schema from "@quorum/db"
import { drizzle } from "drizzle-orm/libsql"
import type { Context } from "../context"

export function createTestDb() {
  const client = createClient({ url: ":memory:" })
  const db = drizzle(client, { schema })
  return { db, client }
}

export async function setupTestSchema(client: ReturnType<typeof createClient>) {
  await client.batch([
    `CREATE TABLE IF NOT EXISTS daos (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      slug TEXT NOT NULL UNIQUE,
      owner_address TEXT NOT NULL,
      treasury_address TEXT NOT NULL,
      image_url TEXT,
      on_chain_id TEXT,
      voting_window_seconds INTEGER NOT NULL DEFAULT 172800,
      quorum_threshold INTEGER NOT NULL DEFAULT 60,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS dao_memberships (
      id TEXT PRIMARY KEY,
      dao_id TEXT NOT NULL,
      member_address TEXT NOT NULL,
      voting_power INTEGER NOT NULL DEFAULT 1,
      approved_contributions INTEGER NOT NULL DEFAULT 0,
      total_contributions INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      dao_id TEXT NOT NULL,
      proposer_address TEXT NOT NULL,
      proposal_type INTEGER NOT NULL DEFAULT 2,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      yes_power INTEGER NOT NULL DEFAULT 0,
      no_power INTEGER NOT NULL DEFAULT 0,
      total_power INTEGER NOT NULL DEFAULT 0,
      aptos_tx_hash TEXT,
      voting_deadline INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS proposal_votes (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL,
      voter_address TEXT NOT NULL,
      support INTEGER NOT NULL,
      voting_power INTEGER NOT NULL,
      aptos_tx_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS stakes (
      id TEXT PRIMARY KEY,
      staker_address TEXT NOT NULL UNIQUE,
      amount INTEGER NOT NULL,
      tier INTEGER NOT NULL DEFAULT 0,
      boost_bps INTEGER NOT NULL DEFAULT 150,
      staked_at INTEGER NOT NULL,
      unlock_at INTEGER NOT NULL,
      aptos_tx_hash TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS delegations (
      id TEXT PRIMARY KEY,
      dao_id TEXT NOT NULL,
      delegator_address TEXT NOT NULL,
      delegatee_address TEXT NOT NULL,
      delegated_power INTEGER NOT NULL,
      aptos_tx_hash TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      dao_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      owner_address TEXT NOT NULL,
      total_weight REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS members (
      address TEXT PRIMARY KEY,
      voting_power INTEGER NOT NULL DEFAULT 1,
      approved_contributions INTEGER NOT NULL DEFAULT 0,
      total_contributions INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS contributions (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      contributor_address TEXT NOT NULL,
      shelby_account TEXT NOT NULL,
      shelby_blob_name TEXT NOT NULL,
      data_hash TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1.0,
      status TEXT NOT NULL DEFAULT 'pending',
      aptos_tx_hash TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      contribution_id TEXT NOT NULL,
      voter_address TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT,
      voting_power INTEGER NOT NULL,
      aptos_tx_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      reader_address TEXT NOT NULL,
      shelby_receipt_hash TEXT NOT NULL,
      aptos_tx_hash TEXT NOT NULL,
      amount INTEGER NOT NULL,
      distributed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
  ])
}

export function createMockContext(db: ReturnType<typeof createTestDb>["db"]): Context {
  return {
    // biome-ignore lint/suspicious/noExplicitAny: test mock - drizzle types don't match in-memory client
    db: db as any,
    aptosClient: {
      getMemberVotingPower: async (_address: string) => 10,
      // biome-ignore lint/suspicious/noExplicitAny: test mock
    } as any,
    shelbyClient: {
      upload: async () => ({
        shelbyAccount: "shelby://test",
        dataHash: "0xabc123",
      }),
      download: async () => Buffer.from("test content"),
      // biome-ignore lint/suspicious/noExplicitAny: test mock
    } as any,
    session: {
      id: "test-session",
      userId: "test-user",
      walletAddress: "0xtest",
    },
  }
}

/** Bir handler'ı doğrudan çağırmak için yardımcı */
export async function callHandler<T>(
  // biome-ignore lint/suspicious/noExplicitAny: handler return type varies per router
  router: { handler: (args: { input: T; context: Context }) => Promise<any> },
  input: T,
  ctx: Context,
) {
  return router.handler({ input, context: ctx })
}
