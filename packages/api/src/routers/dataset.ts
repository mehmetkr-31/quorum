import { datasets } from "@quorum/db"
import { z } from "zod"
import { publicProcedure } from "../index"

export const datasetRouter = {
  create: publicProcedure
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
      return ctx.db
        .select()
        .from(datasets)
        .limit(input?.limit ?? 50)
    }),
}
