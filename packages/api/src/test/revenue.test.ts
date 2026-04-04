import { call } from "@orpc/server"
import { contributions, datasets, members } from "@quorum/db"
import { beforeEach, describe, expect, it } from "vitest"
import { revenueRouter } from "../routers/revenue"
import { createMockContext, createTestDb, setupTestSchema } from "./helpers"

// Valid test fixtures matching hardened validators
const DAO_ID = "dao-test"
const CONTRIBUTOR = "0x" + "a".repeat(64)
const READER1 = "0x" + "f".repeat(64)
const READER2 = "0x" + "1".repeat(64)
// Shelby receipt hash: 64 hex chars, no 0x prefix
const HASH1 = "a".repeat(64)
const HASH2 = "b".repeat(64)
const TX1 = "0x" + "1".repeat(64)
const TX2 = "0x" + "2".repeat(64)

describe("revenueRouter", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let client: ReturnType<typeof createTestDb>["client"]
  let ctx: ReturnType<typeof createMockContext>
  let DATASET_ID: string

  beforeEach(async () => {
    DATASET_ID = crypto.randomUUID()
    const testDb = createTestDb()
    db = testDb.db
    client = testDb.client
    await setupTestSchema(client)
    ctx = createMockContext(db)

    await db.insert(datasets).values({
      id: DATASET_ID,
      daoId: DAO_ID,
      name: "DS",
      ownerAddress: CONTRIBUTOR,
      createdAt: new Date(),
    })
  })

  it("anchorReceipt: receipt kaydeder ve id döner", async () => {
    const result = await call(
      revenueRouter.anchorReceipt,
      {
        datasetId: DATASET_ID,
        readerAddress: READER1,
        shelbyReceiptHash: HASH1,
        aptosTxHash: TX1,
        amount: 100,
      },
      { context: ctx },
    )
    expect(result.id).toBeTruthy()
  })

  it("anchorReceipt: idempotent — aynı hash ikinci kez eklenmez", async () => {
    const r1 = await call(
      revenueRouter.anchorReceipt,
      {
        datasetId: DATASET_ID,
        readerAddress: READER1,
        shelbyReceiptHash: HASH1,
        aptosTxHash: TX1,
        amount: 100,
      },
      { context: ctx },
    )
    const r2 = await call(
      revenueRouter.anchorReceipt,
      {
        datasetId: DATASET_ID,
        readerAddress: READER2,
        shelbyReceiptHash: HASH1,
        aptosTxHash: TX2,
        amount: 200,
      },
      { context: ctx },
    )
    expect(r1.id).toBe(r2.id) // same ID returned
  })

  it("listReceipts: tüm receipts'leri döner", async () => {
    await call(
      revenueRouter.anchorReceipt,
      {
        datasetId: DATASET_ID,
        readerAddress: READER1,
        shelbyReceiptHash: HASH1,
        aptosTxHash: TX1,
        amount: 50,
      },
      { context: ctx },
    )
    await call(
      revenueRouter.anchorReceipt,
      {
        datasetId: DATASET_ID,
        readerAddress: READER2,
        shelbyReceiptHash: HASH2,
        aptosTxHash: TX2,
        amount: 75,
      },
      { context: ctx },
    )

    const list = await call(revenueRouter.listReceipts, undefined, { context: ctx })
    expect(list).toHaveLength(2)
  })

  it("listReceipts: distributed=false filtresi dağıtılmamışları döner", async () => {
    const { receipts } = await import("@quorum/db")
    await call(
      revenueRouter.anchorReceipt,
      {
        datasetId: DATASET_ID,
        readerAddress: READER1,
        shelbyReceiptHash: HASH1,
        aptosTxHash: TX1,
        amount: 50,
      },
      { context: ctx },
    )
    await call(
      revenueRouter.anchorReceipt,
      {
        datasetId: DATASET_ID,
        readerAddress: READER2,
        shelbyReceiptHash: HASH2,
        aptosTxHash: TX2,
        amount: 75,
      },
      { context: ctx },
    )
    await db
      .update(receipts)
      .set({ distributed: true })
      .where((await import("drizzle-orm")).eq(receipts.shelbyReceiptHash, HASH1))

    const undistributed = await call(
      revenueRouter.listReceipts,
      { distributed: false },
      { context: ctx },
    )
    expect(undistributed).toHaveLength(1)
    expect(undistributed[0]?.shelbyReceiptHash).toBe(HASH2)

    const distributed = await call(
      revenueRouter.listReceipts,
      { distributed: true },
      { context: ctx },
    )
    expect(distributed).toHaveLength(1)
    expect(distributed[0]?.shelbyReceiptHash).toBe(HASH1)
  })

  it("getEarnings: member yoksa sıfır döner", async () => {
    const result = await call(
      revenueRouter.getEarnings,
      { contributorAddress: CONTRIBUTOR },
      { context: ctx },
    )
    expect(result.approvedContributions).toBe(0)
    expect(result.totalWeight).toBe(0)
  })

  it("getEarnings: approved contribution weight'ini toplar", async () => {
    await db.insert(members).values({
      address: CONTRIBUTOR,
      votingPower: 5,
      approvedContributions: 2,
      joinedAt: new Date(),
    })
    await db.insert(contributions).values([
      {
        id: "c1",
        datasetId: DATASET_ID,
        contributorAddress: CONTRIBUTOR,
        shelbyAccount: "s://x",
        shelbyBlobName: "b1",
        dataHash: "0xh1",
        weight: 3.5,
        status: "approved",
        createdAt: new Date(),
      },
      {
        id: "c2",
        datasetId: DATASET_ID,
        contributorAddress: CONTRIBUTOR,
        shelbyAccount: "s://x",
        shelbyBlobName: "b2",
        dataHash: "0xh2",
        weight: 1.5,
        status: "approved",
        createdAt: new Date(),
      },
      {
        id: "c3",
        datasetId: DATASET_ID,
        contributorAddress: CONTRIBUTOR,
        shelbyAccount: "s://x",
        shelbyBlobName: "b3",
        dataHash: "0xh3",
        weight: 10,
        status: "pending",
        createdAt: new Date(),
      },
    ])

    const result = await call(
      revenueRouter.getEarnings,
      { contributorAddress: CONTRIBUTOR },
      { context: ctx },
    )
    expect(result.approvedContributions).toBe(2)
    expect(result.totalWeight).toBeCloseTo(5.0)
  })
})
