import { stakes } from "@quorum/db"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { assertSessionWallet, protectedProcedure, publicProcedure } from "../index"

const aptosAddress = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/, "Invalid Aptos address format")
const aptosTxHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid Aptos transaction hash format")

/** QRM amount: min 10 QRM in base units (8 decimals = 1_000_000_000) */
const MIN_STAKE = 1_000_000_000 // 10 QRM

export const stakingRouter = {
  /** Record a new stake (off-chain mirror of on-chain stake event) */
  stake: protectedProcedure
    .input(
      z.object({
        stakerAddress: aptosAddress,
        amount: z.number().int().min(MIN_STAKE),
        /** 0=30d, 1=90d, 2=180d */
        tier: z.number().int().min(0).max(2),
        aptosTxHash: aptosTxHash,
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      assertSessionWallet(ctx, input.stakerAddress)

      const BOOST_MAP = [150, 200, 300] // bps per tier
      const LOCKUP_DAYS = [30, 90, 180]

      const boostBps = BOOST_MAP[input.tier] ?? 150
      const lockupDays = LOCKUP_DAYS[input.tier] ?? 30
      const now = new Date()
      const unlockAt = new Date(now.getTime() + lockupDays * 24 * 60 * 60 * 1000)

      // Upsert: if staker exists, update; otherwise insert
      const [existing] = await ctx.db
        .select({ id: stakes.id })
        .from(stakes)
        .where(eq(stakes.stakerAddress, input.stakerAddress))
        .limit(1)

      const id = existing?.id ?? crypto.randomUUID()

      if (existing) {
        await ctx.db
          .update(stakes)
          .set({
            amount: input.amount,
            tier: input.tier,
            boostBps,
            stakedAt: now,
            unlockAt,
            aptosTxHash: input.aptosTxHash,
          })
          .where(eq(stakes.stakerAddress, input.stakerAddress))
      } else {
        await ctx.db.insert(stakes).values({
          id,
          stakerAddress: input.stakerAddress,
          amount: input.amount,
          tier: input.tier,
          boostBps,
          stakedAt: now,
          unlockAt,
          aptosTxHash: input.aptosTxHash,
        })
      }

      return { id, boostBps, unlockAt }
    }),

  /** Remove stake record (after on-chain unstake) */
  unstake: protectedProcedure
    .input(z.object({ stakerAddress: aptosAddress }))
    .handler(async ({ input, context: ctx }) => {
      assertSessionWallet(ctx, input.stakerAddress)

      await ctx.db.delete(stakes).where(eq(stakes.stakerAddress, input.stakerAddress))
      return { removed: true }
    }),

  /** Get stake info for an address */
  getStake: publicProcedure
    .input(z.object({ stakerAddress: aptosAddress }))
    .handler(async ({ input, context: ctx }) => {
      const [stake] = await ctx.db
        .select()
        .from(stakes)
        .where(eq(stakes.stakerAddress, input.stakerAddress))
        .limit(1)
      return stake ?? null
    }),

  /** Get boost multiplier for an address (returns 100 if not staking) */
  getBoost: publicProcedure
    .input(z.object({ stakerAddress: aptosAddress }))
    .handler(async ({ input, context: ctx }) => {
      const [stake] = await ctx.db
        .select({ boostBps: stakes.boostBps, unlockAt: stakes.unlockAt })
        .from(stakes)
        .where(eq(stakes.stakerAddress, input.stakerAddress))
        .limit(1)

      if (!stake) return { boostBps: 100, multiplier: "1.0x", staking: false }

      // Check if lock expired
      const expired = new Date() > stake.unlockAt
      const boostBps = expired ? 100 : stake.boostBps

      return {
        boostBps,
        multiplier: `${(boostBps / 100).toFixed(1)}x`,
        staking: !expired,
        unlockAt: stake.unlockAt,
      }
    }),
}
