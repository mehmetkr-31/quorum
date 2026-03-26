import type { Config } from "drizzle-kit"

const url = process.env.DATABASE_URL ?? "file:./dev.db"
const authToken = process.env.DATABASE_AUTH_TOKEN

// Turso (libsql) uses "turso" dialect when a remote URL is provided
const isTurso = url.startsWith("libsql://") || url.startsWith("https://")

export default {
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: isTurso ? "turso" : "sqlite",
  dbCredentials: isTurso
    ? { url, authToken }
    : { url },
} satisfies Config
