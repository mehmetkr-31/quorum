/// <reference types="vite/client" />
import { z } from "zod"

export const webEnv = z.object({
  VITE_CONTRACT_ADDRESS: z.string(),
  VITE_APTOS_NODE_URL: z.string().url(),
})

export const env = webEnv.parse({
  VITE_CONTRACT_ADDRESS: import.meta.env.VITE_CONTRACT_ADDRESS,
  VITE_APTOS_NODE_URL: import.meta.env.VITE_APTOS_NODE_URL,
})
