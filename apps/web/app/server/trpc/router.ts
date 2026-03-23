import { router } from "./trpc"
import { contributionRouter } from "./contribution"
import { datasetRouter } from "./dataset"
import { revenueRouter } from "./revenue"
import { voteRouter } from "./vote"

export const appRouter = router({
  contribution: contributionRouter,
  vote: voteRouter,
  dataset: datasetRouter,
  revenue: revenueRouter,
})

export type AppRouter = typeof appRouter
