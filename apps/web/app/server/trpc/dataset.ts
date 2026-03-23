import { randomUUID } from "crypto"
import { desc, eq } from "drizzle-orm"
import { z } from "zod"
import { datasets } from "@quorum/db"
import { publicProcedure, router } from "./trpc"

export const datasetRouter = router({
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        ownerAddress: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = randomUUID()
      await ctx.db.insert(datasets).values({
        id,
        name: input.name,
        description: input.description ?? null,
        ownerAddress: input.ownerAddress,
        totalWeight: 0,
        createdAt: new Date(),
      })
      return { id }
    }),

  list: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(datasets)
        .orderBy(desc(datasets.createdAt))
        .limit(input.limit)
        .offset(input.offset)
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [result] = await ctx.db
        .select()
        .from(datasets)
        .where(eq(datasets.id, input.id))
        .limit(1)
      return result ?? null
    }),

  // Called by AI teams — verifies the Shelby receipt and returns dataset access info
  read: publicProcedure
    .input(
      z.object({
        datasetId: z.string(),
        shelbyReceiptHash: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const receipt = await ctx.shelbyClient.getReceipt(input.shelbyReceiptHash)

      const [dataset] = await ctx.db
        .select()
        .from(datasets)
        .where(eq(datasets.id, input.datasetId))
        .limit(1)

      if (!dataset) return null

      return { dataset, receipt }
    }),
})
