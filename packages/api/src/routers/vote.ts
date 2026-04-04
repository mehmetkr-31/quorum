import { votes } from "@quorum/db"
import { desc } from "drizzle-orm"
import { z } from "zod"
import { publicProcedure } from "../index"

// ── Shared validators ────────────────────────────────────────────────────────

const aptosAddress = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/, "Invalid Aptos address format")

const aptosTxHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid Aptos transaction hash format")

const uuidV4 = z.string().uuid("Must be a valid UUID")

// ── Router ───────────────────────────────────────────────────────────────────

export const voteRouter = {
  listHistory: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).default(50).optional(),
        })
        .optional(),
    )
    .handler(async ({ input, context: ctx }) => {
      return ctx.db
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
    }),

  cast: publicProcedure
    .input(
      z.object({
        contributionId: uuidV4,
        voterAddress: aptosAddress,
        decision: z.enum(["approve", "reject", "improve"]),
        reason: z.string().max(1000).optional(),
        aptosTxHash: aptosTxHash,
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
      // We only record the vote here; the on-chain finalization (after voting window)
      // triggers the indexer to update status based on quorum threshold.

      return { id }
    }),
}
