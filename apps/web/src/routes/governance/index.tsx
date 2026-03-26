import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { formatDistanceToNow } from "date-fns"
import { orpc } from "../../utils/orpc"

export const Route = createFileRoute("/governance/")({
  component: GovernancePage,
})

function GovernancePage() {
  const { data: stats, isLoading: statsLoading } = useQuery(orpc.governance.getStats.queryOptions())
  const { data: members, isLoading: membersLoading } = useQuery(
    orpc.governance.listMembers.queryOptions(),
  )
  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery(
    orpc.governance.getLeaderboard.queryOptions({ input: { limit: 10 } }),
  )
  const { data: voteHistory, isLoading: historyLoading } = useQuery(
    orpc.vote.listHistory.queryOptions(),
  )

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-12 tracking-tight">Governance</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        <StatCard
          label="Total Contributions"
          value={stats?.totalContributions ?? 0}
          isLoading={statsLoading}
        />
        <StatCard
          label="Active DAO Members"
          value={stats?.totalMembers ?? 0}
          isLoading={statsLoading}
        />
        <StatCard
          label="Distributed Revenue (APT)"
          value={stats?.totalRevenue ?? "0.00"}
          isLoading={statsLoading}
        />
      </div>

      {/* Reputation Leaderboard */}
      <div className="mb-16">
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
          Reputation Leaderboard
        </h3>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 overflow-hidden shadow-2xl">
          <div className="grid grid-cols-12 text-[10px] font-bold text-neutral-500 p-4 border-b border-neutral-800 uppercase tracking-widest bg-neutral-950 gap-2">
            <span className="col-span-1">#</span>
            <span className="col-span-5">Member</span>
            <span className="col-span-2 text-center">Power</span>
            <span className="col-span-2 text-center">Approved</span>
            <span className="col-span-2 text-right">Accuracy</span>
          </div>
          {leaderboardLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-6 bg-neutral-800 animate-pulse rounded" />
              ))}
            </div>
          ) : leaderboard?.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500 italic">No members yet.</div>
          ) : (
            <div className="divide-y divide-neutral-800/50">
              {leaderboard?.map((m, i) => (
                <div
                  key={m.address}
                  className="grid grid-cols-12 p-4 text-sm items-center hover:bg-neutral-800/40 transition-colors gap-2"
                >
                  <span className="col-span-1 text-neutral-600 font-bold text-xs">{i + 1}</span>
                  <span className="col-span-5 font-mono text-indigo-400/90 text-xs">
                    {m.address.slice(0, 10)}...{m.address.slice(-4)}
                  </span>
                  <span className="col-span-2 text-center font-bold text-neutral-300">
                    {m.votingPower}
                  </span>
                  <span className="col-span-2 text-center text-teal-400 text-xs">
                    {m.approvedContributions}/{m.totalContributions}
                  </span>
                  <span className="col-span-2 text-right">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded ${
                        m.accuracy >= 70
                          ? "bg-teal-500/10 text-teal-400"
                          : m.accuracy >= 40
                            ? "bg-yellow-500/10 text-yellow-400"
                            : "bg-neutral-800 text-neutral-500"
                      }`}
                    >
                      {m.accuracy}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Members Section */}
        <div>
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            Active Members
          </h3>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 overflow-hidden shadow-2xl">
            <div className="grid grid-cols-2 text-[10px] font-bold text-neutral-500 p-4 border-b border-neutral-800 uppercase tracking-widest bg-neutral-950">
              <span>Member Address</span>
              <span className="text-right">Voting Power</span>
            </div>

            {membersLoading ? (
              <div className="p-4 space-y-4">
                <div className="h-6 bg-neutral-800 animate-pulse rounded" />
                <div className="h-6 bg-neutral-800 animate-pulse rounded" />
              </div>
            ) : members?.length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-500 italic">
                No members found.
              </div>
            ) : (
              <div className="divide-y divide-neutral-800/50 max-h-96 overflow-y-auto scrollbar-thin">
                {members?.map((m) => (
                  <div
                    key={m.address}
                    className="grid grid-cols-2 p-4 text-sm font-mono hover:bg-neutral-800/40 transition-colors items-center"
                  >
                    <span className="text-indigo-400/90">
                      {m.address.slice(0, 10)}...{m.address.slice(-4)}
                    </span>
                    <span className="text-right text-neutral-300 font-bold bg-neutral-800 px-2 py-0.5 rounded ml-auto">
                      {m.votingPower}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Voting History Section */}
        <div>
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            Recent Votes
          </h3>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 overflow-hidden shadow-2xl">
            <div className="grid grid-cols-12 text-[10px] font-bold text-neutral-500 p-4 border-b border-neutral-800 uppercase tracking-widest bg-neutral-950 gap-2">
              <span className="col-span-5">Voter</span>
              <span className="col-span-3">Decision</span>
              <span className="col-span-4 text-right">Time</span>
            </div>

            {historyLoading ? (
              <div className="p-4 space-y-4">
                <div className="h-6 bg-neutral-800 animate-pulse rounded" />
                <div className="h-6 bg-neutral-800 animate-pulse rounded" />
              </div>
            ) : voteHistory?.length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-500 italic">
                No votes cast yet.
              </div>
            ) : (
              <div className="divide-y divide-neutral-800/50 max-h-96 overflow-y-auto scrollbar-thin">
                {voteHistory?.map((vote) => (
                  <div
                    key={vote.id}
                    className="grid grid-cols-12 p-4 text-sm font-mono items-center hover:bg-neutral-800/40 transition-colors gap-2"
                  >
                    <span className="col-span-5 text-indigo-400/80 text-xs">
                      {vote.voterAddress.slice(0, 6)}...{vote.voterAddress.slice(-4)}
                    </span>
                    <span className="col-span-3 flex">
                      {vote.decision === "approve" ? (
                        <span className="text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded uppercase">
                          Approve
                        </span>
                      ) : vote.decision === "reject" ? (
                        <span className="text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded uppercase">
                          Reject
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded uppercase">
                          Improve
                        </span>
                      )}
                    </span>
                    <span className="col-span-4 text-right text-xs text-neutral-500">
                      {formatDistanceToNow(new Date(vote.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  isLoading,
}: {
  label: string
  value: string | number
  isLoading?: boolean
}) {
  return (
    <div className="p-8 rounded-[2rem] bg-neutral-900 border border-neutral-800 text-center shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col justify-center min-h-[140px]">
      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3">
        {label}
      </p>
      {isLoading ? (
        <div className="h-8 w-16 mx-auto bg-neutral-800 animate-pulse rounded" />
      ) : (
        <p className="text-4xl font-bold tracking-tight text-white">{value}</p>
      )}
    </div>
  )
}
