import { contributions } from "@quorum/db"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { protectedProcedure, publicProcedure } from "../index"

export const contributionRouter = {
  submit: protectedProcedure
    .input(
      z.object({
        datasetId: z.string(),
        shelbyAccount: z.string(),
        data: z.string(), // base64
        contentType: z.string().default("application/octet-stream").optional(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const buffer = Buffer.from(input.data, "base64")
      const res = await ctx.shelbyClient.upload(buffer, input.contentType)

      const id = crypto.randomUUID()
      await ctx.db.insert(contributions).values({
        id,
        datasetId: input.datasetId,
        contributorAddress: ctx.session.walletAddress,
        shelbyAccount: input.shelbyAccount || res.shelbyAccount,
        shelbyBlobName: res.blobName,
        dataHash: res.dataHash,
        createdAt: new Date(),
      })

      return {
        id,
        shelbyAccount: res.shelbyAccount,
        shelbyBlobName: res.blobName,
        dataHash: res.dataHash,
      }
    }),

  confirmOnChain: publicProcedure
    .input(
      z.object({
        id: z.string(),
        aptosTxHash: z.string(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      await ctx.db
        .update(contributions)
        .set({ aptosTxHash: input.aptosTxHash })
        .where(eq(contributions.id, input.id))
      return { success: true }
    }),

  getContent: publicProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context: ctx }) => {
      const rows = await ctx.db
        .select()
        .from(contributions)
        .where(eq(contributions.id, input.id))
        .limit(1)

      const contribution = rows[0]
      if (!contribution) throw new Error("Contribution not found")

      try {
        const res = await ctx.shelbyClient.read(contribution.shelbyBlobName)
        const base64 = Buffer.from(res.data).toString("base64")
        return {
          data: base64,
          contentType: res.contentType,
        }
      } catch (e: unknown) {
        console.error(`Failed to read blob from Shelby: ${contribution.shelbyBlobName}`, e)
        throw new Error("Failed to fetch content from Shelby Protocol")
      }
    }),

  listMine: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().default(50).optional(),
        })
        .optional(),
    )
    .handler(async ({ input, context: ctx }) => {
      return ctx.db
        .select()
        .from(contributions)
        .where(eq(contributions.contributorAddress, ctx.session.walletAddress))
        .limit(input?.limit ?? 50)
    }),

  list: publicProcedure
    .input(
      z
        .object({
          status: z.enum(["pending", "approved", "rejected"]).optional(),
          contributorAddress: z.string().optional(),
          limit: z.number().default(50).optional(),
        })
        .optional(),
    )
    .handler(async ({ input, context: ctx }) => {
      const filters = []
      if (input?.status) filters.push(eq(contributions.status, input.status))
      if (input?.contributorAddress)
        filters.push(eq(contributions.contributorAddress, input.contributorAddress))

      const rows = await ctx.db
        .select()
        .from(contributions)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .limit(input?.limit ?? 50)
      return rows
    }),
}
