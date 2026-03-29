/**
 * Quorum DAO — full loop integration test on shelbynet
 * Covers: upload → submit → vote → wait → finalize → anchor_receipt → distribute_revenue
 *
 * Run with:
 *   NODE_PATH=packages/shelby/node_modules pnpm tsx scripts/test-full-loop.ts
 */

import { resolve } from "node:path"
import { config } from "dotenv"

config({ path: resolve(import.meta.dirname, "../apps/web/.env") })

const { ShelbyClient } = await import("../packages/shelby/src/client.ts")
const { QuorumAptosClient, Network } = await import("../packages/aptos/src/client.ts")
const { accountFromPrivateKey, initializeContracts } = await import(
  "../packages/aptos/src/helpers.ts"
)

// ── Config ────────────────────────────────────────────────────────────────────
const CONTRACT = process.env.QUORUM_CONTRACT_ADDRESS!
const NODE_URL = process.env.APTOS_NODE_URL!
const SHELBY_PRIVATE_KEY = process.env.SHELBY_ACCOUNT_PRIVATE_KEY!

const DATASET_ID = "dataset-full-loop"
const CONTRIBUTION_ID = `full-loop-${Date.now()}`
const BLOB_NAME = `contributions/${DATASET_ID}/${CONTRIBUTION_ID}`
const DATA = Buffer.from(`full loop test data - ${Date.now()}`)

// 32-byte mock receipt hash (64 hex chars)
const RECEIPT_HASH = "deadbeef" + "00".repeat(28)
const REVENUE_AMOUNT = BigInt(1_000_000) // 1 APT in octas

console.log("═══════════════════════════════════════════════════")
console.log("  Quorum DAO — Full Loop Integration Test")
console.log("═══════════════════════════════════════════════════")
console.log(`Contract  : ${CONTRACT}`)
console.log(`Node URL  : ${NODE_URL}`)
console.log(`ContribID : ${CONTRIBUTION_ID}`)
console.log(`BlobName  : ${BLOB_NAME}`)
console.log()

const signer = accountFromPrivateKey(SHELBY_PRIVATE_KEY)
console.log(`Signer    : ${signer.accountAddress.toString()}`)
console.log()

const shelby = new ShelbyClient({
  network: "shelbynet" as any,
  apiKey: process.env.SHELBY_API_KEY,
  serverPrivateKey: SHELBY_PRIVATE_KEY,
  rpcBaseUrl: process.env.SHELBY_BASE_URL,
})

const aptos = new QuorumAptosClient({
  network: Network.SHELBYNET,
  nodeUrl: NODE_URL,
  contractAddress: CONTRACT,
  serverPrivateKey: SHELBY_PRIVATE_KEY,
})

const results: Record<string, string> = {
  initialize: "⏳",
  shelbyUpload: "⏳",
  submitContrib: "⏳",
  castVote: "⏳",
  finalize: "⏳",
  anchorReceipt: "⏳",
  distribute: "⏳",
}

// ── Step 0: Initialize contracts ──────────────────────────────────────────────
console.log("── Step 0: Initialize contracts ──────────────────")
try {
  const { govTx, revTx } = await initializeContracts({
    network: Network.SHELBYNET,
    nodeUrl: NODE_URL,
    contractAddress: CONTRACT,
    signer,
    treasury: signer.accountAddress.toString(),
  })
  results.initialize = "✅"
  console.log(`  dao_governance::initialize   tx: ${govTx}`)
  console.log(`  revenue_splitter::initialize tx: ${revTx}`)
} catch (err: unknown) {
  const msg = String(err)
  if (msg.includes("RESOURCE_ALREADY_EXISTS") || msg.includes("already exists")) {
    results.initialize = "✅ (already initialized)"
    console.log("  Already initialized — continuing")
  } else {
    results.initialize = "❌"
    console.error("  FAILED:", err)
    process.exit(1)
  }
}
console.log()

// ── Step 1: Shelby upload ─────────────────────────────────────────────────────
console.log("── Step 1: Shelby upload ──────────────────────────")
let shelbyAccount: string
let dataHash: string

try {
  const upload = await shelby.upload(DATA, BLOB_NAME)
  shelbyAccount = upload.shelbyAccount
  dataHash = upload.dataHash
  results.shelbyUpload = "✅"
  console.log(`  shelbyAccount : ${shelbyAccount}`)
  console.log(`  dataHash      : ${dataHash}`)
} catch (err) {
  results.shelbyUpload = "❌"
  console.error("  FAILED:", err)
  process.exit(1)
}
console.log()

// ── Step 2: Register / confirm member ────────────────────────────────────────
console.log("── Step 2: DAO member check ───────────────────────")
try {
  const power = await aptos.getMemberVotingPower(signer.accountAddress.toString())
  if (power > 0) {
    console.log(`  Already a member — voting power: ${power}`)
  } else {
    const hash = await aptos.registerMember(signer)
    console.log(`  Registered — tx: ${hash}`)
  }
} catch (err) {
  console.error("  FAILED:", err)
  process.exit(1)
}
console.log()

// ── Step 3: submit_contribution ───────────────────────────────────────────────
console.log("── Step 3: submit_contribution ───────────────────")
let submitTx: string
try {
  const hashHex = dataHash.replace(/^0x/, "")
  submitTx = await aptos.submitContribution(
    signer,
    CONTRIBUTION_ID,
    DATASET_ID,
    shelbyAccount,
    BLOB_NAME,
    hashHex,
  )
  results.submitContrib = "✅"
  console.log(`  tx hash : ${submitTx}`)
} catch (err) {
  results.submitContrib = "❌"
  console.error("  FAILED:", err)
  process.exit(1)
}
console.log()

// ── Step 4: cast_vote (approve = 0) ──────────────────────────────────────────
console.log("── Step 4: cast_vote (approve) ───────────────────")
let voteTx: string
try {
  voteTx = await aptos.castVote(signer, CONTRIBUTION_ID, 0)
  results.castVote = "✅"
  console.log(`  tx hash : ${voteTx}`)
} catch (err) {
  results.castVote = "❌"
  console.error("  FAILED:", err)
  process.exit(1)
}
console.log()

// ── Step 5: Wait 70 seconds for voting window to expire ──────────────────────
console.log("── Step 5: Waiting 70s for 1-min voting window ───")
for (let i = 70; i > 0; i -= 10) {
  process.stdout.write(`  ${i}s remaining...\r`)
  await new Promise((r) => setTimeout(r, 10_000))
}
console.log("  Voting window elapsed.                          ")
console.log()

// ── Step 6: finalize_contribution ────────────────────────────────────────────
console.log("── Step 6: finalize_contribution ─────────────────")
let finalizeTx: string
try {
  finalizeTx = await aptos.finalizeContribution(signer, CONTRIBUTION_ID)
  results.finalize = "✅ (approved)"
  console.log(`  tx hash : ${finalizeTx}`)
} catch (err) {
  results.finalize = "❌"
  console.error("  FAILED:", err)
  process.exit(1)
}
console.log()

// ── Step 7: anchor_receipt ────────────────────────────────────────────────────
console.log("── Step 7: anchor_receipt ────────────────────────")
let anchorTx: string
try {
  anchorTx = await aptos.anchorReceipt(signer, DATASET_ID, RECEIPT_HASH, REVENUE_AMOUNT)
  results.anchorReceipt = "✅"
  console.log(`  tx hash : ${anchorTx}`)
} catch (err) {
  results.anchorReceipt = "❌"
  console.error("  FAILED:", err)
  process.exit(1)
}
console.log()

// ── Step 8: distribute_revenue ───────────────────────────────────────────────
console.log("── Step 8: distribute_revenue ────────────────────")
let distributeTx: string
try {
  const signerAddr = signer.accountAddress.toString()
  distributeTx = await aptos.distributeRevenue(
    DATASET_ID,
    RECEIPT_HASH,
    REVENUE_AMOUNT,
    [signerAddr], // contributor addresses
    [BigInt(100)], // contributor weights
    [signerAddr], // curator addresses
    [BigInt(10)], // curator voting powers
  )
  results.distribute = "✅"
  console.log(`  tx hash : ${distributeTx}`)
} catch (err) {
  results.distribute = "❌"
  console.error("  FAILED:", err)
  process.exit(1)
}
console.log()

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════")
console.log("  Summary")
console.log("═══════════════════════════════════════════════════")
console.log(`  ${results.initialize}   Contract initialization`)
console.log(`  ${results.shelbyUpload}   Shelby upload`)
console.log(`  ${results.submitContrib}   submit_contribution`)
console.log(`    └─ tx: ${submitTx!}`)
console.log(`  ${results.castVote}   cast_vote (approve)`)
console.log(`    └─ tx: ${voteTx!}`)
console.log(`  ${results.finalize}   finalize_contribution`)
console.log(`    └─ tx: ${finalizeTx!}`)
console.log(`  ${results.anchorReceipt}   anchor_receipt`)
console.log(`    └─ tx: ${anchorTx!}`)
console.log(`  ${results.distribute}   distribute_revenue`)
console.log(`    └─ tx: ${distributeTx!}`)
console.log()
console.log("  🎉 Full loop complete!")
console.log()
console.log(`  Explorer:`)
console.log(`  https://explorer.aptoslabs.com/account/${CONTRACT}?network=shelbynet`)
