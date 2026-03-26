import { auth } from "@quorum/auth"
import { createFileRoute } from "@tanstack/react-router"

async function handle({ request }: { request: Request }) {
  return auth.handler(request)
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
} as any)
