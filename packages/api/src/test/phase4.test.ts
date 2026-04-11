import { call } from "@orpc/server"
import { daoMemberships, daos, proposals } from "@quorum/db"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { delegationRouter } from "../routers/delegation"
import { proposalRouter } from "../routers/proposal"
import { stakingRouter } from "../routers/staking"
import { createMockContext, createTestDb, setupTestSchema } from "./helpers"

const OWNER = "0x" + "a".repeat(64)
const MEMBER1 = "0x" + "b".repeat(64)
const MEMBER2 = "0x" + "c".repeat(64)
const TX = "0x" + "1".repeat(64)
const DAO_ID = "dao-phase4"

describe("proposalRouter", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let client: ReturnType<typeof createTestDb>["client"]
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(async () => {
    const testDb = createTestDb()
    db = testDb.db
    client = testDb.client
    await setupTestSchema(client)
    ctx = createMockContext(db)

    // Seed DAO + members
    await db.insert(daos).values({
      id: DAO_ID,
      name: "Phase4 DAO",
      slug: "phase4",
      ownerAddress: OWNER,
      treasuryAddress: OWNER,
      quorumThreshold: 60,
      votingWindowSeconds: 172800,
      createdAt: new Date(),
    })
    await db.insert(daoMemberships).values([
      {
        id: "m-owner",
        daoId: DAO_ID,
        memberAddress: OWNER,
        votingPower: 10,
        role: "owner",
        joinedAt: new Date(),
      },
      {
        id: "m-1",
        daoId: DAO_ID,
        memberAddress: MEMBER1,
        votingPower: 5,
        role: "member",
        joinedAt: new Date(),
      },
      {
        id: "m-2",
        daoId: DAO_ID,
        memberAddress: MEMBER2,
        votingPower: 3,
        role: "member",
        joinedAt: new Date(),
      },
    ])
  })

  it("create: proposal oluşturur", async () => {
    ctx.session!.walletAddress = OWNER
    const result = await call(
      proposalRouter.create,
      {
        daoId: DAO_ID,
        proposerAddress: OWNER,
        title: "My First Proposal",
        description: "This is a test proposal",
      },
      { context: ctx },
    )
    expect(result.id).toBeTruthy()

    const rows = await db.select().from(proposals).where(eq(proposals.id, result.id))
    expect(rows[0]?.title).toBe("My First Proposal")
    expect(rows[0]?.status).toBe("active")
  })

  it("create: DAO üyesi olmayanlar proposal oluşturamaz", async () => {
    ctx.session!.walletAddress = "0x" + "d".repeat(64)
    await expect(
      call(
        proposalRouter.create,
        {
          daoId: DAO_ID,
          proposerAddress: "0x" + "d".repeat(64),
          title: "Unauthorized Proposal",
        },
        { context: ctx },
      ),
    ).rejects.toThrow("Only DAO members can create proposals")
  })

  it("list: DAO için proposal'ları listeler", async () => {
    ctx.session!.walletAddress = OWNER
    await call(
      proposalRouter.create,
      { daoId: DAO_ID, proposerAddress: OWNER, title: "Proposal One" },
      { context: ctx },
    )
    ctx.session!.walletAddress = MEMBER1
    await call(
      proposalRouter.create,
      { daoId: DAO_ID, proposerAddress: MEMBER1, title: "Proposal Two" },
      { context: ctx },
    )

    const list = await call(proposalRouter.list, { daoId: DAO_ID }, { context: ctx })
    expect(list.length).toBe(2)
  })

  it("vote: proposal'a oy verir", async () => {
    ctx.session!.walletAddress = OWNER
    const { id } = await call(
      proposalRouter.create,
      { daoId: DAO_ID, proposerAddress: OWNER, title: "Votable Proposal" },
      { context: ctx },
    )

    ctx.session!.walletAddress = MEMBER1
    const voteResult = await call(
      proposalRouter.vote,
      { proposalId: id, voterAddress: MEMBER1, support: true, aptosTxHash: TX },
      { context: ctx },
    )
    expect(voteResult.votingPower).toBe(5) // MEMBER1's VP

    // Check tally updated
    const [p] = await db.select().from(proposals).where(eq(proposals.id, id))
    expect(p?.yesPower).toBe(5)
    expect(p?.totalPower).toBe(5)
  })

  it("vote: aynı adres ikinci istekte mevcut oyu idempotent döner", async () => {
    ctx.session!.walletAddress = OWNER
    const { id } = await call(
      proposalRouter.create,
      { daoId: DAO_ID, proposerAddress: OWNER, title: "Double Vote Test" },
      { context: ctx },
    )

    ctx.session!.walletAddress = MEMBER1
    await call(
      proposalRouter.vote,
      { proposalId: id, voterAddress: MEMBER1, support: true, aptosTxHash: TX },
      { context: ctx },
    )

    const repeatVote = await call(
      proposalRouter.vote,
      { proposalId: id, voterAddress: MEMBER1, support: false, aptosTxHash: TX },
      { context: ctx },
    )
    expect(repeatVote.id).toBeTruthy()
    expect(repeatVote.votingPower).toBe(5)
  })

  it("finalize: quorum geçince passed olur", async () => {
    // Create with far future deadline so votes go through
    const futureDeadline = new Date(Date.now() + 1_000_000)
    ctx.session!.walletAddress = OWNER
    const { id } = await call(
      proposalRouter.create,
      {
        daoId: DAO_ID,
        proposerAddress: OWNER,
        title: "Will Pass",
        votingDeadlineMs: futureDeadline.getTime(),
      },
      { context: ctx },
    )

    // Cast votes: 10+5=15 yes out of 18 total (83% > 60%)
    await call(
      proposalRouter.vote,
      { proposalId: id, voterAddress: OWNER, support: true, aptosTxHash: TX },
      { context: ctx },
    )
    ctx.session!.walletAddress = MEMBER1
    await call(
      proposalRouter.vote,
      { proposalId: id, voterAddress: MEMBER1, support: true, aptosTxHash: "0x" + "2".repeat(64) },
      { context: ctx },
    )
    ctx.session!.walletAddress = MEMBER2
    await call(
      proposalRouter.vote,
      { proposalId: id, voterAddress: MEMBER2, support: false, aptosTxHash: "0x" + "3".repeat(64) },
      { context: ctx },
    )

    // Move deadline to the past so finalize works
    await db
      .update(proposals)
      .set({ votingDeadline: new Date(Date.now() - 1000) })
      .where(eq(proposals.id, id))

    const result = await call(proposalRouter.finalize, { proposalId: id }, { context: ctx })
    expect(result.passed).toBe(true)
    expect(result.status).toBe("passed")
  })

  it("finalize: quorum geçmeyince rejected olur", async () => {
    const futureDeadline = new Date(Date.now() + 1_000_000)
    ctx.session!.walletAddress = OWNER
    const { id } = await call(
      proposalRouter.create,
      {
        daoId: DAO_ID,
        proposerAddress: OWNER,
        title: "Will Fail",
        votingDeadlineMs: futureDeadline.getTime(),
      },
      { context: ctx },
    )

    // Vote: only 3 yes out of 13 (23% < 60%)
    ctx.session!.walletAddress = MEMBER2
    await call(
      proposalRouter.vote,
      { proposalId: id, voterAddress: MEMBER2, support: true, aptosTxHash: TX },
      { context: ctx },
    )
    ctx.session!.walletAddress = OWNER
    await call(
      proposalRouter.vote,
      { proposalId: id, voterAddress: OWNER, support: false, aptosTxHash: "0x" + "2".repeat(64) },
      { context: ctx },
    )

    // Move deadline to the past
    await db
      .update(proposals)
      .set({ votingDeadline: new Date(Date.now() - 1000) })
      .where(eq(proposals.id, id))

    const result = await call(proposalRouter.finalize, { proposalId: id }, { context: ctx })
    expect(result.passed).toBe(false)
    expect(result.status).toBe("rejected")
  })

  it("hasVoted: oy verdikten sonra true döner", async () => {
    ctx.session!.walletAddress = OWNER
    const { id } = await call(
      proposalRouter.create,
      { daoId: DAO_ID, proposerAddress: OWNER, title: "Check Vote" },
      { context: ctx },
    )

    const before = await call(
      proposalRouter.hasVoted,
      { proposalId: id, voterAddress: MEMBER1 },
      { context: ctx },
    )
    expect(before).toBeNull()

    ctx.session!.walletAddress = MEMBER1
    await call(
      proposalRouter.vote,
      { proposalId: id, voterAddress: MEMBER1, support: true, aptosTxHash: TX },
      { context: ctx },
    )

    const after = await call(
      proposalRouter.hasVoted,
      { proposalId: id, voterAddress: MEMBER1 },
      { context: ctx },
    )
    expect(after).not.toBeNull()
    expect(after?.support).toBe(true)
  })

  it("getStats: proposal istatistiklerini döner", async () => {
    ctx.session!.walletAddress = OWNER
    await call(
      proposalRouter.create,
      { daoId: DAO_ID, proposerAddress: OWNER, title: "Proposal One" },
      { context: ctx },
    )
    ctx.session!.walletAddress = MEMBER1
    await call(
      proposalRouter.create,
      { daoId: DAO_ID, proposerAddress: MEMBER1, title: "Proposal Two" },
      { context: ctx },
    )

    const stats = await call(proposalRouter.getStats, { daoId: DAO_ID }, { context: ctx })
    expect(stats.total).toBe(2)
    expect(stats.active).toBe(2)
  })
})

describe("stakingRouter", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let client: ReturnType<typeof createTestDb>["client"]
  let ctx: ReturnType<typeof createMockContext>

  const STAKER = "0x" + "e".repeat(64)
  const STAKE_TX = "0x" + "f".repeat(64)

  beforeEach(async () => {
    const testDb = createTestDb()
    db = testDb.db
    client = testDb.client
    await setupTestSchema(client)
    ctx = createMockContext(db)
  })

  it("stake: stake kaydeder ve boost döner", async () => {
    ctx.session!.walletAddress = STAKER
    const result = await call(
      stakingRouter.stake,
      { stakerAddress: STAKER, amount: 100_0_000_000, tier: 1, aptosTxHash: STAKE_TX },
      { context: ctx },
    )
    expect(result.boostBps).toBe(200) // 90-day tier = 2x
    expect(result.unlockAt).toBeDefined()
  })

  it("getStake: stake bilgisini döner", async () => {
    ctx.session!.walletAddress = STAKER
    await call(
      stakingRouter.stake,
      { stakerAddress: STAKER, amount: 100_0_000_000, tier: 0, aptosTxHash: STAKE_TX },
      { context: ctx },
    )

    const stake = await call(stakingRouter.getStake, { stakerAddress: STAKER }, { context: ctx })
    expect(stake).not.toBeNull()
    expect(stake?.tier).toBe(0)
    expect(stake?.boostBps).toBe(150)
  })

  it("getBoost: stake yoksa 1.0x döner", async () => {
    const boost = await call(stakingRouter.getBoost, { stakerAddress: STAKER }, { context: ctx })
    expect(boost.boostBps).toBe(100)
    expect(boost.multiplier).toBe("1.0x")
    expect(boost.staking).toBe(false)
  })

  it("getBoost: stake varsa doğru multiplier döner", async () => {
    ctx.session!.walletAddress = STAKER
    await call(
      stakingRouter.stake,
      { stakerAddress: STAKER, amount: 100_0_000_000, tier: 2, aptosTxHash: STAKE_TX },
      { context: ctx },
    )
    const boost = await call(stakingRouter.getBoost, { stakerAddress: STAKER }, { context: ctx })
    expect(boost.boostBps).toBe(300)
    expect(boost.multiplier).toBe("3.0x")
  })

  it("unstake: stake kaydını siler", async () => {
    ctx.session!.walletAddress = STAKER
    await call(
      stakingRouter.stake,
      { stakerAddress: STAKER, amount: 100_0_000_000, tier: 0, aptosTxHash: STAKE_TX },
      { context: ctx },
    )
    await call(stakingRouter.unstake, { stakerAddress: STAKER }, { context: ctx })
    const stake = await call(stakingRouter.getStake, { stakerAddress: STAKER }, { context: ctx })
    expect(stake).toBeNull()
  })
})

describe("delegationRouter", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let client: ReturnType<typeof createTestDb>["client"]
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(async () => {
    const testDb = createTestDb()
    db = testDb.db
    client = testDb.client
    await setupTestSchema(client)
    ctx = createMockContext(db)

    // Seed DAO + members
    await db.insert(daos).values({
      id: DAO_ID,
      name: "Delegation DAO",
      slug: "delegation",
      ownerAddress: OWNER,
      treasuryAddress: OWNER,
      createdAt: new Date(),
    })
    await db.insert(daoMemberships).values([
      {
        id: "m-owner",
        daoId: DAO_ID,
        memberAddress: OWNER,
        votingPower: 10,
        role: "owner",
        joinedAt: new Date(),
      },
      {
        id: "m-1",
        daoId: DAO_ID,
        memberAddress: MEMBER1,
        votingPower: 5,
        role: "member",
        joinedAt: new Date(),
      },
    ])
  })

  it("delegate: oy gücünü delege eder", async () => {
    ctx.session!.walletAddress = MEMBER1
    const result = await call(
      delegationRouter.delegate,
      { daoId: DAO_ID, delegatorAddress: MEMBER1, delegateeAddress: OWNER, aptosTxHash: TX },
      { context: ctx },
    )
    expect(result.delegatedPower).toBe(5)
    expect(result.id).toBeTruthy()
  })

  it("delegate: kendine delege edilemez", async () => {
    ctx.session!.walletAddress = OWNER
    await expect(
      call(
        delegationRouter.delegate,
        { daoId: DAO_ID, delegatorAddress: OWNER, delegateeAddress: OWNER, aptosTxHash: TX },
        { context: ctx },
      ),
    ).rejects.toThrow("Cannot delegate to yourself")
  })

  it("get: aktif delegasyonu döner", async () => {
    ctx.session!.walletAddress = MEMBER1
    await call(
      delegationRouter.delegate,
      { daoId: DAO_ID, delegatorAddress: MEMBER1, delegateeAddress: OWNER, aptosTxHash: TX },
      { context: ctx },
    )

    const delegation = await call(
      delegationRouter.get,
      { daoId: DAO_ID, delegatorAddress: MEMBER1 },
      { context: ctx },
    )
    expect(delegation).not.toBeNull()
    expect(delegation?.delegateeAddress).toBe(OWNER)
  })

  it("revoke: delegasyonu iptal eder", async () => {
    ctx.session!.walletAddress = MEMBER1
    await call(
      delegationRouter.delegate,
      { daoId: DAO_ID, delegatorAddress: MEMBER1, delegateeAddress: OWNER, aptosTxHash: TX },
      { context: ctx },
    )
    await call(
      delegationRouter.revoke,
      { daoId: DAO_ID, delegatorAddress: MEMBER1 },
      { context: ctx },
    )

    const delegation = await call(
      delegationRouter.get,
      { daoId: DAO_ID, delegatorAddress: MEMBER1 },
      { context: ctx },
    )
    expect(delegation).toBeNull()
  })

  it("listDelegators: delegatee'nin delegatörlerini listeler", async () => {
    ctx.session!.walletAddress = MEMBER1
    await call(
      delegationRouter.delegate,
      { daoId: DAO_ID, delegatorAddress: MEMBER1, delegateeAddress: OWNER, aptosTxHash: TX },
      { context: ctx },
    )

    const delegators = await call(
      delegationRouter.listDelegators,
      { daoId: DAO_ID, delegateeAddress: OWNER },
      { context: ctx },
    )
    expect(delegators).toHaveLength(1)
    expect(delegators[0]?.delegatorAddress).toBe(MEMBER1)
  })
})
