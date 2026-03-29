import { Account, Aptos, AptosConfig, Ed25519PrivateKey, type Network } from "@aptos-labs/ts-sdk"

/** Creates an Aptos Account from a hex private key string (with or without 0x prefix). */
export function accountFromPrivateKey(privateKeyHex: string): Account {
  return Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(privateKeyHex) })
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
