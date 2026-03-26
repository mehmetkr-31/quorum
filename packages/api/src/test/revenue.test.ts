import { describe, it, expect, beforeEach } from "vitest"
import { call } from "@orpc/server"
import { contributions, datasets, members } from "@quorum/db"
import { revenueRouter } from "../routers/revenue"
import { createTestDb, setupTestSchema, createMockContext } from "./helpers"

describe("revenueRouter", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let client: ReturnType<typeof createTestDb>["client"]
  let ctx: ReturnType<typeof createMockContext>

  const DATASET_ID = "ds-1"
  const CONTRIBUTOR = "0xcontributor"

  beforeEach(async () => {
    const testDb = createTestDb()
    db = testDb.db
    client = testDb.client
    await setupTestSchema(client)
    ctx = createMockContext(db)

    await db.insert(datasets).values({ id: DATASET_ID, name: "DS", ownerAddress: "0x1", createdAt: new Date() })
  })

  it("anchorReceipt: receipt kaydeder ve id döner", async () => {
    const result = await call(
      revenueRouter.anchorReceipt,
      { datasetId: DATASET_ID, readerAddress: "0xreader", shelbyReceiptHash: "0xhash1", aptosTxHash: "0xtx1", amount: 100 },
      { context: ctx },
    )
    expect(result.id).toBeTruthy()
  })

  it("listReceipts: tüm receipts'leri döner", async () => {
    await call(revenueRouter.anchorReceipt, { datasetId: DATASET_ID, readerAddress: "0xr1", shelbyReceiptHash: "0xh1", aptosTxHash: "0xt1", amount: 50 }, { context: ctx })
    await call(revenueRouter.anchorReceipt, { datasetId: DATASET_ID, readerAddress: "0xr2", shelbyReceiptHash: "0xh2", aptosTxHash: "0xt2", amount: 75 }, { context: ctx })

    const list = await call(revenueRouter.listReceipts, undefined, { context: ctx })
    expect(list).toHaveLength(2)
  })

  it("listReceipts: distributed=false filtresi dağıtılmamışları döner", async () => {
    const { receipts } = await import("@quorum/db")
    await call(revenueRouter.anchorReceipt, { datasetId: DATASET_ID, readerAddress: "0xr1", shelbyReceiptHash: "0xh1", aptosTxHash: "0xt1", amount: 50 }, { context: ctx })
    await call(revenueRouter.anchorReceipt, { datasetId: DATASET_ID, readerAddress: "0xr2", shelbyReceiptHash: "0xh2", aptosTxHash: "0xt2", amount: 75 }, { context: ctx })
    // Birini distributed olarak işaretle
    await db.update(receipts).set({ distributed: true }).where((await import("drizzle-orm")).eq(receipts.shelbyReceiptHash, "0xh1"))

    const undistributed = await call(revenueRouter.listReceipts, { distributed: false }, { context: ctx })
    expect(undistributed).toHaveLength(1)
    expect(undistributed[0]?.shelbyReceiptHash).toBe("0xh2")

    const distributed = await call(revenueRouter.listReceipts, { distributed: true }, { context: ctx })
    expect(distributed).toHaveLength(1)
    expect(distributed[0]?.shelbyReceiptHash).toBe("0xh1")
  })

  it("getEarnings: member yoksa sıfır döner", async () => {
    const result = await call(revenueRouter.getEarnings, { contributorAddress: "0xunknown" }, { context: ctx })
    expect(result.approvedContributions).toBe(0)
    expect(result.totalWeight).toBe(0)
  })

  it("getEarnings: approved contribution weight'ini toplar", async () => {
    await db.insert(members).values({ address: CONTRIBUTOR, votingPower: 5, approvedContributions: 2, joinedAt: new Date() })
    await db.insert(contributions).values({ id: "c1", datasetId: DATASET_ID, contributorAddress: CONTRIBUTOR, shelbyAccount: "s://x", shelbyBlobName: "b1", dataHash: "0xh1", weight: 3.5, status: "approved", createdAt: new Date() })
    await db.insert(contributions).values({ id: "c2", datasetId: DATASET_ID, contributorAddress: CONTRIBUTOR, shelbyAccount: "s://x", shelbyBlobName: "b2", dataHash: "0xh2", weight: 1.5, status: "approved", createdAt: new Date() })
    await db.insert(contributions).values({ id: "c3", datasetId: DATASET_ID, contributorAddress: CONTRIBUTOR, shelbyAccount: "s://x", shelbyBlobName: "b3", dataHash: "0xh3", weight: 10, status: "pending", createdAt: new Date() })

    const result = await call(revenueRouter.getEarnings, { contributorAddress: CONTRIBUTOR }, { context: ctx })
    expect(result.approvedContributions).toBe(2)
    expect(result.totalWeight).toBeCloseTo(5.0)
  })
})
