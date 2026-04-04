import { daoMemberships, delegations } from "@quorum/db"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { publicProcedure } from "../index"

const aptosAddress = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/, "Invalid Aptos address format")
const aptosTxHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid Aptos transaction hash format")

export const delegationRouter = {
  /** Delegate voting power to another DAO member */
  delegate: publicProcedure
    .input(
      z.object({
        daoId: z.string(),
        delegatorAddress: aptosAddress,
        delegateeAddress: aptosAddress,
        aptosTxHash: aptosTxHash,
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      if (input.delegatorAddress === input.delegateeAddress) {
        throw new Error("Cannot delegate to yourself")
      }

      // Verify both are DAO members
      const [delegatorMembership] = await ctx.db
        .select({ votingPower: daoMemberships.votingPower })
        .from(daoMemberships)
        .where(
          and(
            eq(daoMemberships.daoId, input.daoId),
            eq(daoMemberships.memberAddress, input.delegatorAddress),
          ),
        )
        .limit(1)
      if (!delegatorMembership) throw new Error("Delegator is not a DAO member")

      const [delegateeMembership] = await ctx.db
        .select({ id: daoMemberships.id })
        .from(daoMemberships)
        .where(
          and(
            eq(daoMemberships.daoId, input.daoId),
            eq(daoMemberships.memberAddress, input.delegateeAddress),
          ),
        )
        .limit(1)
      if (!delegateeMembership) throw new Error("Delegatee is not a DAO member")

      const delegatedPower = delegatorMembership.votingPower

      // Remove existing delegation from delegator in this DAO
      await ctx.db
        .delete(delegations)
        .where(
          and(
            eq(delegations.daoId, input.daoId),
            eq(delegations.delegatorAddress, input.delegatorAddress),
          ),
        )

      // Insert new delegation
      const id = crypto.randomUUID()
      await ctx.db.insert(delegations).values({
        id,
        daoId: input.daoId,
        delegatorAddress: input.delegatorAddress,
        delegateeAddress: input.delegateeAddress,
        delegatedPower,
        aptosTxHash: input.aptosTxHash,
        createdAt: new Date(),
      })

      return { id, delegatedPower }
    }),

  /** Revoke delegation */
  revoke: publicProcedure
    .input(
      z.object({
        daoId: z.string(),
        delegatorAddress: aptosAddress,
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const [existing] = await ctx.db
        .select({ id: delegations.id })
        .from(delegations)
        .where(
          and(
            eq(delegations.daoId, input.daoId),
            eq(delegations.delegatorAddress, input.delegatorAddress),
          ),
        )
        .limit(1)
      if (!existing) throw new Error("No active delegation found")

      await ctx.db
        .delete(delegations)
        .where(
          and(
            eq(delegations.daoId, input.daoId),
            eq(delegations.delegatorAddress, input.delegatorAddress),
          ),
        )

      return { revoked: true }
    }),

  /** Get current delegation for an address in a DAO */
  get: publicProcedure
    .input(
      z.object({
        daoId: z.string(),
        delegatorAddress: aptosAddress,
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const [delegation] = await ctx.db
        .select()
        .from(delegations)
        .where(
          and(
            eq(delegations.daoId, input.daoId),
            eq(delegations.delegatorAddress, input.delegatorAddress),
          ),
        )
        .limit(1)
      return delegation ?? null
    }),

  /** List all delegates who have delegated to this address in a DAO */
  listDelegators: publicProcedure
    .input(
      z.object({
        daoId: z.string(),
        delegateeAddress: aptosAddress,
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      return ctx.db
        .select()
        .from(delegations)
        .where(
          and(
            eq(delegations.daoId, input.daoId),
            eq(delegations.delegateeAddress, input.delegateeAddress),
          ),
        )
    }),
}
