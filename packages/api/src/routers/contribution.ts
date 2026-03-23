import { publicProcedure } from "../index";
import { z } from "zod";
import { contributions } from "@quorum/db";
import { eq } from "drizzle-orm";

export const contributionRouter = {
  submit: publicProcedure
    .input(z.object({
      datasetId: z.string(),
      contributorAddress: z.string(),
      shelbyAccount: z.string(),
      data: z.string(), // base64
      contentType: z.string().default("application/octet-stream").optional(),
    }))
    .handler(async ({ input, context: ctx }) => {
      const buffer = Buffer.from(input.data, "base64");
      const res = await ctx.shelbyClient.upload(buffer, input.contentType);
      
      const id = crypto.randomUUID();
      await ctx.db.insert(contributions).values({
        id,
        datasetId: input.datasetId,
        contributorAddress: input.contributorAddress,
        shelbyAccount: res.shelbyAccount,
        shelbyBlobName: res.blobName,
        dataHash: res.dataHash,
        createdAt: new Date(),
      });
      
      return {
        id,
        shelbyAccount: res.shelbyAccount,
        shelbyBlobName: res.blobName,
        dataHash: res.dataHash,
      };
    }),

  confirmOnChain: publicProcedure
    .input(z.object({
      id: z.string(),
      aptosTxHash: z.string(),
    }))
    .handler(async ({ input, context: ctx }) => {
      await ctx.db
        .update(contributions)
        .set({ aptosTxHash: input.aptosTxHash })
        .where(eq(contributions.id, input.id));
      return { success: true };
    }),

  list: publicProcedure
    .input(z.object({
      status: z.enum(["pending", "approved", "rejected"]).optional(),
      contributorAddress: z.string().optional(),
      limit: z.number().default(50).optional(),
    }).optional())
    .handler(async ({ input, context: ctx }) => {
      // For simplicity, we filter in memory or add dynamic where later
      const rows = await ctx.db.select().from(contributions).limit(input?.limit ?? 50);
      return rows;
    }),
};
