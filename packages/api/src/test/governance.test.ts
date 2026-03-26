import { call } from "@orpc/server"
import { datasets, members, receipts } from "@quorum/db"
import { beforeEach, describe, expect, it } from "vitest"
import { governanceRouter } from "../routers/governance"
import { createMockContext, createTestDb, setupTestSchema } from "./helpers"

describe("governanceRouter", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let client: ReturnType<typeof createTestDb>["client"]
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(async () => {
    const testDb = createTestDb()
    db = testDb.db
    client = testDb.client
    await setupTestSchema(client)
    ctx = createMockContext(db)
  })

  it("getStats: boş DB'de sıfır döner", async () => {
    const stats = await call(governanceRouter.getStats, undefined, { context: ctx })
    expect(stats.totalContributions).toBe(0)
    expect(stats.totalMembers).toBe(0)
    expect(stats.totalRevenue).toBe("0.00")
  })

  it("getStats: veri varken doğru sayar", async () => {
    await db
      .insert(datasets)
      .values({ id: "d1", name: "D1", ownerAddress: "0x1", createdAt: new Date() })
    await db.insert(members).values({ address: "0xm1", votingPower: 5, joinedAt: new Date() })
    await db.insert(members).values({ address: "0xm2", votingPower: 3, joinedAt: new Date() })
    await db.insert(receipts).values({
      id: "r1",
      datasetId: "d1",
      readerAddress: "0xreader",
      shelbyReceiptHash: "0xhash",
      aptosTxHash: "0xtx",
      amount: 200_000_000,
      createdAt: new Date(),
    })

    const stats = await call(governanceRouter.getStats, undefined, { context: ctx })
    expect(stats.totalMembers).toBe(2)
    expect(stats.totalRevenue).toBe("2.00")
  })

  it("listMembers: üyeleri voting power'a göre azalan sıralar", async () => {
    await db.insert(members).values({ address: "0xlow", votingPower: 1, joinedAt: new Date() })
    await db.insert(members).values({ address: "0xhigh", votingPower: 100, joinedAt: new Date() })
    await db.insert(members).values({ address: "0xmid", votingPower: 50, joinedAt: new Date() })

    const list = await call(governanceRouter.listMembers, undefined, { context: ctx })
    expect(list[0]?.address).toBe("0xhigh")
    expect(list[1]?.address).toBe("0xmid")
    expect(list[2]?.address).toBe("0xlow")
  })
})
