export interface ShelbyConfig {
  baseUrl: string
  apiKey: string
  isMock?: boolean
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
  private isMock: boolean

  constructor(config: ShelbyConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "")
    this.apiKey = config.apiKey
    this.isMock = !!config.isMock
  }

  private authHeaders(): HeadersInit {
    return { Authorization: `Bearer ${this.apiKey}` }
  }

  async upload(
    data: Uint8Array | Buffer,
    contentType = "application/octet-stream",
  ): Promise<UploadResult> {
    if (this.isMock) {
      console.log("Shelby Mock: Simulating upload...")
      await new Promise((resolve) => setTimeout(resolve, 1000))
      return {
        shelbyAccount: "shelby://mock-account",
        blobName: `mock-data-${Date.now()}.txt`,
        dataHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`,
      }
    }

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

  async read(blobName: string): Promise<{ data: Uint8Array; contentType: string }> {
    if (this.isMock) {
      return {
        data: new TextEncoder().encode(`mock-content-for-${blobName}`),
        contentType: "application/octet-stream",
      }
    }
    const response = await fetch(`${this.baseUrl}/blobs/${encodeURIComponent(blobName)}`, {
      headers: this.authHeaders(),
    })
    if (!response.ok) {
      throw new Error(`Shelby read failed: ${response.status} ${response.statusText}`)
    }
    const contentType = response.headers.get("Content-Type") ?? "application/octet-stream"
    const data = new Uint8Array(await response.arrayBuffer())
    return { data, contentType }
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
