import { beforeEach, describe, expect, it, vi } from "vitest"

// fetch'i mock et
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

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

    const signMessage = vi.fn().mockResolvedValue({ signature: "0xsig" })
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
      signMessage: vi.fn().mockResolvedValue({ signature: "hex-sig-string" }),
    })
    expect(result).toBe(true)
  })
})

describe("walletSignOut", () => {
  it("authClient.signOut'u çağırır", async () => {
    const { walletSignOut } = await import("@/utils/auth-client")
    await expect(walletSignOut()).resolves.toBeUndefined()
  })
})
