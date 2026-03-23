import { randomUUID } from "crypto"
import { and, desc, eq } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { contributions, datasets, receipts, votes } from "@quorum/db"
import { publicProcedure, router } from "./trpc"

export const revenueRouter = router({
  /**
   * Anchor a Shelby receipt on Aptos and record it in DB.
   * Called by the AI team (reader) immediately after dataset access.
   * The reader must sign the Aptos anchor_receipt tx client-side.
   */
  anchorReceipt: publicProcedure
    .input(
      z.object({
        datasetId: z.string().uuid(),
        readerAddress: z.string().min(1),
        shelbyReceiptHash: z.string().min(1),
        aptosTxHash: z.string().min(1), // result of anchor_receipt tx
        amount: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = randomUUID()
      await ctx.db.insert(receipts).values({
        id,
        datasetId: input.datasetId,
        readerAddress: input.readerAddress,
        shelbyReceiptHash: input.shelbyReceiptHash,
        aptosTxHash: input.aptosTxHash,
        amount: input.amount,
        distributed: false,
        createdAt: new Date(),
      })
      return { id }
    }),

  /**
   * Trigger on-chain revenue distribution for a previously anchored receipt.
   * Uses the server-side signer (APTOS_PRIVATE_KEY) to pay out contributors/curators.
   */
  distribute: publicProcedure
    .input(z.object({ receiptId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [receipt] = await ctx.db
        .select()
        .from(receipts)
        .where(eq(receipts.id, input.receiptId))
        .limit(1)

      if (!receipt) throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found" })
      if (receipt.distributed) throw new TRPCError({ code: "CONFLICT", message: "Already distributed" })

      // Fetch all approved contributors for this dataset
      const approved = await ctx.db
        .select()
        .from(contributions)
        .where(
          and(
            eq(contributions.datasetId, receipt.datasetId),
            eq(contributions.status, "approved"),
          ),
        )

      if (approved.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No approved contributions for this dataset" })
      }

      // Fetch curators: voters who voted on approved contributions
      const approvedIds = approved.map((c) => c.id)
      const allVotes = await ctx.db
        .select()
        .from(votes)
        .where(
          and(
            eq(votes.decision, "approve"),
          ),
        )
      const curatorVotes = allVotes.filter((v) => approvedIds.includes(v.contributionId))

      // Deduplicate curators — sum their voting powers
      const curatorMap = new Map<string, number>()
      for (const v of curatorVotes) {
        curatorMap.set(v.voterAddress, (curatorMap.get(v.voterAddress) ?? 0) + v.votingPower)
      }

      const contributorAddresses = approved.map((c) => c.contributorAddress)
      const contributorWeights = approved.map((c) => BigInt(c.weight))
      const curatorAddresses = Array.from(curatorMap.keys())
      const curatorPowers = Array.from(curatorMap.values()).map(BigInt)

      const aptosTxHash = await ctx.aptosClient.distributeRevenue(
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
        .set({ distributed: true, aptosTxHash })
        .where(eq(receipts.id, input.receiptId))

      return { aptosTxHash }
    }),

  listReceipts: publicProcedure
    .input(
      z.object({
        datasetId: z.string().optional(),
        distributed: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input.datasetId) conditions.push(eq(receipts.datasetId, input.datasetId))
      if (input.distributed !== undefined)
        conditions.push(eq(receipts.distributed, input.distributed))

      return ctx.db
        .select()
        .from(receipts)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(receipts.createdAt))
        .limit(input.limit)
        .offset(input.offset)
    }),

  getEarnings: publicProcedure
    .input(z.object({ contributorAddress: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const approved = await ctx.db
        .select()
        .from(contributions)
        .where(
          and(
            eq(contributions.contributorAddress, input.contributorAddress),
            eq(contributions.status, "approved"),
          ),
        )

      const totalWeight = approved.reduce((sum, c) => sum + c.weight, 0)

      // Gather dataset names
      const datasetIds = [...new Set(approved.map((c) => c.datasetId))]
      const datasetList = datasetIds.length
        ? await ctx.db
            .select()
            .from(datasets)
            .where(
              datasetIds.length === 1
                ? eq(datasets.id, datasetIds[0])
                : and(...datasetIds.map((id) => eq(datasets.id, id))),
            )
        : []

      return {
        approvedContributions: approved.length,
        totalWeight,
        contributions: approved,
        datasets: datasetList,
      }
    }),
})
