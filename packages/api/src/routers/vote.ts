import { contributions, daoMemberships, datasets, votes } from "@quorum/db"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { assertSessionWallet, protectedProcedure, publicProcedure } from "../index"

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

  cast: protectedProcedure
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
      assertSessionWallet(ctx, input.voterAddress)

      const [contribution] = await ctx.db
        .select({ daoId: datasets.daoId })
        .from(contributions)
        .innerJoin(datasets, eq(contributions.datasetId, datasets.id))
        .where(eq(contributions.id, input.contributionId))
        .limit(1)

      if (!contribution) throw new Error("Contribution not found")

      const [membership] = await ctx.db
        .select({ votingPower: daoMemberships.votingPower })
        .from(daoMemberships)
        .where(
          and(
            eq(daoMemberships.daoId, contribution.daoId),
            eq(daoMemberships.memberAddress, input.voterAddress),
          ),
        )
        .limit(1)

      if (!membership) throw new Error("Only DAO members can vote")

      const [existing] = await ctx.db
        .select({ id: votes.id, votingPower: votes.votingPower })
        .from(votes)
        .where(
          and(
            eq(votes.contributionId, input.contributionId),
            eq(votes.voterAddress, input.voterAddress),
          ),
        )
        .limit(1)

      if (existing) {
        return { id: existing.id, votingPower: existing.votingPower }
      }

      const id = crypto.randomUUID()
      const votingPower = membership.votingPower

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
