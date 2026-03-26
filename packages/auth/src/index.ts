import crypto from "node:crypto"
import { Ed25519PublicKey, Ed25519Signature } from "@aptos-labs/ts-sdk"
import { authAccount, authSession, authUser, authVerification, createDb } from "@quorum/db"
import { env } from "@quorum/env/server"
import { APIError, type BetterAuthPlugin, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { createAuthEndpoint } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"
import { z } from "zod"

// createDb yalnızca server'da çağrılmalı — module scope'dan kaldırıldı
function createAuthInstance() {
  const db = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN)
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      camelCase: true,
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      "http://localhost:3004",
      "http://localhost:3005",
      "http://localhost:3000",
    ],
    plugins: [aptosWalletPlugin()],
  })
}

let _auth: ReturnType<typeof createAuthInstance> | null = null
function getAuth() {
  if (!_auth) _auth = createAuthInstance()
  return _auth
}

// Proxy — handler/api erişimi lazy init yapar
export const auth = new Proxy({} as ReturnType<typeof createAuthInstance>, {
  get(_t, prop) {
    return getAuth()[prop as keyof ReturnType<typeof createAuthInstance>]
  },
})

function aptosWalletPlugin(): BetterAuthPlugin {
  return {
    id: "aptos-wallet",
    schema: {
      user: {
        fields: {
          walletAddress: {
            type: "string",
            required: false,
            unique: true,
          },
        },
      },
    },
    endpoints: {
      getWalletNonce: createAuthEndpoint(
        "/wallet/nonce",
        {
          method: "POST",
          body: z.object({ address: z.string() }),
        },
        async (ctx) => {
          const nonce = crypto.randomBytes(16).toString("hex")
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: `wallet:${ctx.body.address}`,
            value: nonce,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          })
          return ctx.json({ nonce })
        },
      ),

      verifyWallet: createAuthEndpoint(
        "/wallet/verify",
        {
          method: "POST",
          requireRequest: true,
          body: z.object({
            address: z.string(),
            publicKey: z.string(),
            signature: z.string(),
            message: z.string(),
          }),
        },
        async (ctx) => {
          const { address, publicKey, signature, message } = ctx.body

          // Nonce kontrolü
          const verification = await ctx.context.internalAdapter.findVerificationValue(
            `wallet:${address}`,
          )
          if (!verification || new Date() > verification.expiresAt) {
            throw APIError.fromStatus("UNAUTHORIZED", {
              message: "Geçersiz veya süresi dolmuş nonce",
              status: 401,
            })
          }
          if (!message.includes(verification.value)) {
            throw APIError.fromStatus("UNAUTHORIZED", {
              message: "Nonce uyuşmuyor",
              status: 401,
            })
          }
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(`wallet:${address}`)

          // Aptos Ed25519 imza doğrulama
          try {
            const pubKey = new Ed25519PublicKey(publicKey)
            const sig = new Ed25519Signature(signature)
            const valid = pubKey.verifySignature({
              message: new TextEncoder().encode(message),
              signature: sig,
            })
            if (!valid) throw new Error("bad sig")
          } catch {
            throw APIError.fromStatus("UNAUTHORIZED", {
              message: "Geçersiz imza",
              status: 401,
            })
          }

          // Kullanıcı bul veya oluştur
          const foundUser = (await ctx.context.adapter.findOne({
            model: "user",
            where: [{ field: "walletAddress", operator: "eq", value: address }],
          })) as { id: string; walletAddress?: string | null } | null

          let user: { id: string; walletAddress?: string | null }
          if (foundUser) {
            user = foundUser
          } else {
            const newUser = await ctx.context.internalAdapter.createUser({
              email: `${address.toLowerCase()}@aptos.wallet`,
              name: `${address.slice(0, 8)}...${address.slice(-4)}`,
              emailVerified: true,
              walletAddress: address,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            if (!newUser) {
              throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
                message: "Kullanıcı oluşturulamadı",
                status: 500,
              })
            }
            user = { id: newUser.id, walletAddress: address }
            await ctx.context.internalAdapter.createAccount({
              userId: user.id,
              providerId: "aptos-wallet",
              accountId: address,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          }

          const session = await ctx.context.internalAdapter.createSession(user.id)
          if (!session) {
            throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
              message: "Oturum oluşturulamadı",
              status: 500,
            })
          }

          await setSessionCookie(ctx, {
            session,
            user: user as any, // better-auth setSessionCookie expectation varies, keeping as any for now but logic above is cleaner
          })
          return ctx.json({ success: true, user: { id: user.id, walletAddress: address } })
        },
      ),
    },
  }
}

export type Auth = typeof auth
