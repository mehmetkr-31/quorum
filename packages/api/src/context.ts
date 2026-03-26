import { Network, QuorumAptosClient } from "@quorum/aptos"
import { auth } from "@quorum/auth"
import { createDb, type Db } from "@quorum/db"
import { env } from "@quorum/env/server"
import { ShelbyClient } from "@quorum/shelby"

let _db: Db | null = null
let _aptosClient: QuorumAptosClient | null = null
let _shelbyClient: ShelbyClient | null = null

function getDb(): Db {
  if (!_db) {
    _db = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN)
  }
  return _db
}

function getAptosClient(): QuorumAptosClient {
  if (!_aptosClient) {
    _aptosClient = new QuorumAptosClient({
      network: Network.TESTNET,
      nodeUrl: env.APTOS_NODE_URL,
      contractAddress: env.QUORUM_CONTRACT_ADDRESS,
      serverPrivateKey: env.APTOS_PRIVATE_KEY,
    })
  }
  return _aptosClient
}

function getShelbyClient(): ShelbyClient {
  if (!_shelbyClient) {
    _shelbyClient = new ShelbyClient({
      baseUrl: env.SHELBY_BASE_URL,
      apiKey: env.SHELBY_API_KEY ?? "",
      isMock: env.SHELBY_MOCK,
    })
  }
  return _shelbyClient
}

export interface Session {
  id: string
  userId: string
  walletAddress: string
}

export interface Context {
  db: Db
  aptosClient: QuorumAptosClient
  shelbyClient: ShelbyClient
  session: Session | null
}

export async function createContext({ req }: { req: Request }): Promise<Context> {
  let session: Session | null = null

  try {
    const result = await auth.api.getSession({ headers: req.headers })
    if (result?.session && result.user) {
      session = {
        id: result.session.id,
        userId: result.user.id,
        walletAddress: (result.user as any).walletAddress ?? "",
      }
    }
  } catch {
    // Oturum yoksa devam et
  }

  return {
    db: getDb(),
    aptosClient: getAptosClient(),
    shelbyClient: getShelbyClient(),
    session,
  }
}
