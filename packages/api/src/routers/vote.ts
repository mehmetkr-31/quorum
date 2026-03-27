import { votes } from "@quorum/db"
import { desc } from "drizzle-orm"
import { z } from "zod"
import { protectedProcedure, publicProcedure } from "../index"

export const voteRouter = {
  listHistory: publicProcedure
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
          id: votes.id,
          contributionId: votes.contributionId,
          voterAddress: votes.voterAddress,
          decision: votes.decision,
          votingPower: votes.votingPower,
          aptosTxHash: votes.aptosTxHash,
          createdAt: votes.createdAt,
        })
        .from(votes)
        .orderBy(desc(votes.createdAt))
        .limit(input?.limit ?? 50)

      return rows
    }),

  cast: publicProcedure
    .input(
      z.object({
        contributionId: z.string(),
        voterAddress: z.string(),
        decision: z.enum(["approve", "reject", "improve"]),
        reason: z.string().optional(),
        aptosTxHash: z.string(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const id = crypto.randomUUID()
      const votingPower = await ctx.aptosClient.getMemberVotingPower(input.voterAddress)

      await ctx.db.insert(votes).values({
        id,
        contributionId: input.contributionId,
        voterAddress: input.voterAddress,
        decision: input.decision,
        reason: input.reason,
        votingPower,
        aptosTxHash: input.aptosTxHash,
        createdAt: new Date(),
      })

      // Contribution status is managed by the indexer via ContributionFinalized events.
      // We only record the vote here; the on-chain finalization (after 48h voting window)
      // triggers the indexer to update status based on quorum threshold.

      return { id }
    }),
}
