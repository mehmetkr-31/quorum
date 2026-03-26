import { contributions, members, receipts } from "@quorum/db"
import { count, desc, sum } from "drizzle-orm"
import { z } from "zod"
import { publicProcedure } from "../index"

export const governanceRouter = {
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

  listMembers: publicProcedure.handler(async ({ context: ctx }) => {
    return ctx.db.select().from(members).orderBy(desc(members.votingPower))
  }),

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
}
