import type { Config } from "drizzle-kit"

export default {
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
} satisfies Config
