import { Ed25519PublicKey, Ed25519Signature } from "@aptos-labs/ts-sdk"
import { createDb } from "@quorum/db"
import { env } from "@quorum/env/server"
import { APIError } from "better-auth"
import { createAuthEndpoint } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { betterAuth, type BetterAuthPlugin } from "better-auth"
import crypto from "node:crypto"
import { z } from "zod"

const db = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN)

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
          type AnyUser = Record<string, any> & { id: string }
          let foundUser = await ctx.context.adapter.findOne<AnyUser>({
            model: "user",
            where: [{ field: "walletAddress", operator: "eq", value: address }],
          })

          if (!foundUser) {
            foundUser = (await ctx.context.internalAdapter.createUser({
              email: `${address.toLowerCase()}@aptos.wallet`,
              name: `${address.slice(0, 8)}...${address.slice(-4)}`,
              emailVerified: true,
              walletAddress: address,
              createdAt: new Date(),
              updatedAt: new Date(),
            })) as AnyUser
            await ctx.context.internalAdapter.createAccount({
              userId: foundUser.id,
              providerId: "aptos-wallet",
              accountId: address,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          }

          const session = await ctx.context.internalAdapter.createSession(foundUser.id)
          if (!session) {
            throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
              message: "Oturum oluşturulamadı",
              status: 500,
            })
          }

          await setSessionCookie(ctx, {
            session,
            user: foundUser as Parameters<typeof setSessionCookie>[1]["user"],
          })
          return ctx.json({ success: true, user: { id: foundUser.id, walletAddress: address } })
        },
      ),
    },
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    camelCase: true,
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  plugins: [aptosWalletPlugin()],
})

export type Auth = typeof auth
