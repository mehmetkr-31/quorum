import { call } from "@orpc/server"
import { contributions, daos, datasets } from "@quorum/db"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { datasetRouter } from "../routers/dataset"
import { createMockContext, createTestDb, setupTestSchema } from "./helpers"

describe("datasetRouter", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let client: ReturnType<typeof createTestDb>["client"]
  let ctx: ReturnType<typeof createMockContext>

  const DAO_ID = "dao-test"
  const OWNER = "0x" + "a".repeat(64)

  beforeEach(async () => {
    const testDb = createTestDb()
    db = testDb.db
    client = testDb.client
    await setupTestSchema(client)
    ctx = createMockContext(db)

    // Seed test DAO
    await db.insert(daos).values({
      id: DAO_ID,
      name: "Test DAO",
      slug: "test-dao",
      ownerAddress: OWNER,
      treasuryAddress: OWNER,
      createdAt: new Date(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── create ─────────────────────────────────────────────────────────────────

  it("create: DAO'ya dataset ekler", async () => {
    const result = await call(
      datasetRouter.create,
      {
        daoId: DAO_ID,
        name: "Medical Imaging",
        description: "High quality images",
        ownerAddress: OWNER,
      },
      { context: ctx },
    )

    expect(result.id).toBeTruthy()

    const rows = await db.select().from(datasets).where(eq(datasets.id, result.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe("Medical Imaging")
    expect(rows[0]?.daoId).toBe(DAO_ID)
  })

  it("create: geçersiz DAO ID hata verir", async () => {
    await expect(
      call(
        datasetRouter.create,
        { daoId: "non-existent-dao", name: "Bad Dataset", ownerAddress: OWNER },
        { context: ctx },
      ),
    ).rejects.toThrow("DAO not found")
  })

  // ── list ───────────────────────────────────────────────────────────────────

  it("list: tüm datasetleri döner", async () => {
    await call(
      datasetRouter.create,
      { daoId: DAO_ID, name: "DS One", ownerAddress: OWNER },
      { context: ctx },
    )
    await call(
      datasetRouter.create,
      { daoId: DAO_ID, name: "DS Two", ownerAddress: OWNER },
      { context: ctx },
    )

    const list = await call(datasetRouter.list, undefined, { context: ctx })
    expect(list.length).toBeGreaterThanOrEqual(2)
  })

  it("list: daoId ile filtreler", async () => {
    // 2. DAO oluştur
    await db.insert(daos).values({
      id: "dao-other",
      name: "Other DAO",
      slug: "other-dao",
      ownerAddress: OWNER,
      treasuryAddress: OWNER,
      createdAt: new Date(),
    })

    await call(
      datasetRouter.create,
      { daoId: DAO_ID, name: "In DAO One", ownerAddress: OWNER },
      { context: ctx },
    )
    await call(
      datasetRouter.create,
      { daoId: "dao-other", name: "In DAO Two", ownerAddress: OWNER },
      { context: ctx },
    )

    const daoOneList = await call(datasetRouter.list, { daoId: DAO_ID }, { context: ctx })
    expect(daoOneList.every((d) => d.daoId === DAO_ID)).toBe(true)
    expect(daoOneList.length).toBe(1)
  })

  // ── export ─────────────────────────────────────────────────────────────────

  it("export: sadece approved contribution'ları döner", async () => {
    const { id: dsId } = await call(
      datasetRouter.create,
      { daoId: DAO_ID, name: "Export Test", ownerAddress: OWNER },
      { context: ctx },
    )

    // pending + approved + rejected
    await db.insert(contributions).values([
      {
        id: "c-pending",
        datasetId: dsId,
        contributorAddress: OWNER,
        shelbyAccount: "s://x",
        shelbyBlobName: "b1",
        dataHash: "0xh1",
        status: "pending",
        createdAt: new Date(),
      },
      {
        id: "c-approved",
        datasetId: dsId,
        contributorAddress: OWNER,
        shelbyAccount: "s://x",
        shelbyBlobName: "b2",
        dataHash: "0xh2",
        status: "approved",
        weight: 5,
        createdAt: new Date(),
      },
      {
        id: "c-rejected",
        datasetId: dsId,
        contributorAddress: OWNER,
        shelbyAccount: "s://x",
        shelbyBlobName: "b3",
        dataHash: "0xh3",
        status: "rejected",
        createdAt: new Date(),
      },
    ])

    const exported = await call(datasetRouter.export, { datasetId: dsId }, { context: ctx })
    expect(exported).toHaveLength(1)
    expect(exported[0]?.id).toBe("c-approved")
    expect(exported[0]?.source).toBe("quorum-dao")
    expect(exported[0]?.dao_id).toBe(DAO_ID)
  })

  it("export: bulunamayan dataset hata verir", async () => {
    await expect(
      call(datasetRouter.export, { datasetId: "no-such-dataset" }, { context: ctx }),
    ).rejects.toThrow("Dataset not found")
  })

  // ── pushToHub ──────────────────────────────────────────────────────────────

  it("pushToHub: HuggingFace token olmadan hata verir", async () => {
    const { id: dsId } = await call(
      datasetRouter.create,
      { daoId: DAO_ID, name: "HF Test", ownerAddress: OWNER },
      { context: ctx },
    )

    await expect(
      call(
        datasetRouter.pushToHub,
        { datasetId: dsId, repoId: "testuser/test-dataset" },
        { context: ctx },
      ),
    ).rejects.toThrow(/token required/i)
  })

  it("pushToHub: approved contribution olmadan hata verir", async () => {
    const { id: dsId } = await call(
      datasetRouter.create,
      { daoId: DAO_ID, name: "Empty HF Test", ownerAddress: OWNER },
      { context: ctx },
    )

    // HF API'yi mock'la — token check geçsin
    vi.stubEnv("HUGGINGFACE_TOKEN", "hf_test_token")

    // global fetch mock
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

    await expect(
      call(
        datasetRouter.pushToHub,
        { datasetId: dsId, repoId: "testuser/test-dataset", hfToken: "hf_test" },
        { context: ctx },
      ),
    ).rejects.toThrow("No approved contributions to push")
  })

  it("pushToHub: başarılı push URL ve kayıt sayısını döner", async () => {
    const { id: dsId } = await call(
      datasetRouter.create,
      { daoId: DAO_ID, name: "Pushable Dataset", ownerAddress: OWNER },
      { context: ctx },
    )

    // Approved contribution ekle
    await db.insert(contributions).values({
      id: "c-push",
      datasetId: dsId,
      contributorAddress: OWNER,
      shelbyAccount: "s://x",
      shelbyBlobName: "b1",
      dataHash: "0xhash",
      status: "approved",
      weight: 3,
      createdAt: new Date(),
    })

    // HF API mock — tüm çağrılarda başarı döner
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

    const result = await call(
      datasetRouter.pushToHub,
      { datasetId: dsId, repoId: "testuser/my-dataset", hfToken: "hf_test_token" },
      { context: ctx },
    )

    expect(result.repoId).toBe("testuser/my-dataset")
    expect(result.url).toBe("https://huggingface.co/datasets/testuser/my-dataset")
    expect(result.recordCount).toBe(1)
  })
})
