import { createAuthClient } from "better-auth/client"

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "http://localhost:3001",
})

export async function walletSignIn(params: {
  address: string
  publicKey: string
  signMessage: (args: { message: string; nonce: string }) => Promise<{ signature: string }>
}): Promise<boolean> {
  const { address, publicKey, signMessage } = params

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
  try {
    const result = await signMessage({ message, nonce })
    signature = typeof result.signature === "string" ? result.signature : String(result.signature)
    console.debug(
      "[Auth] signature type:",
      typeof result.signature,
      "value:",
      signature.slice(0, 30),
    )
  } catch (error) {
    console.error("[Auth] signMessage failed:", error)
    throw error
  }

  // 3. Sunucuda doğrula
  const verifyRes = await fetch("/api/auth/wallet/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, publicKey, signature, message }),
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
