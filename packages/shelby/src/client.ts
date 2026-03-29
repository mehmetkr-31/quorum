import crypto from "node:crypto"
import { Account, Ed25519PrivateKey, type Network } from "@aptos-labs/ts-sdk"
import { type ShelbyNetwork, ShelbyNodeClient } from "@shelby-protocol/sdk/node"

export interface ShelbyConfig {
  network: Network
  apiKey?: string
  serverPrivateKey?: string
  rpcBaseUrl?: string
}

export interface UploadResult {
  shelbyAccount: string
  dataHash: string
}

export class ShelbyClient {
  private client: ShelbyNodeClient
  private signer: Account

  constructor(config: ShelbyConfig) {
    if (config.serverPrivateKey) {
      this.signer = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(config.serverPrivateKey),
      })
    } else {
      this.signer = Account.generate()
    }

    this.client = new ShelbyNodeClient({
      network: config.network as unknown as ShelbyNetwork,
      apiKey: config.apiKey,
      ...(config.rpcBaseUrl ? { rpc: { baseUrl: config.rpcBaseUrl } } : {}),
    })
  }

  /**
   * Uploads data to Shelby. The caller is responsible for generating a
   * stable blobName (e.g. "contributions/{datasetId}/{contributionId}").
   */
  async upload(
    data: Uint8Array | Buffer,
    blobName: string,
    _contentType = "application/octet-stream",
  ): Promise<UploadResult> {
    const blobData = data instanceof Uint8Array ? data : new Uint8Array(data)
    // 7 days from now in microseconds
    const expirationMicros = Date.now() * 1000 + 7 * 24 * 3_600_000_000

    const hashBuffer = await crypto.subtle.digest("SHA-256", blobData)
    const dataHash = `0x${Buffer.from(hashBuffer).toString("hex")}`

    await this.client.upload({
      blobData,
      signer: this.signer,
      blobName,
      expirationMicros,
    })

    return {
      shelbyAccount: this.signer.accountAddress.toString(),
      dataHash,
    }
  }

  /**
   * Downloads a blob from Shelby and returns it as a Buffer.
   */
  async download(shelbyAccount: string, blobName: string): Promise<Buffer> {
    const blob = await this.client.download({
      account: shelbyAccount,
      blobName,
    })

    const reader = blob.readable.getReader()
    const chunks: Uint8Array[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }

    return Buffer.from(result)
  }
}
