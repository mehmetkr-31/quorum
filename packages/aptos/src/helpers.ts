import { Account, Aptos, AptosConfig, Ed25519PrivateKey, type Network } from "@aptos-labs/ts-sdk"

export interface ParameterChangePayload {
  quorumThreshold?: number
  votingWindowSeconds?: number
}

/** Creates an Aptos Account from a hex private key string (with or without 0x prefix). */
export function accountFromPrivateKey(privateKeyHex: string): Account {
  return Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(privateKeyHex) })
}

export function normalizeParameterChangePayload(
  payload: Record<string, unknown>,
): ParameterChangePayload {
  const normalized: ParameterChangePayload = {}

  if (typeof payload.quorumThreshold === "number" && Number.isFinite(payload.quorumThreshold)) {
    normalized.quorumThreshold = Math.trunc(payload.quorumThreshold)
  }

  if (
    typeof payload.votingWindowSeconds === "number" &&
    Number.isFinite(payload.votingWindowSeconds)
  ) {
    normalized.votingWindowSeconds = Math.trunc(payload.votingWindowSeconds)
  }

  return normalized
}

export function encodeParameterChangePayload(payload: ParameterChangePayload): number[] {
  const bytes = new Uint8Array(16)

  writeU64LE(bytes, 0, BigInt(payload.quorumThreshold ?? 0))
  writeU64LE(
    bytes,
    8,
    BigInt(payload.votingWindowSeconds ? payload.votingWindowSeconds * 1_000_000 : 0),
  )

  return Array.from(bytes)
}

export function decodeParameterChangePayload(bytes: ArrayLike<number>): ParameterChangePayload {
  const view = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes)

  return {
    quorumThreshold: Number(readU64LE(view, 0)),
    votingWindowSeconds: Number(readU64LE(view, 8) / 1_000_000n),
  }
}

function writeU64LE(target: Uint8Array, offset: number, value: bigint) {
  let remaining = value
  for (let i = 0; i < 8; i++) {
    target[offset + i] = Number(remaining & 0xffn)
    remaining >>= 8n
  }
}

function readU64LE(source: Uint8Array, offset: number) {
  let result = 0n
  for (let i = 7; i >= 0; i--) {
    result = (result << 8n) | BigInt(source[offset + i] ?? 0)
  }
  return result
}

/**
 * Calls dao_governance::initialize and revenue_splitter::initialize on the
 * contract account. Safe to call multiple times — Move guards with exists<T>.
 */
export async function initializeContracts(opts: {
  network: Network
  nodeUrl: string
  contractAddress: string
  signer: Account
  treasury: string
}): Promise<{ govTx: string; revTx: string }> {
  const aptosConfig = new AptosConfig({
    network: opts.network,
    fullnode: opts.nodeUrl,
  })
  const aptos = new Aptos(aptosConfig)

  // dao_governance::initialize
  const govTxn = await aptos.transaction.build.simple({
    sender: opts.signer.accountAddress,
    data: {
      function: `${opts.contractAddress}::dao_governance::initialize`,
      functionArguments: [],
    },
  })
  const govResult = await aptos.signAndSubmitTransaction({
    signer: opts.signer,
    transaction: govTxn,
  })
  await aptos.waitForTransaction({ transactionHash: govResult.hash })

  // revenue_splitter::initialize(treasury)
  const revTxn = await aptos.transaction.build.simple({
    sender: opts.signer.accountAddress,
    data: {
      function: `${opts.contractAddress}::revenue_splitter::initialize`,
      functionArguments: [opts.treasury],
    },
  })
  const revResult = await aptos.signAndSubmitTransaction({
    signer: opts.signer,
    transaction: revTxn,
  })
  await aptos.waitForTransaction({ transactionHash: revResult.hash })

  return { govTx: govResult.hash, revTx: revResult.hash }
}
