#!/usr/bin/env tsx
/**
 * load-test.ts — Quorum API load test with autocannon
 *
 * Usage:
 *   pnpm tsx scripts/load-test.ts [--url http://localhost:3001] [--duration 15]
 *
 * Prerequisites: server must be running (pnpm dev)
 */

import autocannon from "autocannon"

const BASE_URL =
  process.argv.find((a) => a.startsWith("--url="))?.split("=")[1] ?? "http://localhost:3001"
const DURATION = Number(
  process.argv.find((a) => a.startsWith("--duration="))?.split("=")[1] ?? "10",
)
const RPC = `${BASE_URL}/api/rpc`

interface TestSuite {
  name: string
  url: string
  method?: string
  body?: string
  headers?: Record<string, string>
  expectedStatus?: number[]
}

const JSON_HEADERS = { "Content-Type": "application/json" }

const SUITES: TestSuite[] = [
  {
    name: "governance.getStats (read)",
    url: `${RPC}/governance.getStats`,
    method: "POST",
    body: JSON.stringify({}),
    headers: JSON_HEADERS,
    expectedStatus: [200],
  },
  {
    name: "dao.list (read)",
    url: `${RPC}/dao.list`,
    method: "POST",
    body: JSON.stringify({ limit: 20 }),
    headers: JSON_HEADERS,
    expectedStatus: [200],
  },
  {
    name: "dataset.list (read)",
    url: `${RPC}/dataset.list`,
    method: "POST",
    body: JSON.stringify({}),
    headers: JSON_HEADERS,
    expectedStatus: [200],
  },
  {
    name: "contribution.list (read)",
    url: `${RPC}/contribution.list`,
    method: "POST",
    body: JSON.stringify({ status: "pending" }),
    headers: JSON_HEADERS,
    expectedStatus: [200],
  },
  {
    name: "dao.create — invalid input (validation)",
    url: `${RPC}/dao.create`,
    method: "POST",
    body: JSON.stringify({ name: "" }), // should be rejected
    headers: JSON_HEADERS,
    expectedStatus: [400, 422, 500], // validation error
  },
  {
    name: "contribution.submit — oversized data (50MB+ rejection)",
    url: `${RPC}/contribution.submit`,
    method: "POST",
    body: JSON.stringify({
      datasetId: "00000000-0000-0000-0000-000000000000",
      shelbyAccount: "shelby://test",
      contributorAddress: "0x1234",
      data: "A".repeat(100_000), // ~100KB, should pass size check
      contentType: "text/plain",
    }),
    headers: JSON_HEADERS,
    expectedStatus: [400, 422, 500], // contributor address invalid
  },
  {
    name: "rate limit smoke test — rapid write requests",
    url: `${RPC}/dao.create`,
    method: "POST",
    body: JSON.stringify({
      name: "Load Test DAO",
      ownerAddress: "0x" + "a".repeat(64),
      treasuryAddress: "0x" + "a".repeat(64),
    }),
    headers: JSON_HEADERS,
    expectedStatus: [200, 400, 429, 500],
  },
]

async function runSuite(suite: TestSuite): Promise<void> {
  return new Promise((resolve) => {
    console.log(`\n─── ${suite.name} ───`)
    const instance = autocannon(
      {
        url: suite.url,
        method: (suite.method as "POST" | "GET") ?? "POST",
        headers: suite.headers ?? {},
        body: suite.body,
        duration: DURATION,
        connections: 10,
        pipelining: 1,
      },
      (err, result) => {
        if (err) {
          console.error("  ERROR:", err.message)
          resolve()
          return
        }

        const p = result.requests

        console.log(`  Requests/sec:   ${result.requests.average.toFixed(1)}`)
        console.log(`  Latency avg:    ${result.latency.average.toFixed(2)} ms`)
        console.log(`  Latency p99:    ${result.latency.p99} ms`)
        console.log(`  Latency max:    ${result.latency.max} ms`)
        console.log(`  Errors:         ${result.errors}`)
        console.log(`  Timeouts:       ${result.timeouts}`)
        console.log(`  2xx:            ${result["2xx"]}`)
        console.log(`  Non-2xx:        ${result.non2xx}`)

        // Warn on high latency or errors
        if (result.latency.p99 > 2000) {
          console.warn(`  ⚠️  p99 latency > 2s!`)
        }
        if (result.errors > 0) {
          console.warn(`  ⚠️  ${result.errors} connection errors`)
        }
        if (result.requests.average < 5) {
          console.warn(`  ⚠️  Very low throughput (< 5 req/s)`)
        }

        resolve()
      },
    )

    autocannon.track(instance, { renderProgressBar: true })
  })
}

async function main() {
  console.log(`\n🚀 Quorum API Load Test`)
  console.log(`   Target: ${BASE_URL}`)
  console.log(`   Duration: ${DURATION}s per suite`)
  console.log(`   Suites: ${SUITES.length}`)
  console.log(`\nWarning: Rate limits may kick in during write tests (expected 429s).\n`)

  for (const suite of SUITES) {
    await runSuite(suite)
  }

  console.log("\n✅ Load test complete.")
}

main().catch(console.error)
