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
