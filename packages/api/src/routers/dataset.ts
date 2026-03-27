import { contributions, datasets } from "@quorum/db"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { protectedProcedure, publicProcedure } from "../index"

export const datasetRouter = {
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const id = crypto.randomUUID()
      await ctx.db.insert(datasets).values({
        id,
        name: input.name,
        description: input.description,
        ownerAddress: ctx.session.walletAddress,
        createdAt: new Date(),
      })
      return { id }
    }),

  list: publicProcedure
    .input(
      z
        .object({
          limit: z.number().default(50).optional(),
        })
        .optional(),
    )
    .handler(async ({ input, context: ctx }) => {
      const rows = await ctx.db
        .select({
          id: datasets.id,
          name: datasets.name,
          description: datasets.description,
          ownerAddress: datasets.ownerAddress,
          createdAt: datasets.createdAt,
          totalWeight: datasets.totalWeight,
          contributionCount: sql<number>`count(${contributions.id})`.mapWith(Number),
          lastActivity: sql<Date | null>`max(${contributions.createdAt})`,
        })
        .from(datasets)
        .leftJoin(contributions, eq(datasets.id, contributions.datasetId))
        .groupBy(datasets.id)
        .limit(input?.limit ?? 50)

      return rows
    }),

  // HuggingFace-compatible JSONL export — approved contributions only
  export: publicProcedure
    .input(z.object({ datasetId: z.string() }))
    .handler(async ({ input, context: ctx }) => {
      const [dataset] = await ctx.db
        .select()
        .from(datasets)
        .where(eq(datasets.id, input.datasetId))
        .limit(1)

      if (!dataset) throw new Error("Dataset not found")

      const rows = await ctx.db
        .select({
          id: contributions.id,
          contributorAddress: contributions.contributorAddress,
          shelbyAccount: contributions.shelbyAccount,
          shelbyBlobName: contributions.shelbyBlobName,
          dataHash: contributions.dataHash,
          weight: contributions.weight,
          aptosTxHash: contributions.aptosTxHash,
          createdAt: contributions.createdAt,
        })
        .from(contributions)
        .where(
          and(eq(contributions.datasetId, input.datasetId), eq(contributions.status, "approved")),
        )

      return rows.map((r) => ({
        id: r.id,
        dataset_id: input.datasetId,
        dataset_name: dataset.name,
        contributor: r.contributorAddress,
        shelby_account: r.shelbyAccount,
        shelby_blob: r.shelbyBlobName,
        data_hash: r.dataHash,
        weight: r.weight,
        aptos_tx: r.aptosTxHash,
        created_at: r.createdAt,
        source: "quorum-dao",
      }))
    }),
}
