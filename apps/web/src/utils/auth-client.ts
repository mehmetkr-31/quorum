import { createAuthClient } from "better-auth/client"

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "http://localhost:3001",
})

function encodeHex(bytes: Uint8Array) {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`
}

function serializeCryptoValue(value: unknown): string {
  if (typeof value === "string") return value
  if (value instanceof Uint8Array) return encodeHex(value)

  if (typeof value === "object" && value !== null) {
    const maybeWithBytes = value as {
      toString?: () => string
      toUint8Array?: () => Uint8Array
      data?: Uint8Array | number[] | string
      value?: unknown
    }

    if (typeof maybeWithBytes.toString === "function") {
      const stringValue = maybeWithBytes.toString()
      if (stringValue && stringValue !== "[object Object]") return stringValue
    }

    if (typeof maybeWithBytes.toUint8Array === "function") {
      return encodeHex(maybeWithBytes.toUint8Array())
    }

    if (maybeWithBytes.data instanceof Uint8Array) {
      return encodeHex(maybeWithBytes.data)
    }

    if (Array.isArray(maybeWithBytes.data)) {
      return encodeHex(Uint8Array.from(maybeWithBytes.data))
    }

    if (typeof maybeWithBytes.data === "string") {
      return maybeWithBytes.data
    }

    if ("value" in maybeWithBytes && maybeWithBytes.value !== value) {
      return serializeCryptoValue(maybeWithBytes.value)
    }
  }

  throw new Error("Wallet returned an unsupported crypto value format.")
}

export async function walletSignIn(params: {
  address: string
  publicKey: unknown
  signMessage: (args: {
    message: string
    nonce: string
  }) => Promise<{ signature: unknown; fullMessage?: string }>
}): Promise<boolean> {
  const { address, publicKey, signMessage } = params
  const serializedPublicKey = serializeCryptoValue(publicKey)

  // 1. Nonce al
  const nonceRes = await fetch("/api/auth/wallet/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
    credentials: "include",
  })
  console.debug("[Auth] nonce:", nonceRes.status)
  if (!nonceRes.ok) return false
  const { nonce } = (await nonceRes.json()) as { nonce: string }

  // 2. Mesaj oluştur ve imzala
  const message = `Quorum DAO'ya giriş\nAdres: ${address}\nNonce: ${nonce}`
  let signature: string
  let signedMessage = message
  try {
    const result = await signMessage({ message, nonce })
    signature = serializeCryptoValue(result.signature)
    if (typeof result.fullMessage === "string" && result.fullMessage.length > 0) {
      signedMessage = result.fullMessage
    }
    console.debug(
      "[Auth] signature type:",
      typeof result.signature,
      "value:",
      signature.slice(0, 30),
    )
  } catch (error) {
    console.error("[Auth] signMessage failed:", error)
    return false
  }

  // 3. Sunucuda doğrula
  const verifyRes = await fetch("/api/auth/wallet/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      publicKey: serializedPublicKey,
      signature,
      message: signedMessage,
    }),
    credentials: "include",
  })
  console.debug("[Auth] verify:", verifyRes.status)

  if (!verifyRes.ok) {
    const errData = await verifyRes.json().catch(() => null)
    if (errData?.message) throw new Error(errData.message)
    return false
  }

  return true
}

export async function walletSignOut(): Promise<void> {
  await authClient.signOut()
}

export async function getSession() {
  return authClient.getSession()
}
