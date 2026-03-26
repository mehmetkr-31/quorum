import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

const BASE_URL = process.env.QUORUM_API_URL ?? "http://localhost:3001/api/rpc"

async function rpc<T>(path: string, input?: unknown): Promise<T> {
  const url = `${BASE_URL}/${path}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Quorum API error ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

const server = new McpServer({
  name: "quorum-dao",
  version: "1.0.0",
})

// ── list_datasets ──────────────────────────────────────────────────────────
server.tool(
  "list_datasets",
  "List all available AI training datasets in the Quorum DAO marketplace",
  { limit: z.number().min(1).max(100).default(20).optional() },
  async ({ limit }) => {
    const datasets = await rpc<any[]>("dataset.list", { limit })
    const text = datasets
      .map(
        (d) =>
          `• [${d.id}] ${d.name}${d.description ? ` — ${d.description}` : ""}\n  Contributions: ${d.contributionCount ?? 0} | Weight: ${d.totalWeight ?? 0}`,
      )
      .join("\n")
    return {
      content: [{ type: "text" as const, text: text || "No datasets found." }],
    }
  },
)

// ── list_contributions ─────────────────────────────────────────────────────
server.tool(
  "list_contributions",
  "List contributions to the Quorum DAO, optionally filtered by status",
  {
    status: z.enum(["pending", "approved", "rejected"]).optional(),
    limit: z.number().min(1).max(100).default(20).optional(),
  },
  async ({ status, limit }) => {
    const contributions = await rpc<any[]>("contribution.list", { status, limit })
    const text = contributions
      .map(
        (c) =>
          `• [${c.id}] Status: ${c.status} | Dataset: ${c.datasetId}\n  Contributor: ${c.contributorAddress.slice(0, 10)}... | Weight: ${c.weight}`,
      )
      .join("\n")
    return {
      content: [{ type: "text" as const, text: text || "No contributions found." }],
    }
  },
)

// ── get_contribution_content ───────────────────────────────────────────────
server.tool(
  "get_contribution_content",
  "Fetch the actual data content of a contribution from Shelby Protocol (returns base64)",
  { id: z.string() },
  async ({ id }) => {
    const result = await rpc<{ data: string; contentType: string }>("contribution.getContent", {
      id,
    })
    const preview = Buffer.from(result.data, "base64").toString("utf-8").slice(0, 2000)
    return {
      content: [
        {
          type: "text" as const,
          text: `Content-Type: ${result.contentType}\n\n${preview}${preview.length >= 2000 ? "\n\n[truncated — use full base64 for complete data]" : ""}`,
        },
      ],
    }
  },
)

// ── export_dataset ─────────────────────────────────────────────────────────
server.tool(
  "export_dataset",
  "Export all approved contributions of a dataset as JSONL (HuggingFace-compatible format)",
  { datasetId: z.string() },
  async ({ datasetId }) => {
    const rows = await rpc<any[]>("dataset.export", { datasetId })
    if (!rows.length) {
      return { content: [{ type: "text" as const, text: "No approved contributions found." }] }
    }
    const jsonl = rows.map((r) => JSON.stringify(r)).join("\n")
    return {
      content: [
        {
          type: "text" as const,
          text: `# Dataset Export — ${datasetId}\n# Format: JSONL (one record per line)\n# Records: ${rows.length}\n\n${jsonl}`,
        },
      ],
    }
  },
)

// ── get_governance_stats ───────────────────────────────────────────────────
server.tool(
  "get_governance_stats",
  "Get overall Quorum DAO statistics: total members, contributions, and revenue",
  {},
  async () => {
    const stats = await rpc<any>("governance.getStats")
    return {
      content: [
        {
          type: "text" as const,
          text: [
            `DAO Statistics:`,
            `  Members: ${stats.totalMembers}`,
            `  Total Contributions: ${stats.totalContributions}`,
            `  Revenue Distributed: ${stats.totalRevenue} APT`,
          ].join("\n"),
        },
      ],
    }
  },
)

// ── get_leaderboard ────────────────────────────────────────────────────────
server.tool(
  "get_leaderboard",
  "Get the DAO member reputation leaderboard ranked by voting power and approved contributions",
  { limit: z.number().min(1).max(50).default(10).optional() },
  async ({ limit }) => {
    const leaderboard = await rpc<any[]>("governance.getLeaderboard", { limit })
    const text = leaderboard
      .map(
        (m, i) =>
          `${i + 1}. ${m.address.slice(0, 10)}...\n   Voting Power: ${m.votingPower} | Approved: ${m.approvedContributions}/${m.totalContributions} | Accuracy: ${m.accuracy}%`,
      )
      .join("\n")
    return {
      content: [{ type: "text" as const, text: text || "No members found." }],
    }
  },
)

// ── list_receipts ──────────────────────────────────────────────────────────
server.tool(
  "list_receipts",
  "List Shelby Protocol read receipts anchored on Aptos, with optional distribution filter",
  {
    distributed: z.boolean().optional(),
    limit: z.number().min(1).max(100).default(20).optional(),
  },
  async ({ distributed, limit }) => {
    const receipts = await rpc<any[]>("revenue.listReceipts", { distributed, limit })
    const text = receipts
      .map(
        (r) =>
          `• [${r.id}] Amount: ${(r.amount / 1e8).toFixed(4)} APT | Status: ${r.distributed ? "Distributed" : "Pending"}\n  Reader: ${r.readerAddress.slice(0, 10)}...`,
      )
      .join("\n")
    return {
      content: [{ type: "text" as const, text: text || "No receipts found." }],
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("Quorum MCP Server running on stdio")
}

main().catch(console.error)
