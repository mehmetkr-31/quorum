import { resolve } from "node:path"
import { config } from "dotenv"

// Load env from apps/web/.env
config({ path: resolve(import.meta.dirname, "../apps/web/.env") })

// Dynamically import from shelby package so resolution happens from packages/shelby context
const { ShelbyClient } = await import("../packages/shelby/src/client.ts")

const BLOB_NAME = "contributions/dataset-1/test-001"
const ORIGINAL = Buffer.from("quorum test contribution")

// Network is a string enum — pass the raw value; ShelbyClient casts internally
const NETWORK = (process.env.SHELBY_NETWORK ?? "SHELBYNET").toLowerCase()

const client = new ShelbyClient({
  // biome-ignore lint/suspicious/noExplicitAny: runtime string cast
  network: NETWORK as any,
  apiKey: process.env.SHELBY_API_KEY,
  serverPrivateKey: process.env.SHELBY_ACCOUNT_PRIVATE_KEY,
  rpcBaseUrl: process.env.SHELBY_BASE_URL,
})

console.log("--- Shelby Integration Test ---")
console.log(`Network  : ${NETWORK}`)
console.log(`RPC URL  : ${process.env.SHELBY_BASE_URL}`)
console.log(`BlobName : ${BLOB_NAME}`)
console.log(`Payload  : "${ORIGINAL.toString()}" (${ORIGINAL.length} bytes)`)
console.log()

// ── Upload ────────────────────────────────────────────────────────────────────
console.log("Uploading…")
let shelbyAccount: string
let dataHash: string

try {
  const result = await client.upload(ORIGINAL, BLOB_NAME)
  shelbyAccount = result.shelbyAccount
  dataHash = result.dataHash
  console.log(`  shelbyAccount : ${shelbyAccount}`)
  console.log(`  dataHash      : ${dataHash}`)
  console.log("Upload OK")
} catch (err) {
  console.error("Upload FAILED:", err)
  process.exit(1)
}

console.log()

// ── Download ──────────────────────────────────────────────────────────────────
console.log("Downloading…")
try {
  const downloaded = await client.download(shelbyAccount, BLOB_NAME)
  console.log(`  Downloaded ${downloaded.length} bytes`)

  if (downloaded.toString() === ORIGINAL.toString()) {
    console.log()
    console.log("✅ Shelby integration working")
  } else {
    console.error("Content mismatch!")
    console.error("  Expected:", ORIGINAL.toString())
    console.error("  Got     :", downloaded.toString())
    process.exit(1)
  }
} catch (err) {
  console.error("Download FAILED:", err)
  process.exit(1)
}
