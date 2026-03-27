import { createFileRoute } from "@tanstack/react-router"
import { checkRateLimit, getClientIp } from "@/server/rate-limit"

// Server-only import'lar handler içinde — client bundle'a dahil olmaz
async function handle({ request }: { request: Request }) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "Too Many Requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    })
  }

  const [
    { RPCHandler },
    { onError },
    { OpenAPIHandler },
    { OpenAPIReferencePlugin },
    { ZodToJsonSchemaConverter },
    { createContext },
    { appRouter },
  ] = await Promise.all([
    import("@orpc/server/fetch"),
    import("@orpc/server"),
    import("@orpc/openapi/fetch"),
    import("@orpc/openapi/plugins"),
    import("@orpc/zod/zod4"),
    import("@quorum/api/context"),
    import("@quorum/api/routers/index"),
  ])

  const rpcHandler = new RPCHandler(appRouter, {
    interceptors: [onError((error) => console.error(error))],
  })

  const apiHandler = new OpenAPIHandler(appRouter, {
    plugins: [new OpenAPIReferencePlugin({ schemaConverters: [new ZodToJsonSchemaConverter()] })],
    interceptors: [onError((error) => console.error(error))],
  })

  const ctx = await createContext({ req: request })

  const rpcResult = await rpcHandler.handle(request, { prefix: "/api/rpc", context: ctx })
  if (rpcResult.response) return rpcResult.response

  const apiResult = await apiHandler.handle(request, {
    prefix: "/api/rpc/api-reference",
    context: ctx,
  })
  if (apiResult.response) return apiResult.response

  return new Response("Not found", { status: 404 })
}

export const Route = createFileRoute("/api/rpc/$")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
      HEAD: handle,
    },
  },
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Start server handlers lack public type
} as any)
