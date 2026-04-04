import { contributions, datasets, members, receipts } from "@quorum/db"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { publicProcedure } from "../index"

// ── Shared validators ────────────────────────────────────────────────────────

const aptosAddress = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/, "Invalid Aptos address format")

const aptosTxHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid Aptos transaction hash format")

const uuidV4 = z.string().uuid("Must be a valid UUID")

/** Shelby receipt hash — 64 hex chars (no 0x prefix) */
const shelbyHash = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, "Shelby receipt hash must be 64 hex characters")

// ── Router ───────────────────────────────────────────────────────────────────

export const revenueRouter = {
  anchorReceipt: publicProcedure
    .input(
      z.object({
        datasetId: uuidV4,
        readerAddress: aptosAddress,
        shelbyReceiptHash: shelbyHash,
        aptosTxHash: aptosTxHash,
        amount: z.number().int().positive().max(1_000_000_000_000), // max 10,000 APT in octas
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      // Verify dataset exists
      const [dataset] = await ctx.db
        .select({ id: datasets.id })
        .from(datasets)
        .where(eq(datasets.id, input.datasetId))
        .limit(1)
      if (!dataset) throw new Error("Dataset not found")

      // Idempotency — don't double-insert same receipt
      const [existing] = await ctx.db
        .select({ id: receipts.id })
        .from(receipts)
        .where(eq(receipts.shelbyReceiptHash, input.shelbyReceiptHash))
        .limit(1)
      if (existing) return { id: existing.id }

      const id = crypto.randomUUID()
      await ctx.db.insert(receipts).values({
        id,
        datasetId: input.datasetId,
        readerAddress: input.readerAddress,
        shelbyReceiptHash: input.shelbyReceiptHash,
        aptosTxHash: input.aptosTxHash,
        amount: input.amount,
        createdAt: new Date(),
      })
      return { id }
    }),

  getEarnings: publicProcedure
    .input(z.object({ contributorAddress: aptosAddress }))
    .handler(async ({ input, context: ctx }) => {
      const rows = await ctx.db
        .select()
        .from(members)
        .where(eq(members.address, input.contributorAddress))
        .limit(1)
      const member = rows[0]
      if (!member) return { approvedContributions: 0, totalWeight: 0 }

      const weightRows = await ctx.db
        .select({
          totalWeight: sql<number>`sum(${contributions.weight})`.mapWith(Number),
        })
        .from(contributions)
        .where(
          and(
            eq(contributions.contributorAddress, input.contributorAddress),
            eq(contributions.status, "approved"),
          ),
        )

      return {
        approvedContributions: member.approvedContributions,
        totalWeight: weightRows[0]?.totalWeight ?? 0,
      }
    }),

  listReceipts: publicProcedure
    .input(
      z
        .object({
          distributed: z.boolean().optional(),
          limit: z.number().int().min(1).max(200).default(50).optional(),
        })
        .optional(),
    )
    .handler(async ({ input, context: ctx }) => {
      const query = ctx.db.select().from(receipts)
      if (input?.distributed !== undefined) {
        return query.where(eq(receipts.distributed, input.distributed)).limit(input?.limit ?? 50)
      }
      return query.limit(input?.limit ?? 50)
    }),

  distribute: publicProcedure
    .input(z.object({ receiptId: uuidV4 }))
    .handler(async ({ input, context: ctx }) => {
      const [receipt] = await ctx.db
        .select()
        .from(receipts)
        .where(eq(receipts.id, input.receiptId))
        .limit(1)

      if (!receipt) throw new Error("Receipt not found")
      if (receipt.distributed) throw new Error("Already distributed")

      // Find which DAO this dataset belongs to
      const [dataset] = await ctx.db
        .select({ daoId: datasets.daoId })
        .from(datasets)
        .where(eq(datasets.id, receipt.datasetId))
        .limit(1)

      const daoId = dataset?.daoId ?? "dao-1"

      // Gather contributors for this dataset (approved only)
      const contributorRows = await ctx.db
        .select({
          address: contributions.contributorAddress,
          weight: sql<number>`sum(${contributions.weight})`.mapWith(Number),
        })
        .from(contributions)
        .where(
          and(eq(contributions.datasetId, receipt.datasetId), eq(contributions.status, "approved")),
        )
        .groupBy(contributions.contributorAddress)

      // Gather curators (all DAO members)
      const curatorRows = await ctx.db.select().from(members)

      const contributorAddresses = contributorRows.map((r) => r.address)
      const contributorWeights = contributorRows.map((r) => BigInt(Math.round(r.weight * 100)))
      const curatorAddresses = curatorRows.map((r) => r.address)
      const curatorPowers = curatorRows.map((r) => BigInt(r.votingPower))

      const txHash = await ctx.aptosClient.distributeRevenue(
        daoId,
        receipt.datasetId,
        receipt.shelbyReceiptHash,
        BigInt(receipt.amount),
        contributorAddresses,
        contributorWeights,
        curatorAddresses,
        curatorPowers,
      )

      await ctx.db
        .update(receipts)
        .set({ distributed: true })
        .where(eq(receipts.id, input.receiptId))

      return { aptosTxHash: txHash }
    }),
}
