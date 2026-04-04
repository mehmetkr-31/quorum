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

interface Dao {
  id: string
  name: string
  slug: string
  description?: string
  memberCount?: number
  datasetCount?: number
  contributionCount?: number
}

interface Dataset {
  id: string
  daoId?: string
  name: string
  description?: string
  contributionCount?: number
  totalWeight?: number
}

interface Contribution {
  id: string
  status: string
  datasetId: string
  contributorAddress: string
  weight: number
}

interface Stats {
  totalMembers: number
  totalContributions: number
  totalRevenue: number
}

interface DaoStats {
  totalMembers: number
  totalDatasets: number
  totalContributions: number
}

interface LeaderboardMember {
  address?: string
  memberAddress?: string
  votingPower: number
  approvedContributions: number
  totalContributions: number
  accuracy: number
}

interface Receipt {
  id: string
  amount: number
  distributed: boolean
  readerAddress: string
}

const server = new McpServer({
  name: "quorum-dao",
  version: "2.0.0",
})

// ── list_daos ──────────────────────────────────────────────────────────────
server.tool(
  "list_daos",
  "List all DAOs in the Quorum platform. Each DAO is a community that governs its own AI training datasets.",
  { limit: z.number().min(1).max(100).default(20).optional() },
  async ({ limit }) => {
    const daos = await rpc<Dao[]>("dao.list", { limit })
    const text = daos
      .map(
        (d) =>
          `• [${d.slug}] ${d.name}${d.description ? ` — ${d.description}` : ""}\n  Members: ${d.memberCount ?? 0} | Datasets: ${d.datasetCount ?? 0} | Contributions: ${d.contributionCount ?? 0}`,
      )
      .join("\n")
    return {
      content: [{ type: "text" as const, text: text || "No DAOs found." }],
    }
  },
)

// ── get_dao ────────────────────────────────────────────────────────────────
server.tool(
  "get_dao",
  "Get details about a specific DAO by slug or ID",
  { slugOrId: z.string() },
  async ({ slugOrId }) => {
    const dao = await rpc<Dao>("dao.get", { slugOrId })
    return {
      content: [
        {
          type: "text" as const,
          text: [
            `DAO: ${dao.name} (/${dao.slug})`,
            dao.description ? `Description: ${dao.description}` : null,
            `Members: ${dao.memberCount ?? "?"}`,
            `Datasets: ${dao.datasetCount ?? "?"}`,
            `Contributions: ${dao.contributionCount ?? "?"}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    }
  },
)

// ── get_dao_stats ──────────────────────────────────────────────────────────
server.tool(
  "get_dao_stats",
  "Get statistics for a specific DAO: members, datasets, contributions",
  { daoId: z.string() },
  async ({ daoId }) => {
    const stats = await rpc<DaoStats>("dao.getStats", { daoId })
    return {
      content: [
        {
          type: "text" as const,
          text: [
            `DAO Statistics:`,
            `  Members: ${stats.totalMembers}`,
            `  Datasets: ${stats.totalDatasets}`,
            `  Contributions: ${stats.totalContributions}`,
          ].join("\n"),
        },
      ],
    }
  },
)

// ── list_datasets ──────────────────────────────────────────────────────────
server.tool(
  "list_datasets",
  "List AI training datasets, optionally filtered by DAO",
  {
    daoId: z.string().optional(),
    limit: z.number().min(1).max(100).default(20).optional(),
  },
  async ({ daoId, limit }) => {
    const datasets = await rpc<Dataset[]>("dataset.list", { daoId, limit })
    const text = datasets
      .map(
        (d) =>
          `• [${d.id}] ${d.name}${d.description ? ` — ${d.description}` : ""}\n  DAO: ${d.daoId ?? "?"} | Contributions: ${d.contributionCount ?? 0} | Weight: ${d.totalWeight ?? 0}`,
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
    const contributions = await rpc<Contribution[]>("contribution.list", { status, limit })
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
    const rows = await rpc<Record<string, unknown>[]>("dataset.export", { datasetId })
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
  "Get overall Quorum platform statistics: total members, contributions, and revenue across all DAOs",
  {},
  async () => {
    const stats = await rpc<Stats>("governance.getStats")
    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Platform-wide Statistics:`,
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
  "Get the global member reputation leaderboard ranked by voting power",
  { limit: z.number().min(1).max(50).default(10).optional() },
  async ({ limit }) => {
    const leaderboard = await rpc<LeaderboardMember[]>("governance.getLeaderboard", { limit })
    const text = leaderboard
      .map(
        (m, i) =>
          `${i + 1}. ${(m.address ?? m.memberAddress ?? "?").slice(0, 10)}...\n   Voting Power: ${m.votingPower} | Approved: ${m.approvedContributions}/${m.totalContributions} | Accuracy: ${m.accuracy}%`,
      )
      .join("\n")
    return {
      content: [{ type: "text" as const, text: text || "No members found." }],
    }
  },
)

// ── get_dao_leaderboard ────────────────────────────────────────────────────
server.tool(
  "get_dao_leaderboard",
  "Get the reputation leaderboard for a specific DAO",
  {
    daoId: z.string(),
    limit: z.number().min(1).max(50).default(10).optional(),
  },
  async ({ daoId, limit }) => {
    const leaderboard = await rpc<LeaderboardMember[]>("governance.getDaoLeaderboard", {
      daoId,
      limit,
    })
    const text = leaderboard
      .map(
        (m, i) =>
          `${i + 1}. ${(m.memberAddress ?? m.address ?? "?").slice(0, 10)}...\n   Voting Power: ${m.votingPower} | Approved: ${m.approvedContributions}/${m.totalContributions} | Accuracy: ${m.accuracy}%`,
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
    const receipts = await rpc<Receipt[]>("revenue.listReceipts", { distributed, limit })
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

// ── push_to_huggingface ────────────────────────────────────────────────────
server.tool(
  "push_to_huggingface",
  "Push a Quorum dataset to HuggingFace Hub as a JSONL dataset with a proper dataset card",
  {
    datasetId: z.string(),
    repoId: z.string().describe("HuggingFace repo ID in format: username/dataset-name"),
    hfToken: z
      .string()
      .optional()
      .describe("HuggingFace token (optional if HUGGINGFACE_TOKEN is set server-side)"),
  },
  async ({ datasetId, repoId, hfToken }) => {
    const result = await rpc<{ repoId: string; url: string; recordCount: number }>(
      "dataset.pushToHub",
      { datasetId, repoId, hfToken },
    )
    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Successfully pushed to HuggingFace Hub!`,
            `  Repository: ${result.repoId}`,
            `  URL: ${result.url}`,
            `  Records: ${result.recordCount}`,
          ].join("\n"),
        },
      ],
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("Quorum MCP Server v2 running on stdio (multi-DAO)")
}

main().catch(console.error)
