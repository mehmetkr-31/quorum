import { contributionRouter } from "./contribution"
import { datasetRouter } from "./dataset"
import { governanceRouter } from "./governance"
import { revenueRouter } from "./revenue"
import { voteRouter } from "./vote"

export const appRouter = {
  contribution: contributionRouter,
  dataset: datasetRouter,
  governance: governanceRouter,
  revenue: revenueRouter,
  vote: voteRouter,
}

export type AppRouter = typeof appRouter
