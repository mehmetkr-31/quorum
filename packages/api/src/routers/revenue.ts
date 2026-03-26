import { contributions, members, receipts } from "@quorum/db"
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
}
