/**
 * Minimal wallet abstraction.
 * In production swap this for @aptos-labs/wallet-adapter-react.
 * For now: wraps window.aptos (Petra/Martian) if available.
 */

export interface WalletAccount {
  address: string
  publicKey: string
}

export async function connectWallet(): Promise<WalletAccount> {
  const aptos = (window as unknown as { aptos?: { connect: () => Promise<{ address: string; publicKey: string }> } }).aptos
  if (!aptos) throw new Error("No Aptos wallet detected. Please install Petra or Martian.")
  const result = await aptos.connect()
  return { address: result.address, publicKey: result.publicKey }
}

export async function signAndSubmitTx(payload: unknown): Promise<string> {
  const aptos = (window as unknown as { aptos?: { signAndSubmitTransaction: (p: unknown) => Promise<{ hash: string }> } }).aptos
  if (!aptos) throw new Error("No Aptos wallet detected.")
  const result = await aptos.signAndSubmitTransaction(payload)
  return result.hash
}

export function buildSubmitContributionPayload(
  contractAddress: string,
  contributionId: string,
  datasetId: string,
  shelbyAccount: string,
  shelbyBlobName: string,
  dataHash: string,
) {
  const enc = (s: string) => Array.from(new TextEncoder().encode(s))
  const hexToBytes = (hex: string) =>
    Array.from(Uint8Array.from((hex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16))))

  return {
    type: "entry_function_payload",
    function: `${contractAddress}::dao_governance::submit_contribution`,
    type_arguments: [],
    arguments: [
      contractAddress,
      enc(contributionId),
      enc(datasetId),
      enc(shelbyAccount),
      enc(shelbyBlobName),
      hexToBytes(dataHash),
    ],
  }
}

export function buildCastVotePayload(
  contractAddress: string,
  contributionId: string,
  decision: 0 | 1 | 2,
) {
  const enc = (s: string) => Array.from(new TextEncoder().encode(s))
  return {
    type: "entry_function_payload",
    function: `${contractAddress}::dao_governance::cast_vote`,
    type_arguments: [],
    arguments: [contractAddress, enc(contributionId), decision],
  }
}

export function buildAnchorReceiptPayload(
  contractAddress: string,
  datasetId: string,
  shelbyReceiptHash: string,
  amount: number,
) {
  const enc = (s: string) => Array.from(new TextEncoder().encode(s))
  const hexToBytes = (hex: string) =>
    Array.from(Uint8Array.from((hex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16))))

  return {
    type: "entry_function_payload",
    function: `${contractAddress}::revenue_splitter::anchor_receipt`,
    type_arguments: [],
    arguments: [contractAddress, enc(datasetId), hexToBytes(shelbyReceiptHash), amount],
  }
}
