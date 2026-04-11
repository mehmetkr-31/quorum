import { contributions, daoMemberships, daos, datasets } from "@quorum/db"
import { and, count, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { assertSessionWallet, protectedProcedure, publicProcedure } from "../index"

// ── Shared validators ────────────────────────────────────────────────────────

const aptosAddress = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/, "Invalid Aptos address format")

/** Slug: lowercase alphanumeric + hyphens, 2–60 chars */
const daoSlug = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Slug must be lowercase alphanumeric with hyphens")

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export const daoRouter = {
  /** Create a new DAO — anyone can launch a community dataset DAO */
  create: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(2).max(100).trim(),
        description: z.string().max(2000).optional(),
        slug: daoSlug.optional(),
        ownerAddress: aptosAddress,
        treasuryAddress: aptosAddress,
        imageUrl: z.string().url().max(500).optional(),
        votingWindowSeconds: z.number().int().min(60).max(604800).default(172800),
        quorumThreshold: z.number().int().min(1).max(100).default(60),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      assertSessionWallet(ctx, input.ownerAddress)

      const id = input.id ?? crypto.randomUUID()
      const slug = input.slug || slugify(input.name)

      const [existingById] = await ctx.db.select().from(daos).where(eq(daos.id, id)).limit(1)
      if (existingById) {
        return { id: existingById.id, slug: existingById.slug }
      }

      // Check slug uniqueness
      const existing = await ctx.db
        .select({ id: daos.id })
        .from(daos)
        .where(eq(daos.slug, slug))
        .limit(1)

      if (existing.length > 0) {
        throw new Error(`DAO slug "${slug}" is already taken`)
      }

      await ctx.db.insert(daos).values({
        id,
        name: input.name,
        description: input.description,
        slug,
        ownerAddress: input.ownerAddress,
        treasuryAddress: input.treasuryAddress,
        imageUrl: input.imageUrl,
        onChainId: id,
        votingWindowSeconds: input.votingWindowSeconds,
        quorumThreshold: input.quorumThreshold,
        createdAt: new Date(),
      })

      // Auto-add creator as owner member
      await ctx.db.insert(daoMemberships).values({
        id: crypto.randomUUID(),
        daoId: id,
        memberAddress: input.ownerAddress,
        votingPower: 10,
        role: "owner",
        joinedAt: new Date(),
      })

      return { id, slug }
    }),

  /** Get a single DAO by slug or ID */
  get: publicProcedure
    .input(z.object({ slugOrId: z.string() }))
    .handler(async ({ input, context: ctx }) => {
      const [dao] = await ctx.db.select().from(daos).where(eq(daos.slug, input.slugOrId)).limit(1)

      if (dao) return dao

      // Fallback to ID lookup
      const [byId] = await ctx.db.select().from(daos).where(eq(daos.id, input.slugOrId)).limit(1)

      if (!byId) throw new Error("DAO not found")
      return byId
    }),

  /** List all DAOs with stats */
  list: publicProcedure
    .input(
      z
        .object({
          limit: z.number().default(50).optional(),
          search: z.string().optional(),
        })
        .optional(),
    )
    .handler(async ({ input, context: ctx }) => {
      // Fetch DAOs first
      const daoRows = await ctx.db
        .select()
        .from(daos)
        .orderBy(desc(daos.createdAt))
        .limit(input?.limit ?? 50)

      // For each DAO, fetch stats in parallel
      const results = await Promise.all(
        daoRows.map(async (dao) => {
          const [memberCount] = await ctx.db
            .select({ value: count() })
            .from(daoMemberships)
            .where(eq(daoMemberships.daoId, dao.id))

          const [datasetCount] = await ctx.db
            .select({ value: count() })
            .from(datasets)
            .where(eq(datasets.daoId, dao.id))

          const [contribCount] = await ctx.db
            .select({ value: count(contributions.id) })
            .from(contributions)
            .innerJoin(datasets, eq(contributions.datasetId, datasets.id))
            .where(eq(datasets.daoId, dao.id))

          return {
            id: dao.id,
            name: dao.name,
            description: dao.description,
            slug: dao.slug,
            ownerAddress: dao.ownerAddress,
            imageUrl: dao.imageUrl,
            createdAt: dao.createdAt,
            memberCount: memberCount?.value ?? 0,
            datasetCount: datasetCount?.value ?? 0,
            contributionCount: contribCount?.value ?? 0,
          }
        }),
      )

      return results
    }),

  /** Join a DAO as a member */
  join: protectedProcedure
    .input(
      z.object({
        daoId: z.string(),
        memberAddress: aptosAddress,
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      assertSessionWallet(ctx, input.memberAddress)

      // Check if already a member
      const existing = await ctx.db
        .select({ id: daoMemberships.id })
        .from(daoMemberships)
        .where(
          and(
            eq(daoMemberships.daoId, input.daoId),
            eq(daoMemberships.memberAddress, input.memberAddress),
          ),
        )
        .limit(1)

      if (existing.length > 0) {
        return { alreadyMember: true }
      }

      const id = crypto.randomUUID()
      await ctx.db.insert(daoMemberships).values({
        id,
        daoId: input.daoId,
        memberAddress: input.memberAddress,
        joinedAt: new Date(),
      })

      return { id, alreadyMember: false }
    }),

  /** List members of a DAO */
  listMembers: publicProcedure
    .input(
      z.object({
        daoId: z.string(),
        limit: z.number().default(50).optional(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      return ctx.db
        .select()
        .from(daoMemberships)
        .where(eq(daoMemberships.daoId, input.daoId))
        .orderBy(desc(daoMemberships.votingPower))
        .limit(input.limit ?? 50)
    }),

  /** Get membership info for a specific wallet in a DAO */
  getMembership: publicProcedure
    .input(
      z.object({
        daoId: z.string(),
        memberAddress: aptosAddress,
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const [membership] = await ctx.db
        .select()
        .from(daoMemberships)
        .where(
          and(
            eq(daoMemberships.daoId, input.daoId),
            eq(daoMemberships.memberAddress, input.memberAddress),
          ),
        )
        .limit(1)

      return membership ?? null
    }),

  /** Get DAO-scoped governance stats */
  getStats: publicProcedure
    .input(z.object({ daoId: z.string() }))
    .handler(async ({ input, context: ctx }) => {
      const [memberCount] = await ctx.db
        .select({ value: count() })
        .from(daoMemberships)
        .where(eq(daoMemberships.daoId, input.daoId))

      const [contribCount] = await ctx.db
        .select({ value: count(contributions.id) })
        .from(contributions)
        .innerJoin(datasets, eq(contributions.datasetId, datasets.id))
        .where(eq(datasets.daoId, input.daoId))

      const [datasetCount] = await ctx.db
        .select({ value: count() })
        .from(datasets)
        .where(eq(datasets.daoId, input.daoId))

      return {
        totalMembers: memberCount?.value ?? 0,
        totalContributions: contribCount?.value ?? 0,
        totalDatasets: datasetCount?.value ?? 0,
      }
    }),
}
