import { config } from "dotenv"
import path from "node:path"

// Load .env from workspace root or apps/web
config({ path: path.resolve(process.cwd(), "../../apps/web/.env") })

import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk"
import { createDb } from "@quorum/db"
import { contributions, members, receipts, votes } from "@quorum/db"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"

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

// The deployed contract address
const CONTRACT_ADDRESS = process.env.QUORUM_CONTRACT_ADDRESS

if (!CONTRACT_ADDRESS) {
  console.warn("QUORUM_CONTRACT_ADDRESS is not set. Indexer will not run.")
}

// In a real production environment, you would store the 'last processed sequence number'
// for each event type in the database to avoid re-processing.
// For this prototype, we'll keep it in memory.
let lastProcessedSequenceNumbers: Record<string, bigint> = {
  ContributionSubmitted: 0n,
  VoteCast: 0n,
  ContributionFinalized: 0n,
  ReceiptAnchored: 0n,
  RevenueDistributed: 0n,
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

    // 1. Fetch ContributionFinalized Events
    const finalizedEvents = await aptos.getAccountEventsByEventType({
      accountAddress: CONTRACT_ADDRESS,
      eventType: `${CONTRACT_ADDRESS}::dao_governance::ContributionFinalized`,
    })

    for (const event of finalizedEvents) {
      if (BigInt(event.sequence_number) <= lastProcessedSequenceNumbers.ContributionFinalized) continue
      
      const data = event.data as any
      const contributionId = hexToString(data.contribution_id)
      const approved = data.approved as boolean
      const weight = Number(data.weight)
      
      console.log(`[Indexer] ContributionFinalized: ${contributionId} - Approved: ${approved}`)
      
      await db.update(contributions)
        .set({
          status: approved ? "approved" : "rejected",
          weight: approved ? weight : 0,
        })
        .where(eq(contributions.id, contributionId))

      lastProcessedSequenceNumbers.ContributionFinalized = BigInt(event.sequence_number)
    }

    // 2. Fetch VoteCast Events
    const voteEvents = await aptos.getAccountEventsByEventType({
      accountAddress: CONTRACT_ADDRESS,
      eventType: `${CONTRACT_ADDRESS}::dao_governance::VoteCast`,
    })

    for (const event of voteEvents) {
      if (BigInt(event.sequence_number) <= lastProcessedSequenceNumbers.VoteCast) continue
      
      const data = event.data as any
      const contributionId = hexToString(data.contribution_id)
      const voterAddress = data.voter
      const decisionNum = Number(data.decision)
      const decisionStr = decisionNum === 0 ? "approve" : decisionNum === 1 ? "reject" : "improve"
      
      console.log(`[Indexer] VoteCast: ${voterAddress} voted ${decisionStr} on ${contributionId}`)
      
      // Update local member stats if this is a new voter (or you could upsert)
      await db.insert(members)
        .values({
          address: voterAddress,
          votingPower: Number(data.voting_power),
          joinedAt: new Date()
        })
        .onConflictDoNothing()

      lastProcessedSequenceNumbers.VoteCast = BigInt(event.sequence_number)
    }

    // 3. Fetch RevenueDistributed Events
    const revenueEvents = await aptos.getAccountEventsByEventType({
      accountAddress: CONTRACT_ADDRESS,
      eventType: `${CONTRACT_ADDRESS}::revenue_splitter::RevenueDistributed`,
    })

    for (const event of revenueEvents) {
      if (BigInt(event.sequence_number) <= lastProcessedSequenceNumbers.RevenueDistributed) continue
      
      const data = event.data as any
      const receiptHashHex = hexToString(data.shelby_receipt_hash)
      
      console.log(`[Indexer] RevenueDistributed for receipt: ${receiptHashHex}`)
      
      await db.update(receipts)
        .set({ distributed: true })
        .where(eq(receipts.shelbyReceiptHash, receiptHashHex))

      lastProcessedSequenceNumbers.RevenueDistributed = BigInt(event.sequence_number)
    }

  } catch (error) {
    console.error("[Indexer] Error fetching events:", error)
  }
}

// Start the polling loop
export function startIndexer(intervalMs = 5000) {
  if (!CONTRACT_ADDRESS) {
    console.log("Indexer disabled (no contract address).")
    return
  }
  console.log(`Starting Quorum Indexer connected to ${CONTRACT_ADDRESS}...`)
  
  // Run immediately
  processEvents()
  
  // Then poll
  setInterval(processEvents, intervalMs)
}

// Auto-start if run directly
if (import.meta.url.startsWith("file:") && process.argv[1] && import.meta.url.includes(process.argv[1].split('/').pop()!)) {
  startIndexer()
}
