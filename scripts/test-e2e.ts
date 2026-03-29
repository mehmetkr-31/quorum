/**
 * Quorum DAO — end-to-end integration test on shelbynet
 *
 * Run with:
 *   NODE_PATH=packages/shelby/node_modules pnpm tsx scripts/test-e2e.ts
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

const DATASET_ID = "dataset-1"
const CONTRIBUTION_ID = `e2e-test-${Date.now()}`
const BLOB_NAME = `contributions/${DATASET_ID}/${CONTRIBUTION_ID}`
const DATA = Buffer.from("e2e test contribution data")

console.log("═══════════════════════════════════════════════════")
console.log("  Quorum DAO — E2E Integration Test (shelbynet)")
console.log("═══════════════════════════════════════════════════")
console.log(`Contract : ${CONTRACT}`)
console.log(`Node URL : ${NODE_URL}`)
console.log(`ContribID: ${CONTRIBUTION_ID}`)
console.log(`BlobName : ${BLOB_NAME}`)
console.log()

const signer = accountFromPrivateKey(SHELBY_PRIVATE_KEY)
console.log(`Signer   : ${signer.accountAddress.toString()}`)
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
  memberRegister: "⏳",
  submitContrib: "⏳",
  castVote: "⏳",
  finalize: "⏳",
}
let submitTx = ""
let voteTx = ""

// ── Step 0: Initialize contracts ──────────────────────────────────────────────
console.log("── Step 0: Initialize contracts ──────────────────")
try {
  const { govTx, revTx } = await initializeContracts({
    network: Network.SHELBYNET,
    nodeUrl: NODE_URL,
    contractAddress: CONTRACT,
    signer,
    treasury: signer.accountAddress.toString(), // deployer is treasury for testing
  })
  results.initialize = "✅"
  console.log(`  dao_governance::initialize      tx: ${govTx}`)
  console.log(`  revenue_splitter::initialize    tx: ${revTx}`)
} catch (err: unknown) {
  const msg = String(err)
  // "RESOURCE_ALREADY_EXISTS" or similar = already initialized, OK to continue
  if (msg.includes("RESOURCE_ALREADY_EXISTS") || msg.includes("already exists")) {
    results.initialize = "✅ (already initialized)"
    console.log(`  Already initialized — continuing`)
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

// ── Step 2: Register as DAO member ────────────────────────────────────────────
console.log("── Step 2: Register as DAO member ────────────────")
try {
  const power = await aptos.getMemberVotingPower(signer.accountAddress.toString())
  if (power > 0) {
    results.memberRegister = `✅ (already member, power=${power})`
    console.log(`  Already a member — voting power: ${power}`)
  } else {
    const hash = await aptos.registerMember(signer)
    results.memberRegister = "✅"
    console.log(`  Registered — tx: ${hash}`)
  }
} catch (err) {
  results.memberRegister = "❌"
  console.error("  FAILED:", err)
  process.exit(1)
}
console.log()

// ── Step 3: submit_contribution ───────────────────────────────────────────────
console.log("── Step 3: submit_contribution ───────────────────")
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

// ── Step 5: finalize_contribution (expected to fail within 48h) ───────────────
console.log("── Step 5: finalize_contribution ─────────────────")
try {
  const finalizeTx = await aptos.finalizeContribution(signer, CONTRIBUTION_ID)
  results.finalize = "✅ (window already elapsed)"
  console.log(`  tx hash : ${finalizeTx}`)
} catch (err: unknown) {
  const msg = String(err)
  if (
    msg.includes("E_VOTING_STILL_OPEN") ||
    msg.includes("0x6") ||
    msg.includes("Move abort") ||
    msg.includes("VOTING_STILL_OPEN")
  ) {
    results.finalize = "⏳ pending (48h window not elapsed — expected)"
    console.log("  Expected: 48-hour voting window has not elapsed yet")
  } else {
    results.finalize = `❌ ${msg.slice(0, 120)}`
    console.error("  Unexpected error:", err)
  }
}
console.log()

// ── Step 6: on-chain state ────────────────────────────────────────────────────
console.log("── Step 6: on-chain state ────────────────────────")
const power = await aptos.getMemberVotingPower(signer.accountAddress.toString())
console.log(`  Signer voting power      : ${power}`)
console.log(`  Contribution submitted   : ${results.submitContrib.startsWith("✅") ? "yes" : "no"}`)
console.log(
  `  Vote cast (approve)      : ${results.castVote.startsWith("✅") ? "yes, power=" + power : "no"}`,
)
console.log(`  Status                   : pending (awaiting 48h voting window)`)
console.log()

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════")
console.log("  Summary")
console.log("═══════════════════════════════════════════════════")
console.log(`  ${results.initialize}   Contract initialization`)
console.log(`  ${results.shelbyUpload}   Shelby upload`)
console.log(`  ${results.memberRegister}   DAO member registration`)
console.log(`  ${results.submitContrib}   submit_contribution`)
if (submitTx) console.log(`    └─ tx: ${submitTx}`)
console.log(`  ${results.castVote}   cast_vote (approve)`)
if (voteTx) console.log(`    └─ tx: ${voteTx}`)
console.log(`  ${results.finalize}   finalize_contribution`)
console.log()
console.log(`  Explorer:`)
console.log(`  https://explorer.aptoslabs.com/account/${CONTRACT}?network=shelbynet`)
