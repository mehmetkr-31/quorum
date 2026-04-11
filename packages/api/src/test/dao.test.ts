import { call } from "@orpc/server"
import { daoMemberships, daos } from "@quorum/db"
import { and, eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { daoRouter } from "../routers/dao"
import { createMockContext, createTestDb, setupTestSchema } from "./helpers"

describe("daoRouter", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let client: ReturnType<typeof createTestDb>["client"]
  let ctx: ReturnType<typeof createMockContext>

  const OWNER = "0x" + "a".repeat(64)
  const TREASURY = "0x" + "b".repeat(64)

  beforeEach(async () => {
    const testDb = createTestDb()
    db = testDb.db
    client = testDb.client
    await setupTestSchema(client)
    ctx = createMockContext(db)
  })

  // ── create ─────────────────────────────────────────────────────────────────

  it("create: DAO oluşturur ve owner'ı otomatik üye yapar", async () => {
    const result = await call(
      daoRouter.create,
      {
        name: "Medical DAO",
        ownerAddress: OWNER,
        treasuryAddress: TREASURY,
      },
      { context: ctx },
    )

    expect(result.id).toBeTruthy()
    expect(result.slug).toBe("medical-dao")

    // DAO DB'de var mı?
    const rows = await db.select().from(daos).where(eq(daos.id, result.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe("Medical DAO")
    expect(rows[0]?.ownerAddress).toBe(OWNER)

    // Owner otomatik üye olmalı
    const memberships = await db
      .select()
      .from(daoMemberships)
      .where(and(eq(daoMemberships.daoId, result.id), eq(daoMemberships.memberAddress, OWNER)))
    expect(memberships).toHaveLength(1)
    expect(memberships[0]?.role).toBe("owner")
    expect(memberships[0]?.votingPower).toBe(10)
  })

  it("create: özel slug kullanılabilir", async () => {
    const result = await call(
      daoRouter.create,
      {
        name: "My DAO",
        slug: "my-custom-slug",
        ownerAddress: OWNER,
        treasuryAddress: TREASURY,
      },
      { context: ctx },
    )

    expect(result.slug).toBe("my-custom-slug")
  })

  it("create: aynı slug tekrar kullanılınca hata verir", async () => {
    await call(
      daoRouter.create,
      { name: "First DAO", slug: "duplicate", ownerAddress: OWNER, treasuryAddress: TREASURY },
      { context: ctx },
    )

    await expect(
      call(
        daoRouter.create,
        { name: "Second DAO", slug: "duplicate", ownerAddress: OWNER, treasuryAddress: TREASURY },
        { context: ctx },
      ),
    ).rejects.toThrow('DAO slug "duplicate" is already taken')
  })

  // ── get ────────────────────────────────────────────────────────────────────

  it("get: slug ile DAO getirir", async () => {
    const { id, slug } = await call(
      daoRouter.create,
      { name: "Findable DAO", ownerAddress: OWNER, treasuryAddress: TREASURY },
      { context: ctx },
    )

    const dao = await call(daoRouter.get, { slugOrId: slug }, { context: ctx })
    expect(dao.id).toBe(id)
    expect(dao.name).toBe("Findable DAO")
  })

  it("get: ID ile DAO getirir", async () => {
    const { id } = await call(
      daoRouter.create,
      { name: "By ID DAO", ownerAddress: OWNER, treasuryAddress: TREASURY },
      { context: ctx },
    )

    const dao = await call(daoRouter.get, { slugOrId: id }, { context: ctx })
    expect(dao.id).toBe(id)
  })

  it("get: bulunamayan DAO hata verir", async () => {
    await expect(
      call(daoRouter.get, { slugOrId: "non-existent" }, { context: ctx }),
    ).rejects.toThrow("DAO not found")
  })

  // ── list ───────────────────────────────────────────────────────────────────

  it("list: tüm DAO'ları döner", async () => {
    await call(
      daoRouter.create,
      { name: "DAO One", ownerAddress: OWNER, treasuryAddress: TREASURY },
      { context: ctx },
    )
    await call(
      daoRouter.create,
      { name: "DAO Two", ownerAddress: OWNER, treasuryAddress: TREASURY },
      { context: ctx },
    )

    const list = await call(daoRouter.list, undefined, { context: ctx })
    expect(list.length).toBeGreaterThanOrEqual(2)
  })

  // ── join ───────────────────────────────────────────────────────────────────

  it("join: yeni üye ekler", async () => {
    const { id } = await call(
      daoRouter.create,
      { name: "Join Test DAO", ownerAddress: OWNER, treasuryAddress: TREASURY },
      { context: ctx },
    )

    const newMember = "0x" + "c".repeat(64)
    ctx.session!.walletAddress = newMember
    const result = await call(
      daoRouter.join,
      { daoId: id, memberAddress: newMember },
      { context: ctx },
    )

    expect(result.alreadyMember).toBe(false)
    expect(result.id).toBeTruthy()

    const memberships = await db
      .select()
      .from(daoMemberships)
      .where(and(eq(daoMemberships.daoId, id), eq(daoMemberships.memberAddress, newMember)))
    expect(memberships).toHaveLength(1)
    expect(memberships[0]?.role).toBe("member")
  })

  it("join: tekrar katılmaya çalışınca alreadyMember=true döner", async () => {
    const { id } = await call(
      daoRouter.create,
      { name: "Idempotent DAO", ownerAddress: OWNER, treasuryAddress: TREASURY },
      { context: ctx },
    )

    const newMember = "0x" + "c".repeat(64)
    ctx.session!.walletAddress = newMember
    await call(daoRouter.join, { daoId: id, memberAddress: newMember }, { context: ctx })
    const second = await call(
      daoRouter.join,
      { daoId: id, memberAddress: newMember },
      { context: ctx },
    )
    expect(second.alreadyMember).toBe(true)
  })

  // ── getMembership ──────────────────────────────────────────────────────────

  it("getMembership: üye için membership döner", async () => {
    const { id } = await call(
      daoRouter.create,
      { name: "Membership DAO", ownerAddress: OWNER, treasuryAddress: TREASURY },
      { context: ctx },
    )

    const membership = await call(
      daoRouter.getMembership,
      { daoId: id, memberAddress: OWNER },
      { context: ctx },
    )
    expect(membership).not.toBeNull()
    expect(membership?.role).toBe("owner")
  })

  it("getMembership: üye değilse null döner", async () => {
    const { id } = await call(
      daoRouter.create,
      { name: "Non-member DAO", ownerAddress: OWNER, treasuryAddress: TREASURY },
      { context: ctx },
    )

    const membership = await call(
      daoRouter.getMembership,
      { daoId: id, memberAddress: "0x" + "d".repeat(64) },
      { context: ctx },
    )
    expect(membership).toBeNull()
  })

  // ── listMembers ────────────────────────────────────────────────────────────

  it("listMembers: DAO üyelerini voting power'a göre sıralar", async () => {
    const { id } = await call(
      daoRouter.create,
      { name: "Leaderboard DAO", ownerAddress: OWNER, treasuryAddress: TREASURY },
      { context: ctx },
    )

    ctx.session!.walletAddress = "0x" + "e".repeat(64)
    await call(
      daoRouter.join,
      { daoId: id, memberAddress: "0x" + "e".repeat(64) },
      { context: ctx },
    )
    ctx.session!.walletAddress = "0x" + "f".repeat(64)
    await call(
      daoRouter.join,
      { daoId: id, memberAddress: "0x" + "f".repeat(64) },
      { context: ctx },
    )

    const members = await call(daoRouter.listMembers, { daoId: id }, { context: ctx })
    // owner (VP=10) en üstte olmalı
    expect(members[0]?.memberAddress).toBe(OWNER)
    expect(members[0]?.votingPower).toBe(10)
  })

  // ── getStats ───────────────────────────────────────────────────────────────

  it("getStats: DAO istatistiklerini döner", async () => {
    const { id } = await call(
      daoRouter.create,
      { name: "Stats DAO", ownerAddress: OWNER, treasuryAddress: TREASURY },
      { context: ctx },
    )
    ctx.session!.walletAddress = "0x" + "9".repeat(64)
    await call(
      daoRouter.join,
      { daoId: id, memberAddress: "0x" + "9".repeat(64) },
      { context: ctx },
    )

    const stats = await call(daoRouter.getStats, { daoId: id }, { context: ctx })
    expect(stats.totalMembers).toBe(2) // owner + yeni üye
    expect(stats.totalDatasets).toBe(0)
    expect(stats.totalContributions).toBe(0)
  })
})
