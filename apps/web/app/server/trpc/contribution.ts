import { createHash, randomUUID } from "crypto"
import { and, desc, eq } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { contributions } from "@quorum/db"
import { publicProcedure, router } from "./trpc"

export const contributionRouter = router({
  /**
   * Step 1: Upload data to Shelby + write pending record to DB.
   * Step 2 (client-side): User signs the Aptos tx with their wallet.
   * Step 3: Call confirmOnChain with the resulting tx hash.
   */
  submit: publicProcedure
    .input(
      z.object({
        datasetId: z.string().uuid(),
        contributorAddress: z.string().min(1),
        shelbyAccount: z.string().min(1), // contributor's Shelby account
        data: z.string().min(1), // base64 encoded blob
        contentType: z.string().default("application/octet-stream"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.data, "base64")
      const dataHash = createHash("sha256").update(buffer).digest("hex")

      const { blobName } = await ctx.shelbyClient.upload(buffer, input.contentType)

      const id = randomUUID()
      await ctx.db.insert(contributions).values({
        id,
        datasetId: input.datasetId,
        contributorAddress: input.contributorAddress,
        shelbyAccount: input.shelbyAccount,
        shelbyBlobName: blobName,
        dataHash,
        status: "pending",
        weight: 0,
        createdAt: new Date(),
      })

      return { id, shelbyAccount: input.shelbyAccount, shelbyBlobName: blobName, dataHash }
    }),

  /**
   * After the client has signed + submitted the Aptos tx, record the tx hash in DB.
   */
  confirmOnChain: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        aptosTxHash: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(contributions)
        .where(eq(contributions.id, input.id))
        .limit(1)

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contribution not found" })
      }
      if (existing.aptosTxHash) {
        throw new TRPCError({ code: "CONFLICT", message: "Already confirmed on-chain" })
      }

      await ctx.db
        .update(contributions)
        .set({ aptosTxHash: input.aptosTxHash })
        .where(eq(contributions.id, input.id))

      return { ok: true }
    }),

  list: publicProcedure
    .input(
      z.object({
        datasetId: z.string().optional(),
        status: z.enum(["pending", "approved", "rejected"]).optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input.datasetId) conditions.push(eq(contributions.datasetId, input.datasetId))
      if (input.status) conditions.push(eq(contributions.status, input.status))

      return ctx.db
        .select()
        .from(contributions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(contributions.createdAt))
        .limit(input.limit)
        .offset(input.offset)
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [result] = await ctx.db
        .select()
        .from(contributions)
        .where(eq(contributions.id, input.id))
        .limit(1)
      return result ?? null
    }),
})
