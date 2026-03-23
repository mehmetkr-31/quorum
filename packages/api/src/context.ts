import { createDb, type Db } from "@quorum/db";
import { QuorumAptosClient, Network } from "@quorum/aptos";
import { ShelbyClient } from "@quorum/shelby";
import { serverEnv } from "@quorum/env/server";

let _db: Db | null = null;
let _aptosClient: QuorumAptosClient | null = null;
let _shelbyClient: ShelbyClient | null = null;

function getDb(): Db {
  if (!_db) {
    _db = createDb(
      serverEnv.DATABASE_URL,
      serverEnv.DATABASE_AUTH_TOKEN,
    );
  }
  return _db;
}

function getAptosClient(): QuorumAptosClient {
  if (!_aptosClient) {
    _aptosClient = new QuorumAptosClient({
      network: Network.TESTNET,
      nodeUrl: serverEnv.APTOS_NODE_URL,
      contractAddress: serverEnv.QUORUM_CONTRACT_ADDRESS,
      serverPrivateKey: serverEnv.APTOS_PRIVATE_KEY,
    });
  }
  return _aptosClient;
}

function getShelbyClient(): ShelbyClient {
  if (!_shelbyClient) {
    _shelbyClient = new ShelbyClient({
      baseUrl: serverEnv.SHELBY_BASE_URL,
      apiKey: serverEnv.SHELBY_API_KEY ?? "",
    });
  }
  return _shelbyClient;
}

export interface Context {
  db: Db;
  aptosClient: QuorumAptosClient;
  shelbyClient: ShelbyClient;
}

export async function createContext({ req }: { req: Request }): Promise<Context> {
  return {
    db: getDb(),
    aptosClient: getAptosClient(),
    shelbyClient: getShelbyClient(),
  };
}
