import { z } from "zod"

export const serverEnv = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  APTOS_PRIVATE_KEY: z.string().optional(),
  APTOS_API_KEY: z.string().optional(),
  APTOS_NODE_URL: z.string().url(),
  QUORUM_CONTRACT_ADDRESS: z.string(),
  SHELBY_ACCOUNT: z.string().optional(),
  SHELBY_NETWORK: z.string().default("SHELBYNET"),
  SHELBY_API_KEY: z.string().optional(),
  SHELBY_BASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string(),
  BETTER_AUTH_URL: z.string().url(),
})

export const env = serverEnv.parse(process.env)
