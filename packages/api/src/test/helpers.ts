import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "@quorum/db"
import type { Context } from "../context"

export function createTestDb() {
  const client = createClient({ url: ":memory:" })
  const db = drizzle(client, { schema })
  return { db, client }
}

export async function setupTestSchema(db: ReturnType<typeof createTestDb>["db"]) {
  const client = (db as any).$client as ReturnType<typeof createClient>
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      owner_address TEXT NOT NULL,
      total_weight REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS members (
      address TEXT PRIMARY KEY,
      voting_power INTEGER NOT NULL DEFAULT 1,
      approved_contributions INTEGER NOT NULL DEFAULT 0,
      total_contributions INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contributions (
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
    );
    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      contribution_id TEXT NOT NULL,
      voter_address TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT,
      voting_power INTEGER NOT NULL,
      aptos_tx_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      reader_address TEXT NOT NULL,
      shelby_receipt_hash TEXT NOT NULL,
      aptos_tx_hash TEXT NOT NULL,
      amount INTEGER NOT NULL,
      distributed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `)
}

export function createMockContext(db: ReturnType<typeof createTestDb>["db"]): Context {
  return {
    db: db as any,
    aptosClient: {
      getMemberVotingPower: async (_address: string) => 10,
    } as any,
    shelbyClient: {
      upload: async () => ({
        shelbyAccount: "shelby://test",
        blobName: "test-blob",
        dataHash: "0xabc123",
      }),
      read: async () => ({
        data: new TextEncoder().encode("test content"),
        contentType: "text/plain",
      }),
    } as any,
    session: {
      id: "test-session",
      userId: "test-user",
      walletAddress: "0xtest",
    },
  }
}
