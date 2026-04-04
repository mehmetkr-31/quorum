import { contributions, datasets, members, receipts } from "@quorum/db"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { publicProcedure } from "../index"

export const revenueRouter = {
  anchorReceipt: publicProcedure
    .input(
      z.object({
        datasetId: z.string(),
        readerAddress: z.string(),
        shelbyReceiptHash: z.string(),
        aptosTxHash: z.string(),
        amount: z.number(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
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
    .input(z.object({ contributorAddress: z.string() }))
    .handler(async ({ input, context: ctx }) => {
      const rows = await ctx.db
        .select()
        .from(members)
        .where(eq(members.address, input.contributorAddress))
        .limit(1)
      const member = rows[0]
      if (!member) return { approvedContributions: 0, totalWeight: 0 }

      // Fix Issue 3: Calculate actual approved weight sum
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
          limit: z.number().default(50).optional(),
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
    .input(z.object({ receiptId: z.string() }))
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

      const aptosTxHash = await ctx.aptosClient.distributeRevenue(
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

      return { aptosTxHash }
    }),
}
