import { createDb, type Db } from "@quorum/db"
import { QuorumAptosClient, Network } from "@quorum/aptos"
import { ShelbyClient } from "@quorum/shelby"

let _db: Db | null = null
let _aptosClient: QuorumAptosClient | null = null
let _shelbyClient: ShelbyClient | null = null

function getDb(): Db {
  if (!_db) {
    _db = createDb(
      process.env.DATABASE_URL ?? "file:./quorum.db",
      process.env.DATABASE_AUTH_TOKEN,
    )
  }
  return _db
}

function getAptosClient(): QuorumAptosClient {
  if (!_aptosClient) {
    const network = (process.env.APTOS_NETWORK ?? "testnet") as Network
    _aptosClient = new QuorumAptosClient({
      network,
      nodeUrl: process.env.APTOS_NODE_URL, // Shelbynet custom node
      contractAddress: process.env.APTOS_CONTRACT_ADDRESS ?? "",
      serverPrivateKey: process.env.APTOS_PRIVATE_KEY,
    })
  }
  return _aptosClient
}

function getShelbyClient(): ShelbyClient {
  if (!_shelbyClient) {
    _shelbyClient = new ShelbyClient({
      baseUrl: process.env.SHELBY_BASE_URL ?? "",
      apiKey: process.env.SHELBY_API_KEY ?? "",
    })
  }
  return _shelbyClient
}

export interface Context {
  db: Db
  aptosClient: QuorumAptosClient
  shelbyClient: ShelbyClient
}

export function createContext(): Context {
  return {
    db: getDb(),
    aptosClient: getAptosClient(),
    shelbyClient: getShelbyClient(),
  }
}
