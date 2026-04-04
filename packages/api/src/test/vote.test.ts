import { call } from "@orpc/server"
import { contributions, datasets, votes } from "@quorum/db"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { contributionRouter } from "../routers/contribution"
import { voteRouter } from "../routers/vote"
import { createMockContext, createTestDb, setupTestSchema } from "./helpers"

// Valid test fixtures matching hardened validators
const DAO_ID = "dao-test"
const CONTRIBUTOR = "0x" + "a".repeat(64)
const VOTER1 = "0x" + "c".repeat(64)
const VOTER2 = "0x" + "d".repeat(64)
const VOTER3 = "0x" + "e".repeat(64)
const TX1 = "0x" + "1".repeat(64)
const TX2 = "0x" + "2".repeat(64)
const TX3 = "0x" + "3".repeat(64)

describe("voteRouter", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let client: ReturnType<typeof createTestDb>["client"]
  let ctx: ReturnType<typeof createMockContext>
  let contributionId: string
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
      name: "Test",
      ownerAddress: CONTRIBUTOR,
      createdAt: new Date(),
    })

    const result = await call(
      contributionRouter.submit,
      {
        datasetId: DATASET_ID,
        shelbyAccount: "shelby://test",
        data: Buffer.from("test").toString("base64"),
        contentType: "text/plain",
        contributorAddress: CONTRIBUTOR,
      },
      { context: ctx },
    )
    contributionId = result.id
  })

  it("cast: oyu DB'ye kaydeder ve id döner", async () => {
    const result = await call(
      voteRouter.cast,
      { contributionId, decision: "approve", aptosTxHash: TX1, voterAddress: VOTER1 },
      { context: ctx },
    )

    expect(result.id).toBeTruthy()

    const voteRows = await db.select().from(votes).where(eq(votes.id, result.id))
    expect(voteRows[0]?.decision).toBe("approve")
    expect(voteRows[0]?.votingPower).toBe(10)
    expect(voteRows[0]?.aptosTxHash).toBe(TX1)
  })

  it("cast: contribution status'u pending'de bırakır (indexer değiştirir)", async () => {
    await call(
      voteRouter.cast,
      { contributionId, decision: "approve", aptosTxHash: TX2, voterAddress: VOTER1 },
      { context: ctx },
    )

    const rows = await db.select().from(contributions).where(eq(contributions.id, contributionId))
    expect(rows[0]?.status).toBe("pending")
  })

  it("cast: farklı kararları kaydeder (approve/reject/improve)", async () => {
    await call(
      voteRouter.cast,
      { contributionId, decision: "approve", aptosTxHash: TX1, voterAddress: VOTER1 },
      { context: ctx },
    )
    await call(
      voteRouter.cast,
      { contributionId, decision: "reject", aptosTxHash: TX2, voterAddress: VOTER2 },
      { context: ctx },
    )
    await call(
      voteRouter.cast,
      { contributionId, decision: "improve", aptosTxHash: TX3, voterAddress: VOTER3 },
      { context: ctx },
    )

    const allVotes = await db.select().from(votes)
    expect(allVotes).toHaveLength(3)
    const decisions = allVotes.map((v) => v.decision)
    expect(decisions).toContain("approve")
    expect(decisions).toContain("reject")
    expect(decisions).toContain("improve")
  })

  it("listHistory: oy geçmişini döner", async () => {
    await call(
      voteRouter.cast,
      { contributionId, decision: "approve", aptosTxHash: TX1, voterAddress: VOTER1 },
      { context: ctx },
    )
    await call(
      voteRouter.cast,
      { contributionId, decision: "reject", aptosTxHash: TX2, voterAddress: VOTER2 },
      { context: ctx },
    )

    const history = await call(voteRouter.listHistory, undefined, { context: ctx })
    expect(history).toHaveLength(2)
  })
})
