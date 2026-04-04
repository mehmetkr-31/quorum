import { createDb, daoMemberships, daos, datasets } from "./packages/db/src/index.js"

const db = createDb(
  process.env.DATABASE_URL ?? "file:./apps/web/local.db",
  process.env.DATABASE_AUTH_TOKEN,
)

const DEFAULT_OWNER = "0x63ff9ee9403ce2bb449294c5f90a6b88b7e56b0e6d8b0d0d5f04a70998d4c7a7"

async function seed() {
  // Create default DAO
  await db
    .insert(daos)
    .values({
      id: "dao-1",
      name: "Quorum Genesis DAO",
      description:
        "The original Quorum DAO — a community-governed AI training dataset. Submit data, vote on quality, earn from usage.",
      slug: "genesis",
      ownerAddress: DEFAULT_OWNER,
      treasuryAddress: DEFAULT_OWNER,
      votingWindowSeconds: 172800,
      quorumThreshold: 60,
      createdAt: new Date(),
    })
    .onConflictDoNothing()
  console.log("Seeded default DAO: genesis")

  // Add owner as DAO member
  await db
    .insert(daoMemberships)
    .values({
      id: "membership-1",
      daoId: "dao-1",
      memberAddress: DEFAULT_OWNER,
      votingPower: 10,
      role: "owner",
      joinedAt: new Date(),
    })
    .onConflictDoNothing()

  // Create default dataset under the DAO
  await db
    .insert(datasets)
    .values({
      id: "dataset-1",
      daoId: "dao-1",
      name: "AI Training Dataset (Default)",
      description: "This is a default dataset to contribute files into.",
      ownerAddress: DEFAULT_OWNER,
      createdAt: new Date(),
    })
    .onConflictDoNothing()
  console.log("Seeded default dataset!")
}

seed().catch(console.error)
