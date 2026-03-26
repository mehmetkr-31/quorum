import { call } from "@orpc/server"
import { contributions, datasets, votes } from "@quorum/db"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { contributionRouter } from "../routers/contribution"
import { voteRouter } from "../routers/vote"
import { createMockContext, createTestDb, setupTestSchema } from "./helpers"

describe("voteRouter", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let client: ReturnType<typeof createTestDb>["client"]
  let ctx: ReturnType<typeof createMockContext>
  let contributionId: string

  beforeEach(async () => {
    const testDb = createTestDb()
    db = testDb.db
    client = testDb.client
    await setupTestSchema(client)
    ctx = createMockContext(db)

    await db
      .insert(datasets)
      .values({ id: "ds-1", name: "Test", ownerAddress: "0xowner", createdAt: new Date() })

    const result = await call(
      contributionRouter.submit,
      {
        datasetId: "ds-1",
        contributorAddress: "0xcontributor",
        shelbyAccount: "shelby://test",
        data: Buffer.from("test").toString("base64"),
      },
      { context: ctx },
    )
    contributionId = result.id
  })

  it("cast: oyu DB'ye kaydeder ve id döner", async () => {
    const result = await call(
      voteRouter.cast,
      { contributionId, voterAddress: "0xvoter", decision: "approve", aptosTxHash: "0xtx1" },
      { context: ctx },
    )

    expect(result.id).toBeTruthy()

    const voteRows = await db.select().from(votes).where(eq(votes.id, result.id))
    expect(voteRows[0]?.decision).toBe("approve")
    expect(voteRows[0]?.votingPower).toBe(10)
    expect(voteRows[0]?.aptosTxHash).toBe("0xtx1")
  })

  it("cast: contribution status'u pending'de bırakır (indexer değiştirir)", async () => {
    // Status, ContributionFinalized on-chain event → indexer tarafından güncellenir.
    // cast sadece oyu kaydeder, contribution'a dokunmaz.
    await call(
      voteRouter.cast,
      { contributionId, voterAddress: "0xvoter", decision: "approve", aptosTxHash: "0xtx2" },
      { context: ctx },
    )

    const rows = await db.select().from(contributions).where(eq(contributions.id, contributionId))
    expect(rows[0]?.status).toBe("pending")
  })

  it("cast: farklı kararları kaydeder (approve/reject/improve)", async () => {
    await call(
      voteRouter.cast,
      { contributionId, voterAddress: "0xv1", decision: "approve", aptosTxHash: "0xt1" },
      { context: ctx },
    )
    await call(
      voteRouter.cast,
      { contributionId, voterAddress: "0xv2", decision: "reject", aptosTxHash: "0xt2" },
      { context: ctx },
    )
    await call(
      voteRouter.cast,
      { contributionId, voterAddress: "0xv3", decision: "improve", aptosTxHash: "0xt3" },
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
      { contributionId, voterAddress: "0xv1", decision: "approve", aptosTxHash: "0xt1" },
      { context: ctx },
    )
    await call(
      voteRouter.cast,
      { contributionId, voterAddress: "0xv2", decision: "reject", aptosTxHash: "0xt2" },
      { context: ctx },
    )

    const history = await call(voteRouter.listHistory, undefined, { context: ctx })
    expect(history).toHaveLength(2)
  })
})
