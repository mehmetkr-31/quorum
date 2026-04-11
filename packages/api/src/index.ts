import { os } from "@orpc/server"
import type { Context } from "./context"

export const o = os.$context<Context>()

export const publicProcedure = o

export const protectedProcedure = o.use(({ context, next }) => {
  if (!context.session) {
    throw new Error("UNAUTHORIZED")
  }
  return next({ context: { ...context, session: context.session } })
})

export function assertSessionWallet(
  context: Context,
  walletAddress: string,
  message = "FORBIDDEN",
) {
  if (!context.session) {
    throw new Error("UNAUTHORIZED")
  }

  if (context.session.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error(message)
  }
}
