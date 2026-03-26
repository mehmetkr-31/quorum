import { contributions, votes } from "@quorum/db"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import { publicProcedure } from "../index"

export const voteRouter = {
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

      // Fix Issue 4: Update contribution local state
      // For now, any approval vote increments weight and sets to approved
      // In a real DAO, this would happen after quorum threshold is reached
      if (input.decision === "approve") {
        await ctx.db
          .update(contributions)
          .set({
            status: "approved",
            weight: sql`${contributions.weight} + ${votingPower}`,
          })
          .where(eq(contributions.id, input.contributionId))
      } else if (input.decision === "reject") {
        // Simple rejection logic: one reject vote for now (or threshold)
        await ctx.db
          .update(contributions)
          .set({ status: "rejected" })
          .where(eq(contributions.id, input.contributionId))
      }

      return { id }
    }),
}
