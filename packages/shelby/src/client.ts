export interface ShelbyConfig {
  baseUrl: string
  apiKey: string
}

export interface UploadResult {
  shelbyAccount: string
  blobName: string
  dataHash: string
}

export interface ShelbyReceipt {
  receiptHash: string
  blobAddress: string
  readerAddress: string
  timestamp: number
  amount: bigint
}

export class ShelbyClient {
  private baseUrl: string
  private apiKey: string

  constructor(config: ShelbyConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "")
    this.apiKey = config.apiKey
  }

  private authHeaders(): HeadersInit {
    return { Authorization: `Bearer ${this.apiKey}` }
  }

  async upload(
    data: Uint8Array | Buffer,
    contentType = "application/octet-stream",
  ): Promise<UploadResult> {
    const response = await fetch(`${this.baseUrl}/blobs`, {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": contentType,
      },
      body: data as any,
    })
    if (!response.ok) {
      throw new Error(`Shelby upload failed: ${response.status} ${response.statusText}`)
    }
    return response.json() as Promise<UploadResult>
  }

  async download(blobAddress: string): Promise<Uint8Array> {
    const response = await fetch(`${this.baseUrl}/blobs/${encodeURIComponent(blobAddress)}`, {
      headers: this.authHeaders(),
    })
    if (!response.ok) {
      throw new Error(`Shelby download failed: ${response.status} ${response.statusText}`)
    }
    return new Uint8Array(await response.arrayBuffer())
  }

  async getReceipt(receiptHash: string): Promise<ShelbyReceipt> {
    const response = await fetch(`${this.baseUrl}/receipts/${encodeURIComponent(receiptHash)}`, {
      headers: this.authHeaders(),
    })
    if (!response.ok) {
      throw new Error(`Shelby receipt fetch failed: ${response.status} ${response.statusText}`)
    }
    return response.json() as Promise<ShelbyReceipt>
  }

  async listReceipts(blobAddress: string, since?: number): Promise<ShelbyReceipt[]> {
    const params = new URLSearchParams({ blobAddress })
    if (since !== undefined) params.set("since", String(since))
    const response = await fetch(`${this.baseUrl}/receipts?${params}`, {
      headers: this.authHeaders(),
    })
    if (!response.ok) {
      throw new Error(`Shelby receipts list failed: ${response.status} ${response.statusText}`)
    }
    return response.json() as Promise<ShelbyReceipt[]>
  }
}
