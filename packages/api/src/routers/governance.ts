import { contributions, members, receipts } from "@quorum/db"
import { count, sum } from "drizzle-orm"
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
    return ctx.db.select().from(members).orderBy(members.votingPower)
  }),
}
