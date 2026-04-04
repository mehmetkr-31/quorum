export * from "./auth"

import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core"

// ---------------------------------------------------------------------------
// Indexer state — tracks on-chain event processing cursor
// ---------------------------------------------------------------------------
export const indexerState = sqliteTable("indexer_state", {
  eventType: text("event_type").primaryKey(),
  lastSequenceNumber: text("last_sequence_number").notNull().default("0"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

// ---------------------------------------------------------------------------
// DAOs — each community can launch their own dataset DAO
// ---------------------------------------------------------------------------
export const daos = sqliteTable("daos", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  slug: text("slug").notNull().unique(),
  ownerAddress: text("owner_address").notNull(),
  treasuryAddress: text("treasury_address").notNull(),
  imageUrl: text("image_url"),
  /** On-chain DAO ID returned by create_dao entry function */
  onChainId: text("on_chain_id"),
  /** Voting window duration in seconds (default 48h = 172800) */
  votingWindowSeconds: integer("voting_window_seconds").notNull().default(172800),
  /** Quorum threshold percentage (default 60%) */
  quorumThreshold: integer("quorum_threshold").notNull().default(60),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

// ---------------------------------------------------------------------------
// DAO Memberships — a user can be a member of multiple DAOs
// ---------------------------------------------------------------------------
export const daoMemberships = sqliteTable("dao_memberships", {
  id: text("id").primaryKey(),
  daoId: text("dao_id")
    .notNull()
    .references(() => daos.id),
  memberAddress: text("member_address").notNull(),
  votingPower: integer("voting_power").notNull().default(1),
  approvedContributions: integer("approved_contributions").notNull().default(0),
  totalContributions: integer("total_contributions").notNull().default(0),
  role: text("role", { enum: ["member", "admin", "owner"] })
    .notNull()
    .default("member"),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
})

// ---------------------------------------------------------------------------
// Governance Proposals
// ---------------------------------------------------------------------------
export const proposals = sqliteTable("proposals", {
  id: text("id").primaryKey(),
  daoId: text("dao_id")
    .notNull()
    .references(() => daos.id),
  proposerAddress: text("proposer_address").notNull(),
  /** 0=ParameterChange, 1=TreasurySpend, 2=Text */
  proposalType: integer("proposal_type").notNull().default(2),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** JSON-encoded payload */
  payload: text("payload").notNull().default("{}"),
  /** active | passed | rejected | executed */
  status: text("status", { enum: ["active", "passed", "rejected", "executed"] })
    .notNull()
    .default("active"),
  yesPower: integer("yes_power").notNull().default(0),
  noPower: integer("no_power").notNull().default(0),
  totalPower: integer("total_power").notNull().default(0),
  aptosTxHash: text("aptos_tx_hash"),
  votingDeadline: integer("voting_deadline", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

// ---------------------------------------------------------------------------
// Proposal Votes — who voted on which proposal
// ---------------------------------------------------------------------------
export const proposalVotes = sqliteTable("proposal_votes", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id")
    .notNull()
    .references(() => proposals.id),
  voterAddress: text("voter_address").notNull(),
  support: integer("support", { mode: "boolean" }).notNull(),
  votingPower: integer("voting_power").notNull(),
  aptosTxHash: text("aptos_tx_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

// ---------------------------------------------------------------------------
// QRM Staking — track staked tokens and boost tiers
// ---------------------------------------------------------------------------
export const stakes = sqliteTable("stakes", {
  id: text("id").primaryKey(),
  stakerAddress: text("staker_address").notNull().unique(),
  amount: integer("amount").notNull(), // in QRM base units (8 decimals)
  /** 0=30d (1.5x), 1=90d (2x), 2=180d (3x) */
  tier: integer("tier").notNull().default(0),
  boostBps: integer("boost_bps").notNull().default(150),
  stakedAt: integer("staked_at", { mode: "timestamp" }).notNull(),
  unlockAt: integer("unlock_at", { mode: "timestamp" }).notNull(),
  aptosTxHash: text("aptos_tx_hash"),
})

// ---------------------------------------------------------------------------
// Delegations — voting power delegation
// ---------------------------------------------------------------------------
export const delegations = sqliteTable("delegations", {
  id: text("id").primaryKey(),
  daoId: text("dao_id")
    .notNull()
    .references(() => daos.id),
  delegatorAddress: text("delegator_address").notNull(),
  delegateeAddress: text("delegatee_address").notNull(),
  delegatedPower: integer("delegated_power").notNull(),
  aptosTxHash: text("aptos_tx_hash"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

// ---------------------------------------------------------------------------
// Datasets — belong to a DAO; a DAO can have multiple datasets
// ---------------------------------------------------------------------------
export const datasets = sqliteTable("datasets", {
  id: text("id").primaryKey(),
  daoId: text("dao_id")
    .notNull()
    .references(() => daos.id),
  name: text("name").notNull(),
  description: text("description"),
  ownerAddress: text("owner_address").notNull(),
  totalWeight: real("total_weight").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

// ---------------------------------------------------------------------------
// Legacy global members table — kept for backward compatibility with indexer
// ---------------------------------------------------------------------------
export const members = sqliteTable("members", {
  address: text("address").primaryKey(),
  votingPower: integer("voting_power").notNull().default(1),
  approvedContributions: integer("approved_contributions").notNull().default(0),
  totalContributions: integer("total_contributions").notNull().default(0),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
})

// ---------------------------------------------------------------------------
// Contributions — data submitted to a dataset
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Votes — DAO member votes on contributions
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Receipts — revenue receipts from dataset reads
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------
export type Dao = typeof daos.$inferSelect
export type NewDao = typeof daos.$inferInsert
export type DaoMembership = typeof daoMemberships.$inferSelect
export type NewDaoMembership = typeof daoMemberships.$inferInsert
export type Proposal = typeof proposals.$inferSelect
export type NewProposal = typeof proposals.$inferInsert
export type ProposalVote = typeof proposalVotes.$inferSelect
export type NewProposalVote = typeof proposalVotes.$inferInsert
export type Stake = typeof stakes.$inferSelect
export type NewStake = typeof stakes.$inferInsert
export type Delegation = typeof delegations.$inferSelect
export type NewDelegation = typeof delegations.$inferInsert
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
