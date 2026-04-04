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
  apiKey?: string // Aptos API key to avoid 429 rate limits
}

export class QuorumAptosClient {
  private aptos: Aptos
  readonly contractAddress: string
  private serverAccount: AptosAccount | null = null

  constructor(config: AptosClientConfig) {
    const aptosConfig = config.nodeUrl
      ? new AptosConfig({
          network: config.network,
          fullnode: config.nodeUrl,
          clientConfig: { API_KEY: config.apiKey },
        })
      : new AptosConfig({ network: config.network, clientConfig: { API_KEY: config.apiKey } })

    this.aptos = new Aptos(aptosConfig)
    this.contractAddress = config.contractAddress

    if (config.serverPrivateKey) {
      this.serverAccount = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(config.serverPrivateKey),
      })
    }
  }

  // ── DAO Registry ───────────────────────────────────────────────────────────

  /**
   * Create a new DAO on-chain.
   * Move signature: create_dao(creator, contract_addr, dao_id, name, treasury,
   *   voting_window_us, quorum_threshold)
   */
  async createDao(
    signer: AptosAccount,
    daoId: string,
    name: string,
    treasury: string,
    votingWindowUs: bigint,
    quorumThreshold: bigint,
  ): Promise<string> {
    const txn = await this.aptos.transaction.build.simple({
      sender: signer.accountAddress,
      data: {
        function: `${this.contractAddress}::dao_governance::create_dao`,
        functionArguments: [
          this.contractAddress,
          Array.from(Buffer.from(daoId, "utf8")),
          Array.from(Buffer.from(name, "utf8")),
          treasury,
          votingWindowUs,
          quorumThreshold,
        ],
      },
    })
    const result = await this.aptos.signAndSubmitTransaction({ signer, transaction: txn })
    await this.aptos.waitForTransaction({ transactionHash: result.hash })
    return result.hash
  }

  /**
   * Join a DAO as a member.
   * Move signature: join_dao(account, contract_addr, dao_id)
   */
  async joinDao(signer: AptosAccount, daoId: string): Promise<string> {
    const txn = await this.aptos.transaction.build.simple({
      sender: signer.accountAddress,
      data: {
        function: `${this.contractAddress}::dao_governance::join_dao`,
        functionArguments: [this.contractAddress, Array.from(Buffer.from(daoId, "utf8"))],
      },
    })
    const result = await this.aptos.signAndSubmitTransaction({ signer, transaction: txn })
    await this.aptos.waitForTransaction({ transactionHash: result.hash })
    return result.hash
  }

  // ── DAO Governance (backward compatible) ───────────────────────────────────

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
   * New Move signature includes dao_id:
   *   submit_contribution(signer, contract_addr, dao_id, contribution_id,
   *     dataset_id, shelby_account, shelby_blob_name, data_hash)
   */
  async submitContribution(
    signer: AptosAccount,
    daoId: string,
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
          Array.from(Buffer.from(daoId, "utf8")),
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
   * Finalize a contribution after the voting window closes.
   * Anyone can call this.
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
   * Anchor a Shelby receipt on Aptos.
   * Now includes daoId parameter.
   */
  async anchorReceipt(
    reader: AptosAccount,
    daoId: string,
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
          Array.from(Buffer.from(daoId, "utf8")),
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
   * Now includes daoId parameter.
   */
  async distributeRevenue(
    daoId: string,
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
          Array.from(Buffer.from(daoId, "utf8")),
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

  /** Get global voting power (backward compatible) */
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

  /** Get DAO-scoped voting power via view function */
  async getDaoVotingPower(daoId: string, memberAddress: string): Promise<number> {
    try {
      const [result] = await this.aptos.view({
        payload: {
          function: `${this.contractAddress}::dao_governance::get_dao_voting_power`,
          functionArguments: [
            this.contractAddress,
            Array.from(Buffer.from(daoId, "utf8")),
            memberAddress,
          ],
        },
      })
      return Number(result)
    } catch {
      return 0
    }
  }

  /** Get DAO member count from on-chain */
  async getDaoMemberCount(daoId: string): Promise<number> {
    try {
      const [result] = await this.aptos.view({
        payload: {
          function: `${this.contractAddress}::dao_governance::get_dao_member_count`,
          functionArguments: [this.contractAddress, Array.from(Buffer.from(daoId, "utf8"))],
        },
      })
      return Number(result)
    } catch {
      return 0
    }
  }

  /** Get total DAO count from on-chain registry */
  async getDaoCount(): Promise<number> {
    try {
      const [result] = await this.aptos.view({
        payload: {
          function: `${this.contractAddress}::dao_governance::get_dao_count`,
          functionArguments: [this.contractAddress],
        },
      })
      return Number(result)
    } catch {
      return 0
    }
  }

  // ── Phase 4: Governance Proposals ──────────────────────────────────────────

  /**
   * Create a governance proposal on-chain.
   * proposal_type: 0=ParameterChange, 1=TreasurySpend, 2=Text
   */
  async createProposal(
    signer: AptosAccount,
    daoId: string,
    proposalId: string,
    proposalType: 0 | 1 | 2,
    title: string,
    description: string,
    payload: Uint8Array,
  ): Promise<string> {
    const txn = await this.aptos.transaction.build.simple({
      sender: signer.accountAddress,
      data: {
        function: `${this.contractAddress}::dao_governance::create_proposal`,
        functionArguments: [
          this.contractAddress,
          Array.from(Buffer.from(daoId, "utf8")),
          Array.from(Buffer.from(proposalId, "utf8")),
          proposalType,
          Array.from(Buffer.from(title, "utf8")),
          Array.from(Buffer.from(description, "utf8")),
          Array.from(payload),
        ],
      },
    })
    const result = await this.aptos.signAndSubmitTransaction({ signer, transaction: txn })
    await this.aptos.waitForTransaction({ transactionHash: result.hash })
    return result.hash
  }

  /**
   * Vote on a governance proposal.
   * support: true = yes/for, false = no/against
   */
  async voteOnProposal(
    signer: AptosAccount,
    proposalId: string,
    support: boolean,
  ): Promise<string> {
    const txn = await this.aptos.transaction.build.simple({
      sender: signer.accountAddress,
      data: {
        function: `${this.contractAddress}::dao_governance::vote_on_proposal`,
        functionArguments: [
          this.contractAddress,
          Array.from(Buffer.from(proposalId, "utf8")),
          support,
        ],
      },
    })
    const result = await this.aptos.signAndSubmitTransaction({ signer, transaction: txn })
    await this.aptos.waitForTransaction({ transactionHash: result.hash })
    return result.hash
  }

  /** Finalize a proposal after the voting window closes */
  async finalizeProposal(caller: AptosAccount, proposalId: string): Promise<string> {
    const txn = await this.aptos.transaction.build.simple({
      sender: caller.accountAddress,
      data: {
        function: `${this.contractAddress}::dao_governance::finalize_proposal`,
        functionArguments: [this.contractAddress, Array.from(Buffer.from(proposalId, "utf8"))],
      },
    })
    const result = await this.aptos.signAndSubmitTransaction({ signer: caller, transaction: txn })
    await this.aptos.waitForTransaction({ transactionHash: result.hash })
    return result.hash
  }

  // ── Phase 4: Delegation ────────────────────────────────────────────────────

  /** Delegate voting power to another DAO member */
  async delegate(signer: AptosAccount, daoId: string, delegatee: string): Promise<string> {
    const txn = await this.aptos.transaction.build.simple({
      sender: signer.accountAddress,
      data: {
        function: `${this.contractAddress}::dao_governance::delegate`,
        functionArguments: [
          this.contractAddress,
          Array.from(Buffer.from(daoId, "utf8")),
          delegatee,
        ],
      },
    })
    const result = await this.aptos.signAndSubmitTransaction({ signer, transaction: txn })
    await this.aptos.waitForTransaction({ transactionHash: result.hash })
    return result.hash
  }

  /** Revoke delegation */
  async revokeDelegation(signer: AptosAccount, daoId: string): Promise<string> {
    const txn = await this.aptos.transaction.build.simple({
      sender: signer.accountAddress,
      data: {
        function: `${this.contractAddress}::dao_governance::revoke_delegation`,
        functionArguments: [this.contractAddress, Array.from(Buffer.from(daoId, "utf8"))],
      },
    })
    const result = await this.aptos.signAndSubmitTransaction({ signer, transaction: txn })
    await this.aptos.waitForTransaction({ transactionHash: result.hash })
    return result.hash
  }

  /** Get total delegated power received by an address */
  async getDelegatedPower(_daoId: string, delegatee: string): Promise<number> {
    try {
      const [result] = await this.aptos.view({
        payload: {
          function: `${this.contractAddress}::dao_governance::get_delegated_power`,
          functionArguments: [this.contractAddress, delegatee],
        },
      })
      return Number(result)
    } catch {
      return 0
    }
  }

  // ── Phase 4: QRM Token ─────────────────────────────────────────────────────

  /** Get QRM token balance for an address */
  async getQrmBalance(address: string): Promise<number> {
    try {
      const [result] = await this.aptos.view({
        payload: {
          function: `${this.contractAddress}::qrm_token::balance`,
          functionArguments: [this.contractAddress, address],
        },
      })
      return Number(result)
    } catch {
      return 0
    }
  }

  /** Get total QRM supply */
  async getQrmTotalSupply(): Promise<number> {
    try {
      const [result] = await this.aptos.view({
        payload: {
          function: `${this.contractAddress}::qrm_token::total_supply`,
          functionArguments: [this.contractAddress],
        },
      })
      return Number(result)
    } catch {
      return 0
    }
  }

  // ── Phase 4: Staking ────────────────────────────────────────────────────────

  /**
   * Stake QRM tokens.
   * tier: 0=30d (1.5x), 1=90d (2x), 2=180d (3x)
   */
  async stakeQrm(signer: AptosAccount, amount: bigint, tier: 0 | 1 | 2): Promise<string> {
    const txn = await this.aptos.transaction.build.simple({
      sender: signer.accountAddress,
      data: {
        function: `${this.contractAddress}::staking::stake`,
        functionArguments: [this.contractAddress, amount, tier],
      },
    })
    const result = await this.aptos.signAndSubmitTransaction({ signer, transaction: txn })
    await this.aptos.waitForTransaction({ transactionHash: result.hash })
    return result.hash
  }

  /** Unstake QRM tokens */
  async unstakeQrm(signer: AptosAccount): Promise<string> {
    const txn = await this.aptos.transaction.build.simple({
      sender: signer.accountAddress,
      data: {
        function: `${this.contractAddress}::staking::unstake`,
        functionArguments: [this.contractAddress],
      },
    })
    const result = await this.aptos.signAndSubmitTransaction({ signer, transaction: txn })
    await this.aptos.waitForTransaction({ transactionHash: result.hash })
    return result.hash
  }

  /** Get staking boost in basis points for an address (100 = no boost) */
  async getStakingBoost(address: string): Promise<number> {
    try {
      const [result] = await this.aptos.view({
        payload: {
          function: `${this.contractAddress}::staking::get_boost_bps`,
          functionArguments: [this.contractAddress, address],
        },
      })
      return Number(result)
    } catch {
      return 100
    }
  }

  /** Get effective voting power with staking boost applied */
  async getEffectiveVotingPower(address: string, baseVp: number): Promise<number> {
    try {
      const [result] = await this.aptos.view({
        payload: {
          function: `${this.contractAddress}::staking::get_effective_voting_power`,
          functionArguments: [this.contractAddress, address, baseVp],
        },
      })
      return Number(result)
    } catch {
      return baseVp
    }
  }
}
