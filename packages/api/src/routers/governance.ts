import { contributions, daoMemberships, members, receipts } from "@quorum/db"
import { count, desc, eq, sum } from "drizzle-orm"
import { z } from "zod"
import { publicProcedure } from "../index"

export const governanceRouter = {
  /** Global stats across all DAOs (backward compatible) */
  getStats: publicProcedure.handler(async ({ context: ctx }) => {
    const rows = await ctx.db.select({ value: count() }).from(contributions)
    const totalContribs = rows[0]?.value ?? 0

    const rowsMembers = await ctx.db.select({ value: count() }).from(members)
    const totalMembers = rowsMembers[0]?.value ?? 0

    const rowsRev = await ctx.db.select({ value: sum(receipts.amount) }).from(receipts)
    const totalRev = rowsRev[0]?.value ?? "0"

    return {
      totalContributions: totalContribs,
      totalMembers: totalMembers,
      totalRevenue: totalRev ? (Number(totalRev) / 100_000_000).toFixed(2) : "0.00",
    }
  }),

  /** Global member list (backward compatible) */
  listMembers: publicProcedure.handler(async ({ context: ctx }) => {
    return ctx.db.select().from(members).orderBy(desc(members.votingPower))
  }),

  /** Global leaderboard (backward compatible) */
  getLeaderboard: publicProcedure
    .input(z.object({ limit: z.number().default(10).optional() }).optional())
    .handler(async ({ input, context: ctx }) => {
      const rows = await ctx.db
        .select({
          address: members.address,
          votingPower: members.votingPower,
          approvedContributions: members.approvedContributions,
          totalContributions: members.totalContributions,
          joinedAt: members.joinedAt,
        })
        .from(members)
        .orderBy(desc(members.votingPower), desc(members.approvedContributions))
        .limit(input?.limit ?? 10)

      return rows.map((m) => ({
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
