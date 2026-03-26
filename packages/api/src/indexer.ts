import path from "node:path"
import { config } from "dotenv"

// Load .env from workspace root or apps/web
config({ path: path.resolve(process.cwd(), "../../apps/web/.env") })

import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk"
import { contributions, createDb, indexerState, members, receipts } from "@quorum/db"
import { eq } from "drizzle-orm"

// Initialize database
const dbUrl = process.env.DATABASE_URL || "file:../../dev.db"
const dbToken = process.env.DATABASE_AUTH_TOKEN
const db = createDb(dbUrl, dbToken)

// Initialize Aptos client
const aptosConfig = new AptosConfig({
  network: process.env.APTOS_NODE_URL?.includes("testnet")
    ? Network.TESTNET
    : process.env.APTOS_NODE_URL?.includes("mainnet")
      ? Network.MAINNET
      : Network.DEVNET,
  fullnode: process.env.APTOS_NODE_URL || "https://fullnode.testnet.aptoslabs.com/v1",
})
const aptos = new Aptos(aptosConfig)

const CONTRACT_ADDRESS = process.env.QUORUM_CONTRACT_ADDRESS

if (!CONTRACT_ADDRESS) {
  console.warn("QUORUM_CONTRACT_ADDRESS is not set. Indexer will not run.")
}

const EVENT_TYPES = [
  "ContributionSubmitted",
  "VoteCast",
  "ContributionFinalized",
  "ReceiptAnchored",
  "RevenueDistributed",
] as const

type EventType = (typeof EVENT_TYPES)[number]

// DB'den sequence numaralarını yükle
async function loadSequenceNumbers(): Promise<Record<EventType, bigint>> {
  const rows = await db.select().from(indexerState)
  const result = Object.fromEntries(EVENT_TYPES.map((t) => [t, 0n])) as Record<EventType, bigint>
  for (const row of rows) {
    if (EVENT_TYPES.includes(row.eventType as EventType)) {
      result[row.eventType as EventType] = BigInt(row.lastSequenceNumber)
    }
  }
  return result
}

// DB'ye sequence numarasını kaydet
async function saveSequenceNumber(eventType: EventType, seq: bigint) {
  await db
    .insert(indexerState)
    .values({
      eventType,
      lastSequenceNumber: seq.toString(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: indexerState.eventType,
      set: {
        lastSequenceNumber: seq.toString(),
        updatedAt: new Date(),
      },
    })
}

const HEX_DECODER = new TextDecoder()
function hexToString(hex: string): string {
  if (hex.startsWith("0x")) hex = hex.slice(2)
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [])
  return HEX_DECODER.decode(bytes).replace(/\0/g, "")
}

async function processEvents() {
  if (!CONTRACT_ADDRESS) return

  try {
    console.log("Indexer polling for new events...")
    const seq = await loadSequenceNumbers()

    // 1. ContributionFinalized
    const finalizedEvents = await aptos.getAccountEventsByEventType({
      accountAddress: CONTRACT_ADDRESS,
      eventType: `${CONTRACT_ADDRESS}::dao_governance::ContributionFinalized`,
    })

    for (const event of finalizedEvents) {
      if (BigInt(event.sequence_number) <= seq.ContributionFinalized) continue

      const data = event.data as any
      const contributionId = hexToString(data.contribution_id)
      const approved = data.approved as boolean
      const weight = Number(data.weight)

      console.log(`[Indexer] ContributionFinalized: ${contributionId} - Approved: ${approved}`)

      await db
        .update(contributions)
        .set({ status: approved ? "approved" : "rejected", weight: approved ? weight : 0 })
        .where(eq(contributions.id, contributionId))

      const newSeq = BigInt(event.sequence_number)
      await saveSequenceNumber("ContributionFinalized", newSeq)
      seq.ContributionFinalized = newSeq
    }

    // 2. VoteCast
    const voteEvents = await aptos.getAccountEventsByEventType({
      accountAddress: CONTRACT_ADDRESS,
      eventType: `${CONTRACT_ADDRESS}::dao_governance::VoteCast`,
    })

    for (const event of voteEvents) {
      if (BigInt(event.sequence_number) <= seq.VoteCast) continue

      const data = event.data as any
      const voterAddress = data.voter
      const decisionNum = Number(data.decision)
      const decisionStr = decisionNum === 0 ? "approve" : decisionNum === 1 ? "reject" : "improve"

      console.log(`[Indexer] VoteCast: ${voterAddress} voted ${decisionStr}`)

      await db
        .insert(members)
        .values({ address: voterAddress, votingPower: Number(data.voting_power), joinedAt: new Date() })
        .onConflictDoNothing()

      const newSeq = BigInt(event.sequence_number)
      await saveSequenceNumber("VoteCast", newSeq)
      seq.VoteCast = newSeq
    }

    // 3. RevenueDistributed
    const revenueEvents = await aptos.getAccountEventsByEventType({
      accountAddress: CONTRACT_ADDRESS,
      eventType: `${CONTRACT_ADDRESS}::revenue_splitter::RevenueDistributed`,
    })

    for (const event of revenueEvents) {
      if (BigInt(event.sequence_number) <= seq.RevenueDistributed) continue

      const data = event.data as any
      const receiptHashHex = hexToString(data.shelby_receipt_hash)

      console.log(`[Indexer] RevenueDistributed for receipt: ${receiptHashHex}`)

      await db
        .update(receipts)
        .set({ distributed: true })
        .where(eq(receipts.shelbyReceiptHash, receiptHashHex))

      const newSeq = BigInt(event.sequence_number)
      await saveSequenceNumber("RevenueDistributed", newSeq)
      seq.RevenueDistributed = newSeq
    }
  } catch (error) {
    console.error("[Indexer] Error fetching events:", error)
  }
}

export function startIndexer(intervalMs = 5000) {
  if (!CONTRACT_ADDRESS) {
    console.log("Indexer disabled (no contract address).")
    return
  }
  console.log(`Starting Quorum Indexer connected to ${CONTRACT_ADDRESS}...`)
  processEvents()
  setInterval(processEvents, intervalMs)
}

if (
  import.meta.url.startsWith("file:") &&
  process.argv[1] &&
  import.meta.url.includes(process.argv[1].split("/").pop()!)
) {
  startIndexer()
}
