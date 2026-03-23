import { publicProcedure } from "../index";
import { z } from "zod";
import { votes } from "@quorum/db";

export const voteRouter = {
  cast: publicProcedure
    .input(z.object({
      contributionId: z.string(),
      voterAddress: z.string(),
      decision: z.enum(["approve", "reject", "improve"]),
      reason: z.string().optional(),
      aptosTxHash: z.string(),
    }))
    .handler(async ({ input, context: ctx }) => {
      const id = crypto.randomUUID();
      const votingPower = await ctx.aptosClient.getMemberVotingPower(input.voterAddress);
      
      await ctx.db.insert(votes).values({
        id,
        contributionId: input.contributionId,
        voterAddress: input.voterAddress,
        decision: input.decision,
        reason: input.reason,
        votingPower,
        aptosTxHash: input.aptosTxHash,
        createdAt: new Date(),
      });
      
      return { id };
    }),
};
