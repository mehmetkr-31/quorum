import { daoMemberships, daos, delegations, proposals, proposalVotes } from "@quorum/db"
import { and, count, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { publicProcedure } from "../index"

// ── Shared validators ────────────────────────────────────────────────────────
const aptosAddress = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/, "Invalid Aptos address format")
const aptosTxHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid Aptos transaction hash format")
const uuidV4 = z.string().uuid()

// ── Router ───────────────────────────────────────────────────────────────────

export const proposalRouter = {
  /** Create a governance proposal */
  create: publicProcedure
    .input(
      z.object({
        daoId: z.string(),
        proposerAddress: aptosAddress,
        proposalType: z.number().int().min(0).max(2).default(2),
        title: z.string().min(3).max(200).trim(),
        description: z.string().max(5000).default(""),
        /** JSON payload — for ParameterChange: {quorumThreshold?, votingWindowSeconds?} */
        payload: z.record(z.string(), z.unknown()).default({}),
        aptosTxHash: aptosTxHash.optional(),
        /** Voting deadline (ms since epoch). Defaults to DAO's votingWindowSeconds from now */
        votingDeadlineMs: z.number().int().positive().optional(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      // Verify DAO + proposer is member
      const [dao] = await ctx.db.select().from(daos).where(eq(daos.id, input.daoId)).limit(1)
      if (!dao) throw new Error("DAO not found")

      const [membership] = await ctx.db
        .select()
        .from(daoMemberships)
        .where(
          and(
            eq(daoMemberships.daoId, input.daoId),
            eq(daoMemberships.memberAddress, input.proposerAddress),
          ),
        )
        .limit(1)
      if (!membership) throw new Error("Only DAO members can create proposals")

      const id = crypto.randomUUID()
      const now = new Date()
      const deadlineMs = input.votingDeadlineMs ?? Date.now() + dao.votingWindowSeconds * 1000

      await ctx.db.insert(proposals).values({
        id,
        daoId: input.daoId,
        proposerAddress: input.proposerAddress,
        proposalType: input.proposalType,
        title: input.title,
        description: input.description,
        payload: JSON.stringify(input.payload),
        status: "active",
        aptosTxHash: input.aptosTxHash,
        votingDeadline: new Date(deadlineMs),
        createdAt: now,
      })

      return { id }
    }),

  /** List proposals for a DAO */
  list: publicProcedure
    .input(
      z.object({
        daoId: z.string(),
        status: z.enum(["active", "passed", "rejected", "executed"]).optional(),
        limit: z.number().int().min(1).max(100).default(50).optional(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const baseFilter = eq(proposals.daoId, input.daoId)
      const whereClause = input.status
        ? and(baseFilter, eq(proposals.status, input.status))
        : baseFilter

      return ctx.db
        .select()
        .from(proposals)
        .where(whereClause)
        .orderBy(desc(proposals.createdAt))
        .limit(input.limit ?? 50)
    }),

  /** Get a single proposal */
  get: publicProcedure
    .input(z.object({ proposalId: uuidV4 }))
    .handler(async ({ input, context: ctx }) => {
      const [proposal] = await ctx.db
        .select()
        .from(proposals)
        .where(eq(proposals.id, input.proposalId))
        .limit(1)
      if (!proposal) throw new Error("Proposal not found")
      return {
        ...proposal,
        payload: JSON.parse(proposal.payload) as Record<string, unknown>,
      }
    }),

  /** Cast a vote on a proposal */
  vote: publicProcedure
    .input(
      z.object({
        proposalId: uuidV4,
        voterAddress: aptosAddress,
        support: z.boolean(),
        aptosTxHash: aptosTxHash,
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      // Verify proposal exists and is active
      const [proposal] = await ctx.db
        .select()
        .from(proposals)
        .where(eq(proposals.id, input.proposalId))
        .limit(1)
      if (!proposal) throw new Error("Proposal not found")
      if (proposal.status !== "active") throw new Error("Proposal is not active")
      if (new Date() > proposal.votingDeadline) throw new Error("Voting period has ended")

      // Verify membership and get voting power
      const [membership] = await ctx.db
        .select()
        .from(daoMemberships)
        .where(
          and(
            eq(daoMemberships.daoId, proposal.daoId),
            eq(daoMemberships.memberAddress, input.voterAddress),
          ),
        )
        .limit(1)
      if (!membership) throw new Error("Only DAO members can vote on proposals")

      // Check if already voted
      const [existing] = await ctx.db
        .select({ id: proposalVotes.id })
        .from(proposalVotes)
        .where(
          and(
            eq(proposalVotes.proposalId, input.proposalId),
            eq(proposalVotes.voterAddress, input.voterAddress),
          ),
        )
        .limit(1)
      if (existing) throw new Error("Already voted on this proposal")

      // Get effective VP (base + delegated)
      const [delegation] = await ctx.db
        .select({ delegatedPower: delegations.delegatedPower })
        .from(delegations)
        .where(
          and(
            eq(delegations.daoId, proposal.daoId),
            eq(delegations.delegateeAddress, input.voterAddress),
          ),
        )
        .limit(1)
      const delegatedPower = delegation?.delegatedPower ?? 0
      const effectiveVP = membership.votingPower + delegatedPower

      const id = crypto.randomUUID()
      await ctx.db.insert(proposalVotes).values({
        id,
        proposalId: input.proposalId,
        voterAddress: input.voterAddress,
        support: input.support,
        votingPower: effectiveVP,
        aptosTxHash: input.aptosTxHash,
        createdAt: new Date(),
      })

      // Update proposal tallies
      await ctx.db
        .update(proposals)
        .set({
          totalPower: proposal.totalPower + effectiveVP,
          yesPower: input.support ? proposal.yesPower + effectiveVP : proposal.yesPower,
          noPower: !input.support ? proposal.noPower + effectiveVP : proposal.noPower,
        })
        .where(eq(proposals.id, input.proposalId))

      return { id, votingPower: effectiveVP }
    }),

  /** Finalize a proposal — update status based on vote results */
  finalize: publicProcedure
    .input(
      z.object({
        proposalId: uuidV4,
        aptosTxHash: aptosTxHash.optional(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const [proposal] = await ctx.db
        .select()
        .from(proposals)
        .where(eq(proposals.id, input.proposalId))
        .limit(1)
      if (!proposal) throw new Error("Proposal not found")
      if (proposal.status !== "active") throw new Error("Already finalized")
      if (new Date() <= proposal.votingDeadline) throw new Error("Voting still open")

      const [dao] = await ctx.db
        .select({ quorumThreshold: daos.quorumThreshold })
        .from(daos)
        .where(eq(daos.id, proposal.daoId))
        .limit(1)
      const threshold = dao?.quorumThreshold ?? 60

      const passed =
        proposal.totalPower > 0 && (proposal.yesPower * 100) / proposal.totalPower >= threshold

      const newStatus = passed ? (proposal.proposalType === 0 ? "executed" : "passed") : "rejected"

      await ctx.db
        .update(proposals)
        .set({ status: newStatus, aptosTxHash: input.aptosTxHash })
        .where(eq(proposals.id, input.proposalId))

      // If ParameterChange passed, apply changes to DAO
      if (passed && proposal.proposalType === 0) {
        const payload = JSON.parse(proposal.payload) as {
          quorumThreshold?: number
          votingWindowSeconds?: number
        }
        const update: Partial<{ quorumThreshold: number; votingWindowSeconds: number }> = {}
        if (
          payload.quorumThreshold != null &&
          payload.quorumThreshold >= 1 &&
          payload.quorumThreshold <= 100
        ) {
          update.quorumThreshold = payload.quorumThreshold
        }
        if (payload.votingWindowSeconds != null && payload.votingWindowSeconds >= 60) {
          update.votingWindowSeconds = payload.votingWindowSeconds
        }
        if (Object.keys(update).length > 0) {
          await ctx.db.update(daos).set(update).where(eq(daos.id, proposal.daoId))
        }
      }

      return { passed, status: newStatus }
    }),

  /** Get vote history for a proposal */
  listVotes: publicProcedure
    .input(
      z.object({
        proposalId: uuidV4,
        limit: z.number().int().min(1).max(200).default(50).optional(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      return ctx.db
        .select()
        .from(proposalVotes)
        .where(eq(proposalVotes.proposalId, input.proposalId))
        .orderBy(desc(proposalVotes.createdAt))
        .limit(input.limit ?? 50)
    }),

  /** Check if an address has voted on a proposal */
  hasVoted: publicProcedure
    .input(
      z.object({
        proposalId: uuidV4,
        voterAddress: aptosAddress,
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const [existing] = await ctx.db
        .select({ id: proposalVotes.id, support: proposalVotes.support })
        .from(proposalVotes)
        .where(
          and(
            eq(proposalVotes.proposalId, input.proposalId),
            eq(proposalVotes.voterAddress, input.voterAddress),
          ),
        )
        .limit(1)
      return existing ?? null
    }),

  /** Get DAO governance stats */
  getStats: publicProcedure
    .input(z.object({ daoId: z.string() }))
    .handler(async ({ input, context: ctx }) => {
      const [totalCount] = await ctx.db
        .select({ value: count() })
        .from(proposals)
        .where(eq(proposals.daoId, input.daoId))

      const [activeCount] = await ctx.db
        .select({ value: count() })
        .from(proposals)
        .where(and(eq(proposals.daoId, input.daoId), eq(proposals.status, "active")))

      const [passedCount] = await ctx.db
        .select({ value: count() })
        .from(proposals)
        .where(and(eq(proposals.daoId, input.daoId), eq(proposals.status, "passed")))

      return {
        total: totalCount?.value ?? 0,
        active: activeCount?.value ?? 0,
        passed: passedCount?.value ?? 0,
      }
    }),
}
