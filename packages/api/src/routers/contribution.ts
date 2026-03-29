import { contributions } from "@quorum/db"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { publicProcedure } from "../index"

export const contributionRouter = {
  submit: publicProcedure
    .input(
      z.object({
        datasetId: z.string(),
        shelbyAccount: z.string(), // kept for API compatibility, overridden by server signer
        contributorAddress: z.string(),
        data: z.string(), // base64
        contentType: z.string().default("application/octet-stream").optional(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const id = crypto.randomUUID()
      const blobName = `contributions/${input.datasetId}/${id}`
      const buffer = Buffer.from(input.data, "base64")

      const { shelbyAccount, dataHash } = await ctx.shelbyClient.upload(
        buffer,
        blobName,
        input.contentType,
      )

      await ctx.db.insert(contributions).values({
        id,
        datasetId: input.datasetId,
        contributorAddress: input.contributorAddress,
        shelbyAccount,
        shelbyBlobName: blobName,
        dataHash,
        createdAt: new Date(),
      })

      return { id, shelbyAccount, shelbyBlobName: blobName, dataHash }
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
        const data = await ctx.shelbyClient.download(
          contribution.shelbyAccount,
          contribution.shelbyBlobName,
        )
        return {
          data: data.toString("base64"),
          contentType: "application/octet-stream",
          error: null,
        }
      } catch (e: unknown) {
        console.error(`Failed to read blob from Shelby: ${contribution.shelbyBlobName}`, e)
        return { data: null, contentType: null, error: "Content not available" }
      }
    }),

  listMine: publicProcedure
    .input(
      z.object({
        walletAddress: z.string(),
        limit: z.number().default(50).optional(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      return ctx.db
        .select()
        .from(contributions)
        .where(eq(contributions.contributorAddress, input.walletAddress))
        .limit(input.limit ?? 50)
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
