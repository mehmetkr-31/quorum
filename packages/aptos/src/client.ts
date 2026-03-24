import {
  Account,
  Aptos,
  type Account as AptosAccount,
  AptosConfig,
  Ed25519PrivateKey,
  Network,
} from "@aptos-labs/ts-sdk"

export { Network }

export interface AptosClientConfig {
  network: Network
  nodeUrl?: string // override for custom networks like Shelbynet
  contractAddress: string
  serverPrivateKey?: string // for server-side signing (revenue distribution)
}

export class QuorumAptosClient {
  private aptos: Aptos
  readonly contractAddress: string
  private serverAccount: AptosAccount | null = null

  constructor(config: AptosClientConfig) {
    const aptosConfig = config.nodeUrl
      ? new AptosConfig({ network: config.network, fullnode: config.nodeUrl })
      : new AptosConfig({ network: config.network })

    this.aptos = new Aptos(aptosConfig)
    this.contractAddress = config.contractAddress

    if (config.serverPrivateKey) {
      this.serverAccount = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(config.serverPrivateKey),
      })
    }
  }

  // ── DAO Governance ──────────────────────────────────────────────────────────

  async registerMember(signer: AptosAccount): Promise<string> {
    const txn = await this.aptos.transaction.build.simple({
      sender: signer.accountAddress,
      data: {
        function: `${this.contractAddress}::dao_governance::register_member`,
        functionArguments: [],
      },
    })
    const result = await this.aptos.signAndSubmitTransaction({ signer, transaction: txn })
    await this.aptos.waitForTransaction({ transactionHash: result.hash })
    return result.hash
  }

  /**
   * Submit a contribution on-chain.
   * Move signature: submit_contribution(signer, contract_addr, contribution_id,
   *   dataset_id, shelby_account, shelby_blob_name, data_hash)
   */
  async submitContribution(
    signer: AptosAccount,
    contributionId: string,
    datasetId: string,
    shelbyAccount: string,
    shelbyBlobName: string,
    dataHash: string, // hex string
  ): Promise<string> {
    const txn = await this.aptos.transaction.build.simple({
      sender: signer.accountAddress,
      data: {
        function: `${this.contractAddress}::dao_governance::submit_contribution`,
        functionArguments: [
          this.contractAddress,
          Array.from(Buffer.from(contributionId, "utf8")),
          Array.from(Buffer.from(datasetId, "utf8")),
          Array.from(Buffer.from(shelbyAccount, "utf8")),
          Array.from(Buffer.from(shelbyBlobName, "utf8")),
          Array.from(Buffer.from(dataHash, "hex")),
        ],
      },
    })
    const result = await this.aptos.signAndSubmitTransaction({ signer, transaction: txn })
    await this.aptos.waitForTransaction({ transactionHash: result.hash })
    return result.hash
  }

  /**
   * Cast a vote on a contribution.
   * Move signature: cast_vote(signer, contract_addr, contribution_id, decision)
   * decision: 0=approve, 1=reject, 2=improve
   */
  async castVote(
    signer: AptosAccount,
    contributionId: string,
    decision: 0 | 1 | 2,
  ): Promise<string> {
    const txn = await this.aptos.transaction.build.simple({
      sender: signer.accountAddress,
      data: {
        function: `${this.contractAddress}::dao_governance::cast_vote`,
        functionArguments: [
          this.contractAddress,
          Array.from(Buffer.from(contributionId, "utf8")),
          decision,
        ],
      },
    })
    const result = await this.aptos.signAndSubmitTransaction({ signer, transaction: txn })
    await this.aptos.waitForTransaction({ transactionHash: result.hash })
    return result.hash
  }

  /**
   * Finalize a contribution after the 48-hour voting window.
   * Anyone can call this. Move signature:
   * finalize_contribution(caller, contract_addr, contribution_id)
   */
  async finalizeContribution(caller: AptosAccount, contributionId: string): Promise<string> {
    const txn = await this.aptos.transaction.build.simple({
      sender: caller.accountAddress,
      data: {
        function: `${this.contractAddress}::dao_governance::finalize_contribution`,
        functionArguments: [this.contractAddress, Array.from(Buffer.from(contributionId, "utf8"))],
      },
    })
    const result = await this.aptos.signAndSubmitTransaction({ signer: caller, transaction: txn })
    await this.aptos.waitForTransaction({ transactionHash: result.hash })
    return result.hash
  }

  // ── Revenue Splitter ────────────────────────────────────────────────────────

  /**
   * Anchor a Shelby receipt on Aptos immediately after a dataset read.
   * Move signature: anchor_receipt(reader, contract_addr, dataset_id,
   *   shelby_receipt_hash, amount)
   */
  async anchorReceipt(
    reader: AptosAccount,
    datasetId: string,
    shelbyReceiptHash: string, // hex string
    amount: bigint,
  ): Promise<string> {
    const txn = await this.aptos.transaction.build.simple({
      sender: reader.accountAddress,
      data: {
        function: `${this.contractAddress}::revenue_splitter::anchor_receipt`,
        functionArguments: [
          this.contractAddress,
          Array.from(Buffer.from(datasetId, "utf8")),
          Array.from(Buffer.from(shelbyReceiptHash, "hex")),
          amount,
        ],
      },
    })
    const result = await this.aptos.signAndSubmitTransaction({ signer: reader, transaction: txn })
    await this.aptos.waitForTransaction({ transactionHash: result.hash })
    return result.hash
  }

  /**
   * Distribute revenue for a dataset read event.
   * Uses the server-side signer (APTOS_PRIVATE_KEY in env).
   * Move signature: distribute_revenue(payer, contract_addr, dataset_id,
   *   shelby_receipt_hash, amount,
   *   contributor_addrs, contributor_weights,
   *   curator_addrs, curator_powers)
   */
  async distributeRevenue(
    datasetId: string,
    shelbyReceiptHash: string, // hex string
    amount: bigint,
    contributorAddresses: string[],
    contributorWeights: bigint[],
    curatorAddresses: string[],
    curatorPowers: bigint[],
  ): Promise<string> {
    if (!this.serverAccount) {
      throw new Error("APTOS_PRIVATE_KEY not configured — cannot sign distribution tx")
    }
    const txn = await this.aptos.transaction.build.simple({
      sender: this.serverAccount.accountAddress,
      data: {
        function: `${this.contractAddress}::revenue_splitter::distribute_revenue`,
        functionArguments: [
          this.contractAddress,
          Array.from(Buffer.from(datasetId, "utf8")),
          Array.from(Buffer.from(shelbyReceiptHash, "hex")),
          amount,
          contributorAddresses,
          contributorWeights,
          curatorAddresses,
          curatorPowers,
        ],
      },
    })
    const result = await this.aptos.signAndSubmitTransaction({
      signer: this.serverAccount,
      transaction: txn,
    })
    await this.aptos.waitForTransaction({ transactionHash: result.hash })
    return result.hash
  }

  // ── View ────────────────────────────────────────────────────────────────────

  async getMemberVotingPower(address: string): Promise<number> {
    try {
      const resource = await this.aptos.getAccountResource({
        accountAddress: address,
        resourceType: `${this.contractAddress}::dao_governance::Member`,
      })
      return Number((resource as { voting_power: number }).voting_power)
    } catch {
      return 0 // 0 means not a member yet
    }
  }
}
