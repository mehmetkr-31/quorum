import { contributions, daoMemberships, daos, datasets, members } from "@quorum/db"
import { and, count, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { publicProcedure } from "../index"

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export const daoRouter = {
  /** Create a new DAO — anyone can launch a community dataset DAO */
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(1000).optional(),
        slug: z.string().min(1).max(50).optional(),
        ownerAddress: z.string(),
        treasuryAddress: z.string(),
        imageUrl: z.string().url().optional(),
        votingWindowSeconds: z.number().min(60).max(604800).default(172800), // 1min - 7days
        quorumThreshold: z.number().min(1).max(100).default(60),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const id = crypto.randomUUID()
      const slug = input.slug || slugify(input.name)

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
  join: publicProcedure
    .input(
      z.object({
        daoId: z.string(),
        memberAddress: z.string(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
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

      // Also ensure global members table has an entry (backward compat)
      await ctx.db
        .insert(members)
        .values({
          address: input.memberAddress,
          joinedAt: new Date(),
        })
        .onConflictDoNothing()

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
        memberAddress: z.string(),
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
