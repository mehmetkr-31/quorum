import { contributions, daos, datasets } from "@quorum/db"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { assertSessionWallet, protectedProcedure, publicProcedure } from "../index"

// ── HuggingFace Hub helpers ──────────────────────────────────────────────────

const HF_API = "https://huggingface.co/api"

async function hfFetch(path: string, options: RequestInit, token: string) {
  const res = await fetch(`${HF_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HuggingFace API error ${res.status}: ${text}`)
  }
  return res
}

async function ensureHfRepo(repoId: string, token: string) {
  try {
    await hfFetch(`/repos/${repoId}`, { method: "GET" }, token)
  } catch {
    // Repo doesn't exist, create it
    await hfFetch(
      "/repos/create",
      {
        method: "POST",
        body: JSON.stringify({
          type: "dataset",
          name: repoId.split("/").pop(),
          organization: repoId.includes("/") ? repoId.split("/")[0] : undefined,
          private: false,
        }),
      },
      token,
    )
  }
}

async function uploadFileToHf(
  repoId: string,
  filePath: string,
  content: string,
  token: string,
  commitMessage: string,
) {
  // Use the commit API for file upload
  const res = await fetch(`${HF_API}/datasets/${repoId}/commit/main`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: commitMessage,
      operations: [
        {
          key: "file",
          value: {
            path: filePath,
            content: Buffer.from(content).toString("base64"),
            encoding: "base64",
          },
        },
      ],
    }),
  })
  if (!res.ok) {
    // Fallback: try the simple upload endpoint
    const uploadRes = await fetch(
      `https://huggingface.co/api/datasets/${repoId}/upload/main/${filePath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/plain",
        },
        body: content,
      },
    )
    if (!uploadRes.ok) {
      const text = await uploadRes.text()
      throw new Error(`HuggingFace upload failed ${uploadRes.status}: ${text}`)
    }
  }
}

export const datasetRouter = {
  create: protectedProcedure
    .input(
      z.object({
        daoId: z.string(),
        name: z.string().min(1),
        description: z.string().optional(),
        ownerAddress: z.string(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      assertSessionWallet(ctx, input.ownerAddress)

      // Verify DAO exists
      const [dao] = await ctx.db
        .select({ id: daos.id })
        .from(daos)
        .where(eq(daos.id, input.daoId))
        .limit(1)

      if (!dao) throw new Error("DAO not found")

      const id = crypto.randomUUID()
      await ctx.db.insert(datasets).values({
        id,
        daoId: input.daoId,
        name: input.name,
        description: input.description,
        ownerAddress: input.ownerAddress,
        createdAt: new Date(),
      })
      return { id }
    }),

  list: publicProcedure
    .input(
      z
        .object({
          daoId: z.string().optional(),
          limit: z.number().default(50).optional(),
        })
        .optional(),
    )
    .handler(async ({ input, context: ctx }) => {
      const filters = []
      if (input?.daoId) filters.push(eq(datasets.daoId, input.daoId))

      const rows = await ctx.db
        .select({
          id: datasets.id,
          daoId: datasets.daoId,
          name: datasets.name,
          description: datasets.description,
          ownerAddress: datasets.ownerAddress,
          createdAt: datasets.createdAt,
          totalWeight: datasets.totalWeight,
          contributionCount: sql<number>`count(${contributions.id})`.mapWith(Number),
          lastActivity: sql<Date | null>`max(${contributions.createdAt})`,
        })
        .from(datasets)
        .leftJoin(contributions, eq(datasets.id, contributions.datasetId))
        .where(filters.length > 0 ? and(...filters) : undefined)
        .groupBy(datasets.id)
        .limit(input?.limit ?? 50)

      return rows
    }),

  // HuggingFace-compatible JSONL export — approved contributions only
  export: publicProcedure
    .input(z.object({ datasetId: z.string() }))
    .handler(async ({ input, context: ctx }) => {
      const [dataset] = await ctx.db
        .select()
        .from(datasets)
        .where(eq(datasets.id, input.datasetId))
        .limit(1)

      if (!dataset) throw new Error("Dataset not found")

      const rows = await ctx.db
        .select({
          id: contributions.id,
          contributorAddress: contributions.contributorAddress,
          shelbyAccount: contributions.shelbyAccount,
          shelbyBlobName: contributions.shelbyBlobName,
          dataHash: contributions.dataHash,
          weight: contributions.weight,
          aptosTxHash: contributions.aptosTxHash,
          createdAt: contributions.createdAt,
        })
        .from(contributions)
        .where(
          and(eq(contributions.datasetId, input.datasetId), eq(contributions.status, "approved")),
        )

      return rows.map((r) => ({
        id: r.id,
        dataset_id: input.datasetId,
        dao_id: dataset.daoId,
        dataset_name: dataset.name,
        contributor: r.contributorAddress,
        shelby_account: r.shelbyAccount,
        shelby_blob: r.shelbyBlobName,
        data_hash: r.dataHash,
        weight: r.weight,
        aptos_tx: r.aptosTxHash,
        created_at: r.createdAt,
        source: "quorum-dao",
      }))
    }),

  /**
   * Push a dataset to HuggingFace Hub.
   * Creates/updates a HF dataset repo with:
   *   - data/train.jsonl — approved contribution metadata
   *   - README.md — dataset card
   * Requires HUGGINGFACE_TOKEN env var or a user-provided token.
   */
  pushToHub: protectedProcedure
    .input(
      z.object({
        datasetId: z.string(),
        repoId: z
          .string()
          .regex(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/, "Format: username/dataset-name"),
        hfToken: z.string().optional(),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const token = input.hfToken || process.env.HUGGINGFACE_TOKEN
      if (!token) {
        throw new Error(
          "HuggingFace token required. Set HUGGINGFACE_TOKEN env var or provide hfToken.",
        )
      }

      // Fetch dataset
      const [dataset] = await ctx.db
        .select()
        .from(datasets)
        .where(eq(datasets.id, input.datasetId))
        .limit(1)

      if (!dataset) throw new Error("Dataset not found")

      // Fetch approved contributions
      const rows = await ctx.db
        .select({
          id: contributions.id,
          contributorAddress: contributions.contributorAddress,
          shelbyAccount: contributions.shelbyAccount,
          shelbyBlobName: contributions.shelbyBlobName,
          dataHash: contributions.dataHash,
          weight: contributions.weight,
          aptosTxHash: contributions.aptosTxHash,
          createdAt: contributions.createdAt,
        })
        .from(contributions)
        .where(
          and(eq(contributions.datasetId, input.datasetId), eq(contributions.status, "approved")),
        )

      if (rows.length === 0) {
        throw new Error("No approved contributions to push")
      }

      // Build JSONL
      const jsonlRows = rows.map((r) =>
        JSON.stringify({
          id: r.id,
          dataset_id: input.datasetId,
          dao_id: dataset.daoId,
          dataset_name: dataset.name,
          contributor: r.contributorAddress,
          shelby_account: r.shelbyAccount,
          shelby_blob: r.shelbyBlobName,
          data_hash: r.dataHash,
          weight: r.weight,
          aptos_tx: r.aptosTxHash,
          created_at: r.createdAt,
          source: "quorum-dao",
        }),
      )
      const jsonl = jsonlRows.join("\n")

      // Build README dataset card
      const readme = [
        "---",
        "license: mit",
        `tags:`,
        `  - quorum-dao`,
        `  - community-governed`,
        `  - ai-training-data`,
        `size_categories:`,
        rows.length < 100 ? "  - n<1K" : rows.length < 10000 ? "  - 1K<n<10K" : "  - 10K<n<100K",
        "---",
        "",
        `# ${dataset.name}`,
        "",
        dataset.description || "A community-governed AI training dataset from Quorum DAO.",
        "",
        "## Dataset Details",
        "",
        `- **Source**: [Quorum DAO](https://quorum.community)`,
        `- **DAO ID**: \`${dataset.daoId}\``,
        `- **Dataset ID**: \`${dataset.id}\``,
        `- **Approved Contributions**: ${rows.length}`,
        `- **Total Weight**: ${rows.reduce((sum, r) => sum + r.weight, 0).toFixed(2)}`,
        `- **Data Storage**: Shelby Protocol (decentralized)`,
        `- **Governance**: Aptos blockchain`,
        "",
        "## How It Was Built",
        "",
        "This dataset was built collaboratively by a community through Quorum DAO:",
        "",
        "1. Contributors submit data stored on Shelby Protocol",
        "2. DAO members vote on quality (approve/reject/improve)",
        "3. Approved contributions are included with weight based on community votes",
        "4. Revenue from dataset usage is automatically split among contributors",
        "",
        "## Data Format",
        "",
        "Each record in `data/train.jsonl` contains:",
        "",
        "| Field | Description |",
        "|-------|-------------|",
        "| `id` | Unique contribution ID |",
        "| `contributor` | Aptos wallet address of contributor |",
        "| `shelby_account` | Shelby Protocol storage account |",
        "| `shelby_blob` | Blob path on Shelby Protocol |",
        "| `data_hash` | SHA-256 hash of the data |",
        "| `weight` | Community-assigned quality weight |",
        "| `aptos_tx` | On-chain transaction hash |",
        "| `source` | Always `quorum-dao` |",
        "",
        "## Citation",
        "",
        "```bibtex",
        `@dataset{quorum_${dataset.id.replace(/-/g, "_")},`,
        `  title={${dataset.name}},`,
        `  author={Quorum DAO Contributors},`,
        `  year={${new Date().getFullYear()}},`,
        `  publisher={HuggingFace},`,
        `  url={https://huggingface.co/datasets/${input.repoId}}`,
        "}",
        "```",
      ].join("\n")

      // Push to HuggingFace Hub
      await ensureHfRepo(input.repoId, token)
      await uploadFileToHf(
        input.repoId,
        "data/train.jsonl",
        jsonl,
        token,
        `Update dataset: ${rows.length} approved contributions from Quorum DAO`,
      )
      await uploadFileToHf(input.repoId, "README.md", readme, token, "Update dataset card")

      return {
        repoId: input.repoId,
        url: `https://huggingface.co/datasets/${input.repoId}`,
        recordCount: rows.length,
      }
    }),
}
