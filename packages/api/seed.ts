import { config } from "dotenv"
import path from "node:path"
config({ path: path.resolve(process.cwd(), "../../apps/web/.env") })

import { createDb, datasets } from "@quorum/db"

const dbUrl = process.env.DATABASE_URL || "file:../../dev.db"
const dbToken = process.env.DATABASE_AUTH_TOKEN
const db = createDb(dbUrl, dbToken)

async function seed() {
  await db.insert(datasets).values({
    id: "dataset-1",
    name: "AI Training Dataset (Default)",
    description: "This is a default dataset to contribute files into.",
    ownerAddress: "0x63ff9ee9403ce2bb449294c5f90a6b88b7e56b0e6d8b0d0d5f04a70998d4c7a7",
    createdAt: new Date(),
  }).onConflictDoNothing();
  console.log("Seeded default dataset!");
}

seed().catch(console.error);
