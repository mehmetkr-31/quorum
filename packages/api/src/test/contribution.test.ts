import { call } from "@orpc/server"
import { contributions, datasets } from "@quorum/db"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { contributionRouter } from "../routers/contribution"
import { createMockContext, createTestDb, setupTestSchema } from "./helpers"

// Valid test fixtures matching hardened validators
const DAO_ID = "dao-test"
const CONTRIBUTOR = "0x" + "a".repeat(64)
const VALID_TX_HASH = "0x" + "b".repeat(64)

describe("contributionRouter", () => {
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
      name: "Test Dataset",
      ownerAddress: CONTRIBUTOR,
      createdAt: new Date(),
    })
  })

  it("submit: Shelby'e yükler ve DB'ye kaydeder", async () => {
    const result = await call(
      contributionRouter.submit,
      {
        datasetId: DATASET_ID,
        shelbyAccount: "shelby://test",
        data: Buffer.from("hello").toString("base64"),
        contentType: "text/plain",
        contributorAddress: CONTRIBUTOR,
      },
      { context: ctx },
    )

    expect(result.shelbyBlobName).toMatch(/^contributions\/[0-9a-f-]+\//)
    expect(result.dataHash).toBe("0xabc123")

    const rows = await db.select().from(contributions).where(eq(contributions.id, result.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe("pending")
    expect(rows[0]?.contributorAddress).toBe(CONTRIBUTOR)
  })

  it("confirmOnChain: aptosTxHash günceller", async () => {
    const { id } = await call(
      contributionRouter.submit,
      {
        datasetId: DATASET_ID,
        shelbyAccount: "shelby://test",
        data: Buffer.from("hello").toString("base64"),
        contentType: "text/plain",
        contributorAddress: CONTRIBUTOR,
      },
      { context: ctx },
    )

    await call(
      contributionRouter.confirmOnChain,
      { id, aptosTxHash: VALID_TX_HASH },
      { context: ctx },
    )

    const rows = await db.select().from(contributions).where(eq(contributions.id, id))
    expect(rows[0]?.aptosTxHash).toBe(VALID_TX_HASH)
  })

  it("list: tüm contribution'ları döner", async () => {
    await call(
      contributionRouter.submit,
      {
        datasetId: DATASET_ID,
        shelbyAccount: "shelby://test",
        data: Buffer.from("a").toString("base64"),
        contentType: "text/plain",
        contributorAddress: CONTRIBUTOR,
      },
      { context: ctx },
    )
    await call(
      contributionRouter.submit,
      {
        datasetId: DATASET_ID,
        shelbyAccount: "shelby://test",
        data: Buffer.from("b").toString("base64"),
        contentType: "text/plain",
        contributorAddress: CONTRIBUTOR,
      },
      { context: ctx },
    )

    const all = await call(contributionRouter.list, undefined, { context: ctx })
    expect(all).toHaveLength(2)
  })

  it("list: status filtresi çalışır", async () => {
    const { id } = await call(
      contributionRouter.submit,
      {
        datasetId: DATASET_ID,
        shelbyAccount: "shelby://test",
        data: Buffer.from("x").toString("base64"),
        contentType: "text/plain",
        contributorAddress: CONTRIBUTOR,
      },
      { context: ctx },
    )

    await db.update(contributions).set({ status: "approved" }).where(eq(contributions.id, id))

    const approved = await call(contributionRouter.list, { status: "approved" }, { context: ctx })
    expect(approved).toHaveLength(1)

    const pending = await call(contributionRouter.list, { status: "pending" }, { context: ctx })
    expect(pending).toHaveLength(0)
  })

  it("getContent: Shelby'den içerik döner", async () => {
    const { id } = await call(
      contributionRouter.submit,
      {
        datasetId: DATASET_ID,
        shelbyAccount: "shelby://test",
        data: Buffer.from("hello").toString("base64"),
        contentType: "text/plain",
        contributorAddress: CONTRIBUTOR,
      },
      { context: ctx },
    )

    const content = await call(contributionRouter.getContent, { id }, { context: ctx })
    expect(content.contentType).toBe("application/octet-stream")
    expect(Buffer.from(content.data ?? "", "base64").toString()).toBe("test content")
  })
})
