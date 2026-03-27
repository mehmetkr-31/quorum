import { createFileRoute } from "@tanstack/react-router"

async function handle({ request }: { request: Request }) {
  const { auth } = await import("@quorum/auth")
  return auth.handler(request)
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Start server handlers lack public type
} as any)
