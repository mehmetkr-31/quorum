import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const datasets = sqliteTable("datasets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ownerAddress: text("owner_address").notNull(),
  totalWeight: real("total_weight").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const members = sqliteTable("members", {
  address: text("address").primaryKey(),
  votingPower: integer("voting_power").notNull().default(1),
  approvedContributions: integer("approved_contributions").notNull().default(0),
  totalContributions: integer("total_contributions").notNull().default(0),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
})

export const contributions = sqliteTable("contributions", {
  id: text("id").primaryKey(),
  datasetId: text("dataset_id")
    .notNull()
    .references(() => datasets.id),
  contributorAddress: text("contributor_address").notNull(),
  shelbyAccount: text("shelby_account").notNull(),
  shelbyBlobName: text("shelby_blob_name").notNull(),
  dataHash: text("data_hash").notNull(),
  weight: real("weight").notNull().default(1.0),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  aptosTxHash: text("aptos_tx_hash"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const votes = sqliteTable("votes", {
  id: text("id").primaryKey(),
  contributionId: text("contribution_id")
    .notNull()
    .references(() => contributions.id),
  voterAddress: text("voter_address").notNull(),
  decision: text("decision", { enum: ["approve", "reject", "improve"] }).notNull(),
  reason: text("reason"),
  votingPower: integer("voting_power").notNull(),
  aptosTxHash: text("aptos_tx_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const receipts = sqliteTable("receipts", {
  id: text("id").primaryKey(),
  datasetId: text("dataset_id")
    .notNull()
    .references(() => datasets.id),
  readerAddress: text("reader_address").notNull(),
  shelbyReceiptHash: text("shelby_receipt_hash").notNull(),
  aptosTxHash: text("aptos_tx_hash").notNull(),
  amount: integer("amount").notNull(),
  distributed: integer("distributed", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})
