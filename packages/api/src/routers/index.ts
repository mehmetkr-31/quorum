import { contributionRouter } from "./contribution"
import { daoRouter } from "./dao"
import { datasetRouter } from "./dataset"
import { delegationRouter } from "./delegation"
import { governanceRouter } from "./governance"
import { proposalRouter } from "./proposal"
import { revenueRouter } from "./revenue"
import { stakingRouter } from "./staking"
import { voteRouter } from "./vote"

export const appRouter = {
  dao: daoRouter,
  contribution: contributionRouter,
  dataset: datasetRouter,
  governance: governanceRouter,
  proposal: proposalRouter,
  staking: stakingRouter,
  delegation: delegationRouter,
  revenue: revenueRouter,
  vote: voteRouter,
}

export type AppRouter = typeof appRouter
