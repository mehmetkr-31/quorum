import { createAPIFileRoute } from "@tanstack/start/api"
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { createContext } from "~/server/trpc/context"
import { appRouter } from "~/server/trpc/router"

const handler = (request: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext,
  })

export const APIRoute = createAPIFileRoute("/api/trpc/$")({
  GET: ({ request }) => handler(request),
  POST: ({ request }) => handler(request),
})
