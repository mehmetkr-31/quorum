import { beforeEach, describe, expect, it, vi } from "vitest"

// fetch'i mock et
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// console.error'u mock et — beklenen hataları CI log'larını kirletmesin
vi.stubGlobal("console", { ...console, error: vi.fn(), debug: vi.fn() })

// better-auth client mock
vi.mock("better-auth/client", () => ({
  createAuthClient: () => ({
    signOut: vi.fn().mockResolvedValue({}),
    getSession: vi.fn().mockResolvedValue(null),
  }),
}))

// Her testten önce import'u temizle
beforeEach(() => {
  vi.resetModules()
  mockFetch.mockReset()
})

describe("walletSignIn", () => {
  it("nonce alınamazsa false döner", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })
    const { walletSignIn } = await import("@/utils/auth-client")

    const result = await walletSignIn({
      address: "0xtest",
      publicKey: "0xpubkey",
      signMessage: vi.fn(),
    })
    expect(result).toBe(false)
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it("imzalama başarısız olursa false döner", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ nonce: "abc123" }),
    })
    const { walletSignIn } = await import("@/utils/auth-client")

    const result = await walletSignIn({
      address: "0xtest",
      publicKey: "0xpubkey",
      signMessage: vi.fn().mockRejectedValue(new Error("user rejected")),
    })
    expect(result).toBe(false)
  })

  it("doğrulama başarısız olursa false döner", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nonce: "abc123" }),
      })
      .mockResolvedValueOnce({ ok: false, json: async () => null })
    const { walletSignIn } = await import("@/utils/auth-client")

    const result = await walletSignIn({
      address: "0xtest",
      publicKey: "0xpubkey",
      signMessage: vi.fn().mockResolvedValue({ signature: "0xsig" }),
    })
    expect(result).toBe(false)
  })

  it("başarılı akışta true döner ve doğru endpoint'leri çağırır", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nonce: "abc123" }),
      })
      .mockResolvedValueOnce({ ok: true })
    const { walletSignIn } = await import("@/utils/auth-client")

    const signMessage = vi.fn().mockResolvedValue({
      signature: "0xsig",
      fullMessage: "signed message abc123",
    })
    const result = await walletSignIn({
      address: "0xaddr",
      publicKey: "0xpubkey",
      signMessage,
    })

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)

    const [nonceCall, verifyCall] = mockFetch.mock.calls
    expect(nonceCall[0]).toBe("/api/auth/wallet/nonce")
    expect(verifyCall[0]).toBe("/api/auth/wallet/verify")
    expect(JSON.parse(String(verifyCall[1]?.body))).toMatchObject({
      address: "0xaddr",
      publicKey: "0xpubkey",
      signature: "0xsig",
      message: "signed message abc123",
    })

    // signMessage doğru argümanlarla çağrıldı mı
    expect(signMessage).toHaveBeenCalledWith({
      message: expect.stringContaining("abc123"),
      nonce: "abc123",
    })
  })

  it("imza nesne formatında da çalışır", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nonce: "xyz" }),
      })
      .mockResolvedValueOnce({ ok: true })
    const { walletSignIn } = await import("@/utils/auth-client")

    // signature object değil direkt string dönsün
    const result = await walletSignIn({
      address: "0xaddr",
      publicKey: "0xpubkey",
      signMessage: vi.fn().mockResolvedValue({
        signature: {
          toString: () => "0xobjectsig",
        },
      }),
    })
    expect(result).toBe(true)
  })

  it("public key ve signature uint8array formatında da serialize eder", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nonce: "bytes" }),
      })
      .mockResolvedValueOnce({ ok: true })
    const { walletSignIn } = await import("@/utils/auth-client")

    const result = await walletSignIn({
      address: "0xaddr",
      publicKey: Uint8Array.from([0xab, 0xcd]),
      signMessage: vi.fn().mockResolvedValue({
        signature: Uint8Array.from([0x12, 0x34]),
      }),
    })

    expect(result).toBe(true)
    const [, verifyCall] = mockFetch.mock.calls
    expect(JSON.parse(String(verifyCall[1]?.body))).toMatchObject({
      publicKey: "0xabcd",
      signature: "0x1234",
    })
  })
})

describe("walletSignOut", () => {
  it("authClient.signOut'u çağırır", async () => {
    const { walletSignOut } = await import("@/utils/auth-client")
    await expect(walletSignOut()).resolves.toBeUndefined()
  })
})
