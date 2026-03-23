import { publicProcedure } from "../index";
import { members, contributions, receipts } from "@quorum/db";
import { count, sum } from "drizzle-orm";

export const governanceRouter = {
  getStats: publicProcedure.handler(async ({ context: ctx }) => {
    const [totalContribs] = await ctx.db.select({ value: count() }).from(contributions);
    const [totalMembers] = await ctx.db.select({ value: count() }).from(members);
    const [totalRev] = await ctx.db.select({ value: sum(receipts.amount) }).from(receipts);

    return {
      totalContributions: totalContribs.value,
      totalMembers: totalMembers.value,
      totalRevenue: totalRev.value ? (Number(totalRev.value) / 100_000_000).toFixed(2) : "0.00",
    };
  }),

  listMembers: publicProcedure.handler(async ({ context: ctx }) => {
    return ctx.db.select().from(members).orderBy(members.votingPower);
  }),
};
