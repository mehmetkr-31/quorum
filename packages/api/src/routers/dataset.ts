import { contributions, datasets } from "@quorum/db"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import { protectedProcedure, publicProcedure } from "../index"

export const datasetRouter = {
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        ownerAddress: z.string(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const id = crypto.randomUUID()
      await ctx.db.insert(datasets).values({
        id,
        name: input.name,
        description: input.description,
        ownerAddress: input.ownerAddress,
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
}
