// Vercel serverless function — wraps TanStack Start fetch handler
// This file is in the SOURCE root, Vercel copies it to the deployment

export const config = {
  runtime: "nodejs22.x",
}

export default async function handler(req, res) {
  // Lazy import the built server
  const { default: server } = await import("../dist/server/server.js")

  const url = new URL(
    req.url,
    `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`,
  )

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value != null) {
      headers.set(key, Array.isArray(value) ? value.join(", ") : String(value))
    }
  }

  let body
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await new Promise((resolve, reject) => {
      const chunks = []
      req.on("data", (chunk) => chunks.push(chunk))
      req.on("end", () => resolve(Buffer.concat(chunks)))
      req.on("error", reject)
    })
  }

  const request = new Request(url.toString(), {
    method: req.method,
    headers,
    body: body?.length ? body : undefined,
  })

  const response = await server.fetch(request)

  res.statusCode = response.status
  for (const [key, value] of response.headers.entries()) {
    res.setHeader(key, value)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  res.end(buffer)
}
