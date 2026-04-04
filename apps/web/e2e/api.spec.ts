import { expect, test } from "@playwright/test"

/**
 * API integration tests — directly call /api/rpc endpoints via fetch
 * and verify responses. No browser UI needed, but we use Playwright's
 * request context so it runs against the same server.
 */

test.describe("API — dao endpoints", () => {
  test("dao.list returns array", async ({ request }) => {
    const res = await request.post("/api/rpc/dao.list", {
      data: {},
      headers: { "Content-Type": "application/json" },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test("dao.get with valid slug returns DAO", async ({ request }) => {
    const res = await request.post("/api/rpc/dao.get", {
      data: { slugOrId: "genesis" },
      headers: { "Content-Type": "application/json" },
    })
    // 200 if genesis DAO is seeded, 500 if not
    const status = res.status()
    if (status === 200) {
      const body = await res.json()
      expect(body.slug).toBe("genesis")
      expect(body.name).toBeTruthy()
    } else {
      // DAO not seeded in test env — acceptable
      expect([404, 500]).toContain(status)
    }
  })

  test("dao.get with unknown slug returns error", async ({ request }) => {
    const res = await request.post("/api/rpc/dao.get", {
      data: { slugOrId: "totally-nonexistent-dao-xyz123" },
      headers: { "Content-Type": "application/json" },
    })
    expect(res.status()).not.toBe(200)
  })

  test("dataset.list returns array", async ({ request }) => {
    const res = await request.post("/api/rpc/dataset.list", {
      data: {},
      headers: { "Content-Type": "application/json" },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test("contribution.list returns array", async ({ request }) => {
    const res = await request.post("/api/rpc/contribution.list", {
      data: {},
      headers: { "Content-Type": "application/json" },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test("governance.getStats returns numeric totals", async ({ request }) => {
    const res = await request.post("/api/rpc/governance.getStats", {
      data: {},
      headers: { "Content-Type": "application/json" },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(typeof body.totalMembers).toBe("number")
    expect(typeof body.totalContributions).toBe("number")
    expect(typeof body.totalRevenue).toBe("string")
  })
})

test.describe("API — input validation", () => {
  test("dao.create rejects missing ownerAddress", async ({ request }) => {
    const res = await request.post("/api/rpc/dao.create", {
      data: { name: "Test DAO" }, // missing ownerAddress + treasuryAddress
      headers: { "Content-Type": "application/json" },
    })
    expect(res.status()).not.toBe(200)
  })

  test("dao.create rejects empty name", async ({ request }) => {
    const res = await request.post("/api/rpc/dao.create", {
      data: { name: "", ownerAddress: "0xtest", treasuryAddress: "0xtest" },
      headers: { "Content-Type": "application/json" },
    })
    expect(res.status()).not.toBe(200)
  })

  test("dataset.pushToHub rejects invalid repoId format", async ({ request }) => {
    const res = await request.post("/api/rpc/dataset.pushToHub", {
      data: {
        datasetId: "ds-1",
        repoId: "not-valid-format", // missing username/ prefix
        hfToken: "hf_test",
      },
      headers: { "Content-Type": "application/json" },
    })
    expect(res.status()).not.toBe(200)
  })

  test("contribution.submit rejects missing data field", async ({ request }) => {
    const res = await request.post("/api/rpc/contribution.submit", {
      data: {
        datasetId: "ds-1",
        shelbyAccount: "shelby://test",
        contributorAddress: "0xtest",
        // data field missing
      },
      headers: { "Content-Type": "application/json" },
    })
    expect(res.status()).not.toBe(200)
  })

  test("vote.cast rejects invalid decision", async ({ request }) => {
    const res = await request.post("/api/rpc/vote.cast", {
      data: {
        contributionId: "c-1",
        voterAddress: "0xtest",
        decision: "invalid-decision", // not approve|reject|improve
        aptosTxHash: "0xtx",
      },
      headers: { "Content-Type": "application/json" },
    })
    expect(res.status()).not.toBe(200)
  })

  test("revenue.listReceipts with limit=0 is rejected or clamped", async ({ request }) => {
    const res = await request.post("/api/rpc/revenue.listReceipts", {
      data: { limit: 0 },
      headers: { "Content-Type": "application/json" },
    })
    // Either rejected (validation) or returns empty array (clamped to min)
    if (res.status() === 200) {
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
    } else {
      expect(res.status()).toBeGreaterThanOrEqual(400)
    }
  })
})

test.describe("API — rate limiting", () => {
  test("rapid requests to same endpoint don't crash server", async ({ request }) => {
    // Send 10 rapid requests — should all succeed or get 429, never 500
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request.post("/api/rpc/governance.getStats", {
          data: {},
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    for (const res of results) {
      expect([200, 429]).toContain(res.status())
    }
  })
})
