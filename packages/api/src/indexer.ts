import path from "node:path"
import { config } from "dotenv"

// Load .env from apps/web — resolve relative to this file's location
const webEnvPath = path.resolve(import.meta.dirname, "../../../apps/web/.env")
config({ path: webEnvPath })

import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk"
import {
  contributions,
  createDb,
  datasets,
  indexerState,
  members,
  receipts,
  votes,
} from "@quorum/db"
import { eq } from "drizzle-orm"

// ── Database ─────────────────────────────────────────────────────────────────
const webDir = path.resolve(import.meta.dirname, "../../../apps/web")
const rawDbUrl = process.env.DATABASE_URL || "file:./local.db"
const dbUrl = rawDbUrl.startsWith("file:./")
  ? `file:${path.resolve(webDir, rawDbUrl.slice(7))}`
  : rawDbUrl
const dbToken = process.env.DATABASE_AUTH_TOKEN
const db = createDb(dbUrl, dbToken)

// ── Aptos client ─────────────────────────────────────────────────────────────
// Detect network from node URL — shelbynet has no indexer endpoint, so we use
// getAccountTransactions (REST fullnode) instead of queryIndexer (GraphQL).
const NODE_URL = process.env.APTOS_NODE_URL
function detectNetwork(url?: string): Network {
  if (!url) return Network.TESTNET
  if (url.includes("shelbynet")) return Network.SHELBYNET
  if (url.includes("testnet")) return Network.TESTNET
  if (url.includes("mainnet")) return Network.MAINNET
  if (url.includes("localhost") || url.includes("127.0.0.1")) return Network.LOCAL
  return Network.CUSTOM
}
const aptosConfig = new AptosConfig({
  network: detectNetwork(NODE_URL),
  fullnode: NODE_URL || "https://fullnode.testnet.aptoslabs.com/v1",
})
const aptos = new Aptos(aptosConfig)

const CONTRACT_ADDRESS = process.env.QUORUM_CONTRACT_ADDRESS
if (!CONTRACT_ADDRESS) {
  console.warn("QUORUM_CONTRACT_ADDRESS is not set. Indexer will not run.")
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const HEX_DECODER = new TextDecoder()
function hexToString(hex: string): string {
  if (hex.startsWith("0x")) hex = hex.slice(2)
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || [])
  return HEX_DECODER.decode(bytes).replace(/\0/g, "")
}

// Track progress by the highest transaction version we've processed.
// Stored in indexer_state with eventType = "lastTxVersion".
async function loadLastVersion(): Promise<bigint> {
  const rows = await db
    .select()
    .from(indexerState)
    .where(eq(indexerState.eventType, "lastTxVersion"))
  return rows[0] ? BigInt(rows[0].lastSequenceNumber) : 0n
}

async function saveLastVersion(version: bigint) {
  await db
    .insert(indexerState)
    .values({
      eventType: "lastTxVersion",
      lastSequenceNumber: version.toString(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: indexerState.eventType,
      set: { lastSequenceNumber: version.toString(), updatedAt: new Date() },
    })
}

// Upsert a minimal dataset row so FK constraints on contributions/receipts pass.
async function ensureDataset(datasetId: string) {
  await db
    .insert(datasets)
    .values({
      id: datasetId,
      name: datasetId,
      ownerAddress: CONTRACT_ADDRESS!,
      createdAt: new Date(),
    })
    .onConflictDoNothing()
}

// ── Event interfaces ──────────────────────────────────────────────────────────
interface ChainEvent {
  type: string
  data: Record<string, unknown>
}

interface UserTxn {
  hash: string
  version: string
  events: ChainEvent[]
  success: boolean
}

// ── Core processing loop ──────────────────────────────────────────────────────
async function processEvents(exitAfter = false) {
  if (!CONTRACT_ADDRESS) return

  console.log("Indexer: scanning transactions for new events...")
  const lastVersion = await loadLastVersion()
  let maxVersionSeen = lastVersion
  let offset = 0
  const LIMIT = 25
  let totalProcessed = 0

  while (true) {
    const txns = (await aptos.getAccountTransactions({
      accountAddress: CONTRACT_ADDRESS,
      options: { offset, limit: LIMIT },
    })) as unknown as UserTxn[]

    if (txns.length === 0) break

    for (const txn of txns) {
      const version = BigInt(txn.version ?? 0)
      if (version <= lastVersion) continue
      if (version > maxVersionSeen) maxVersionSeen = version
      if (!txn.success || !txn.events?.length) continue

      for (const ev of txn.events) {
        try {
          // 1. ContributionSubmitted ─────────────────────────────────────────
          if (ev.type === `${CONTRACT_ADDRESS}::dao_governance::ContributionSubmitted`) {
            const d = ev.data as {
              contribution_id: string
              dataset_id: string
              contributor: string
              timestamp: string
            }
            const contribId = hexToString(d.contribution_id)
            const datasetId = hexToString(d.dataset_id)
            console.log(`  [ContributionSubmitted] ${contribId}  (dataset: ${datasetId})`)

            await ensureDataset(datasetId)
            await db
              .insert(contributions)
              .values({
                id: contribId,
                datasetId,
                contributorAddress: d.contributor,
                shelbyAccount: "", // not emitted in event; filled when submitted via API
                shelbyBlobName: "",
                dataHash: "",
                status: "pending",
                aptosTxHash: txn.hash,
                createdAt: new Date(Number(BigInt(d.timestamp) / 1000n)),
              })
              .onConflictDoNothing()
            totalProcessed++
          }

          // 2. VoteCast ────────────────────────────────────────────────────
          else if (ev.type === `${CONTRACT_ADDRESS}::dao_governance::VoteCast`) {
            const d = ev.data as {
              contribution_id: string
              voter: string
              decision: number
              voting_power: string
              timestamp: string
            }
            const contribId = hexToString(d.contribution_id)
            const decisionStr =
              Number(d.decision) === 0 ? "approve" : Number(d.decision) === 1 ? "reject" : "improve"
            console.log(`  [VoteCast] ${d.voter} → ${decisionStr} on ${contribId}`)

            // Upsert member
            await db
              .insert(members)
              .values({
                address: d.voter,
                votingPower: Number(d.voting_power),
                joinedAt: new Date(),
              })
              .onConflictDoNothing()

            // Insert vote (use tx hash as ID — one vote per tx)
            await db
              .insert(votes)
              .values({
                id: txn.hash,
                contributionId: contribId,
                voterAddress: d.voter,
                decision: decisionStr as "approve" | "reject" | "improve",
                votingPower: Number(d.voting_power),
                aptosTxHash: txn.hash,
                createdAt: new Date(Number(BigInt(d.timestamp) / 1000n)),
              })
              .onConflictDoNothing()
            totalProcessed++
          }

          // 3. ContributionFinalized ─────────────────────────────────────────
          else if (ev.type === `${CONTRACT_ADDRESS}::dao_governance::ContributionFinalized`) {
            const d = ev.data as {
              contribution_id: string
              approved: boolean
              weight: string
              timestamp: string
            }
            const contribId = hexToString(d.contribution_id)
            console.log(`  [ContributionFinalized] ${contribId}  approved=${d.approved}`)

            await db
              .update(contributions)
              .set({
                status: d.approved ? "approved" : "rejected",
                weight: d.approved ? Number(d.weight) : 0,
              })
              .where(eq(contributions.id, contribId))

            // Update member counters from on-chain state when approved
            if (d.approved) {
              const contribRows = await db
                .select({ contributorAddress: contributions.contributorAddress })
                .from(contributions)
                .where(eq(contributions.id, contribId))
                .limit(1)
              const contributorAddress = contribRows[0]?.contributorAddress
              if (contributorAddress) {
                try {
                  const memberResource = (await aptos.getAccountResource({
                    accountAddress: contributorAddress,
                    resourceType: `${CONTRACT_ADDRESS}::dao_governance::Member`,
                  })) as {
                    approved_contributions?: number
                    total_contributions?: number
                    voting_power?: number
                  }
                  await db
                    .update(members)
                    .set({
                      approvedContributions: Number(memberResource.approved_contributions ?? 0),
                      totalContributions: Number(memberResource.total_contributions ?? 0),
                      votingPower: Number(memberResource.voting_power ?? 1),
                    })
                    .where(eq(members.address, contributorAddress))
                } catch (memberErr) {
                  console.warn(
                    `  [ContributionFinalized] Could not fetch Member resource for ${contributorAddress}:`,
                    memberErr,
                  )
                }
              }
            }
            totalProcessed++
          }

          // 4. ReceiptAnchored ──────────────────────────────────────────────
          else if (ev.type === `${CONTRACT_ADDRESS}::revenue_splitter::ReceiptAnchored`) {
            const d = ev.data as {
              dataset_id: string
              shelby_receipt_hash: string
              reader: string
              amount: string
              timestamp: string
            }
            const datasetId = hexToString(d.dataset_id)
            // receipt hash is raw bytes → store as hex string (no 0x prefix)
            const receiptHash = String(d.shelby_receipt_hash).replace(/^0x/, "")
            console.log(
              `  [ReceiptAnchored] dataset=${datasetId}  reader=${d.reader}  hash=${receiptHash.slice(0, 16)}...`,
            )

            await ensureDataset(datasetId)
            await db
              .insert(receipts)
              .values({
                id: txn.hash,
                datasetId,
                readerAddress: d.reader,
                shelbyReceiptHash: receiptHash,
                aptosTxHash: txn.hash,
                amount: Number(d.amount),
                distributed: false,
                createdAt: new Date(Number(BigInt(d.timestamp) / 1000n)),
              })
              .onConflictDoNothing()
            totalProcessed++
          }

          // 5. RevenueDistributed ───────────────────────────────────────────
          else if (ev.type === `${CONTRACT_ADDRESS}::revenue_splitter::RevenueDistributed`) {
            const d = ev.data as { shelby_receipt_hash: string }
            const receiptHash = String(d.shelby_receipt_hash).replace(/^0x/, "")
            console.log(`  [RevenueDistributed] hash=${receiptHash.slice(0, 16)}...`)

            await db
              .update(receipts)
              .set({ distributed: true })
              .where(eq(receipts.shelbyReceiptHash, receiptHash))
            totalProcessed++
          }
        } catch (evErr) {
          console.error(`  [Error] processing ${ev.type.split("::").pop()}:`, evErr)
        }
      }
    }

    if (txns.length < LIMIT) break // reached the last page
    offset += LIMIT
  }

  if (maxVersionSeen > lastVersion) {
    await saveLastVersion(maxVersionSeen)
  }

  console.log(
    `Indexer: done — ${totalProcessed} events processed, last tx version: ${maxVersionSeen}`,
  )

  if (exitAfter) process.exit(0)
}

// ── Daemon mode ───────────────────────────────────────────────────────────────
export function startIndexer(intervalMs = 60_000) {
  if (!CONTRACT_ADDRESS) {
    console.log("Indexer disabled (no contract address).")
    return
  }
  console.log(`Starting Quorum Indexer → ${CONTRACT_ADDRESS}`)
  processEvents()
  setInterval(processEvents, intervalMs)
}

// ── One-shot mode (run directly) ──────────────────────────────────────────────
if (
  import.meta.url.startsWith("file:") &&
  process.argv[1] &&
  import.meta.url.includes(process.argv[1].split("/").pop() ?? "")
) {
  await processEvents(true)
}
