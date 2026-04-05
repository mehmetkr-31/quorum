// Production server entry point for Railway/Render/Docker
// Uses srvx node adapter to serve TanStack Start app
import { serve } from "srvx/node"

const { default: app } = await import("./dist/server/server.js")

serve(app, {
  port: Number(process.env.PORT) || 3000,
  hostname: "0.0.0.0",
})
