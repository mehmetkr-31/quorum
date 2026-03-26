import { call } from "@orpc/server"
import { contributions, datasets } from "@quorum/db"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { contributionRouter } from "../routers/contribution"
import { createMockContext, createTestDb, setupTestSchema } from "./helpers"

describe("contributionRouter", () => {
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

    await db.insert(datasets).values({
      id: DATASET_ID,
      name: "Test Dataset",
      ownerAddress: "0xowner",
      createdAt: new Date(),
    })
  })

  it("submit: Shelby'e yükler ve DB'ye kaydeder", async () => {
    const result = await call(
      contributionRouter.submit,
      {
        datasetId: DATASET_ID,
        contributorAddress: CONTRIBUTOR,
        shelbyAccount: "shelby://test",
        data: Buffer.from("hello").toString("base64"),
        contentType: "text/plain",
      },
      { context: ctx },
    )

    expect(result.shelbyBlobName).toBe("test-blob")
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
        contributorAddress: CONTRIBUTOR,
        shelbyAccount: "shelby://test",
        data: Buffer.from("hello").toString("base64"),
      },
      { context: ctx },
    )

    await call(
      contributionRouter.confirmOnChain,
      { id, aptosTxHash: "0xdeadbeef" },
      { context: ctx },
    )

    const rows = await db.select().from(contributions).where(eq(contributions.id, id))
    expect(rows[0]?.aptosTxHash).toBe("0xdeadbeef")
  })

  it("list: tüm contribution'ları döner", async () => {
    await call(
      contributionRouter.submit,
      {
        datasetId: DATASET_ID,
        contributorAddress: CONTRIBUTOR,
        shelbyAccount: "shelby://test",
        data: Buffer.from("a").toString("base64"),
      },
      { context: ctx },
    )
    await call(
      contributionRouter.submit,
      {
        datasetId: DATASET_ID,
        contributorAddress: "0xother",
        shelbyAccount: "shelby://test",
        data: Buffer.from("b").toString("base64"),
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
        contributorAddress: CONTRIBUTOR,
        shelbyAccount: "shelby://test",
        data: Buffer.from("x").toString("base64"),
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
        contributorAddress: CONTRIBUTOR,
        shelbyAccount: "shelby://test",
        data: Buffer.from("hello").toString("base64"),
      },
      { context: ctx },
    )

    const content = await call(contributionRouter.getContent, { id }, { context: ctx })
    expect(content.contentType).toBe("text/plain")
    expect(Buffer.from(content.data, "base64").toString()).toBe("test content")
  })
})
