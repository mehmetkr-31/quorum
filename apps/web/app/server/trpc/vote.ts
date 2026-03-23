import { randomUUID } from "crypto"
import { and, desc, eq } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { contributions, votes } from "@quorum/db"
import { publicProcedure, router } from "./trpc"

const DECISION_MAP = { approve: 0, reject: 1, improve: 2 } as const

export const voteRouter = router({
  /**
   * Record a vote. The client must have already submitted the Aptos cast_vote tx
   * and passes back the tx hash for DB indexing.
   * decision: 0=approve 1=reject 2=improve (mirrors Move contract)
   */
  cast: publicProcedure
    .input(
      z.object({
        contributionId: z.string().uuid(),
        voterAddress: z.string().min(1),
        decision: z.enum(["approve", "reject", "improve"]),
        reason: z.string().max(500).optional(),
        aptosTxHash: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate contribution exists and is still pending
      const [contribution] = await ctx.db
        .select()
        .from(contributions)
        .where(eq(contributions.id, input.contributionId))
        .limit(1)

      if (!contribution) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contribution not found" })
      }
      if (contribution.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Contribution is already ${contribution.status}`,
        })
      }

      // Prevent duplicate vote at DB level (chain enforces it too, but fail fast)
      const [existingVote] = await ctx.db
        .select()
        .from(votes)
        .where(
          and(
            eq(votes.contributionId, input.contributionId),
            eq(votes.voterAddress, input.voterAddress),
          ),
        )
        .limit(1)

      if (existingVote) {
        throw new TRPCError({ code: "CONFLICT", message: "Already voted on this contribution" })
      }

      const votingPower = await ctx.aptosClient.getMemberVotingPower(input.voterAddress)
      if (votingPower === 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a DAO member" })
      }

      const id = randomUUID()
      await ctx.db.insert(votes).values({
        id,
        contributionId: input.contributionId,
        voterAddress: input.voterAddress,
        decision: input.decision,
        reason: input.reason ?? null,
        votingPower,
        aptosTxHash: input.aptosTxHash,
        createdAt: new Date(),
      })

      return { id, votingPower, decisionValue: DECISION_MAP[input.decision] }
    }),

  list: publicProcedure
    .input(
      z.object({
        contributionId: z.string().optional(),
        voterAddress: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input.contributionId) conditions.push(eq(votes.contributionId, input.contributionId))
      if (input.voterAddress) conditions.push(eq(votes.voterAddress, input.voterAddress))

      return ctx.db
        .select()
        .from(votes)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(votes.createdAt))
        .limit(input.limit)
        .offset(input.offset)
    }),
})
