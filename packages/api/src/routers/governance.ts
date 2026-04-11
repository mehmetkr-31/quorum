import { contributions, daoMemberships, receipts } from "@quorum/db"
import { count, desc, eq, sum } from "drizzle-orm"
import { z } from "zod"
import { publicProcedure } from "../index"

type AggregatedMember = {
  address: string
  votingPower: number
  approvedContributions: number
  totalContributions: number
  joinedAt: Date
}

async function listAggregatedMembers(ctx: { db: any }): Promise<AggregatedMember[]> {
  const rows = await ctx.db
    .select({
      memberAddress: daoMemberships.memberAddress,
      votingPower: daoMemberships.votingPower,
      approvedContributions: daoMemberships.approvedContributions,
      totalContributions: daoMemberships.totalContributions,
      joinedAt: daoMemberships.joinedAt,
    })
    .from(daoMemberships)
    .orderBy(desc(daoMemberships.votingPower), desc(daoMemberships.approvedContributions))

  const merged = new Map<string, AggregatedMember>()

  for (const row of rows) {
    const existing = merged.get(row.memberAddress)
    if (!existing) {
      merged.set(row.memberAddress, {
        address: row.memberAddress,
        votingPower: row.votingPower,
        approvedContributions: row.approvedContributions,
        totalContributions: row.totalContributions,
        joinedAt: row.joinedAt,
      })
      continue
    }

    existing.votingPower = Math.max(existing.votingPower, row.votingPower)
    existing.approvedContributions += row.approvedContributions
    existing.totalContributions += row.totalContributions
    if (row.joinedAt < existing.joinedAt) existing.joinedAt = row.joinedAt
  }

  return Array.from(merged.values()).sort(
    (a, b) => b.votingPower - a.votingPower || b.approvedContributions - a.approvedContributions,
  )
}

export const governanceRouter = {
  /** Global stats across all DAOs, derived from DAO memberships */
  getStats: publicProcedure.handler(async ({ context: ctx }) => {
    const rows = await ctx.db.select({ value: count() }).from(contributions)
    const totalContribs = rows[0]?.value ?? 0

    const membershipRows = await ctx.db
      .select({ memberAddress: daoMemberships.memberAddress })
      .from(daoMemberships)
    const totalMembers = new Set(membershipRows.map((row) => row.memberAddress)).size

    const rowsRev = await ctx.db.select({ value: sum(receipts.amount) }).from(receipts)
    const totalRev = rowsRev[0]?.value ?? "0"

    return {
      totalContributions: totalContribs,
      totalMembers: totalMembers,
      totalRevenue: totalRev ? (Number(totalRev) / 100_000_000).toFixed(2) : "0.00",
    }
  }),

  /** Global member list aggregated from DAO memberships */
  listMembers: publicProcedure.handler(async ({ context: ctx }) => {
    return listAggregatedMembers(ctx)
  }),

  /** Global leaderboard aggregated from DAO memberships */
  getLeaderboard: publicProcedure
    .input(z.object({ limit: z.number().default(10).optional() }).optional())
    .handler(async ({ input, context: ctx }) => {
      const rows = await listAggregatedMembers(ctx)
      const limited = rows.slice(0, input?.limit ?? 10)

      return limited.map((m) => ({
        ...m,
        accuracy:
          m.totalContributions > 0
            ? Math.round((m.approvedContributions / m.totalContributions) * 100)
            : 0,
      }))
    }),

  /** DAO-scoped leaderboard */
  getDaoLeaderboard: publicProcedure
    .input(
      z.object({
        daoId: z.string(),
        limit: z.number().default(10).optional(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const rows = await ctx.db
        .select({
          memberAddress: daoMemberships.memberAddress,
          votingPower: daoMemberships.votingPower,
          approvedContributions: daoMemberships.approvedContributions,
          totalContributions: daoMemberships.totalContributions,
          role: daoMemberships.role,
          joinedAt: daoMemberships.joinedAt,
        })
        .from(daoMemberships)
        .where(eq(daoMemberships.daoId, input.daoId))
        .orderBy(desc(daoMemberships.votingPower), desc(daoMemberships.approvedContributions))
        .limit(input.limit ?? 10)

      return rows.map((m) => ({
        ...m,
        accuracy:
          m.totalContributions > 0
            ? Math.round((m.approvedContributions / m.totalContributions) * 100)
            : 0,
      }))
    }),
}
