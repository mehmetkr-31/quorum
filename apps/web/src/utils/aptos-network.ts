import { Network } from "@aptos-labs/ts-sdk"

export function detectAptosNetwork(nodeUrl?: string): Network {
  if (!nodeUrl) return Network.TESTNET

  const normalized = nodeUrl.toLowerCase()
  if (normalized.includes("shelbynet")) return Network.SHELBYNET
  if (normalized.includes("testnet")) return Network.TESTNET
  if (normalized.includes("mainnet")) return Network.MAINNET
  if (normalized.includes("localhost") || normalized.includes("127.0.0.1")) return Network.LOCAL
  return Network.CUSTOM
}
