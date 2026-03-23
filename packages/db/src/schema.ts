import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const datasets = sqliteTable("datasets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ownerAddress: text("owner_address").notNull(),
  totalWeight: integer("total_weight").default(0).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const members = sqliteTable("members", {
  address: text("address").primaryKey(),
  votingPower: integer("voting_power").default(1).notNull(),
  totalContributions: integer("total_contributions").default(0).notNull(),
  approvedContributions: integer("approved_contributions").default(0).notNull(),
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
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .default("pending")
    .notNull(),
  weight: integer("weight").default(0).notNull(),
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
  distributed: integer("distributed", { mode: "boolean" }).default(false).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export type Dataset = typeof datasets.$inferSelect
export type NewDataset = typeof datasets.$inferInsert
export type Member = typeof members.$inferSelect
export type NewMember = typeof members.$inferInsert
export type Contribution = typeof contributions.$inferSelect
export type NewContribution = typeof contributions.$inferInsert
export type Vote = typeof votes.$inferSelect
export type NewVote = typeof votes.$inferInsert
export type Receipt = typeof receipts.$inferSelect
export type NewReceipt = typeof receipts.$inferInsert
