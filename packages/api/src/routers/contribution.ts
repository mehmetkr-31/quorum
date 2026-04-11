import { contributions, datasets } from "@quorum/db"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { assertSessionWallet, protectedProcedure, publicProcedure } from "../index"

// ── Shared validators ────────────────────────────────────────────────────────

/** Aptos address: 0x followed by 1–64 hex chars */
const aptosAddress = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/, "Invalid Aptos address format")

/** Aptos tx hash: 0x followed by exactly 64 hex chars */
const aptosTxHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid Aptos transaction hash format")

/** UUID v4 */
const uuidV4 = z.string().uuid("Must be a valid UUID")

/** base64-encoded data — max 50 MB decoded */
const MAX_DATA_BYTES = 50 * 1024 * 1024 // 50 MB
const base64Data = z
  .string()
  .min(1, "Data cannot be empty")
  .refine(
    (s) => {
      // Each base64 char represents 6 bits; 4 chars = 3 bytes
      const approxBytes = Math.ceil((s.length * 3) / 4)
      return approxBytes <= MAX_DATA_BYTES
    },
    { message: "Data exceeds 50 MB limit" },
  )

// ── Router ───────────────────────────────────────────────────────────────────

export const contributionRouter = {
  submit: protectedProcedure
    .input(
      z.object({
        datasetId: uuidV4,
        shelbyAccount: z.string().min(1).max(500),
        contributorAddress: aptosAddress,
        data: base64Data,
        contentType: z
          .string()
          .regex(/^[\w.-]+\/[\w.+\-*]+$/, "Invalid content type")
          .default("application/octet-stream")
          .optional(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      assertSessionWallet(ctx, input.contributorAddress)

      // Verify dataset exists before upload
      const [dataset] = await ctx.db
        .select({ id: datasets.id })
        .from(datasets)
        .where(eq(datasets.id, input.datasetId))
        .limit(1)
      if (!dataset) throw new Error("Dataset not found")

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

  confirmOnChain: protectedProcedure
    .input(
      z.object({
        id: uuidV4,
        aptosTxHash: aptosTxHash,
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const [contribution] = await ctx.db
        .select({ contributorAddress: contributions.contributorAddress })
        .from(contributions)
        .where(eq(contributions.id, input.id))
        .limit(1)

      if (!contribution) throw new Error("Contribution not found")
      assertSessionWallet(ctx, contribution.contributorAddress)

      await ctx.db
        .update(contributions)
        .set({ aptosTxHash: input.aptosTxHash })
        .where(eq(contributions.id, input.id))
      return { success: true }
    }),

  getContent: publicProcedure
    .input(z.object({ id: uuidV4 }))
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
        walletAddress: aptosAddress,
        limit: z.number().int().min(1).max(200).default(50).optional(),
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
          contributorAddress: aptosAddress.optional(),
          limit: z.number().int().min(1).max(200).default(50).optional(),
        })
        .optional(),
    )
    .handler(async ({ input, context: ctx }) => {
      const filters = []
      if (input?.status) filters.push(eq(contributions.status, input.status))
      if (input?.contributorAddress)
        filters.push(eq(contributions.contributorAddress, input.contributorAddress))

      return ctx.db
        .select()
        .from(contributions)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .limit(input?.limit ?? 50)
    }),
}
