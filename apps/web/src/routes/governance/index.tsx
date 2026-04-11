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
    <main className="pt-24 pb-24 px-8 max-w-[1440px] mx-auto dot-grid min-h-screen">
      {/* Decorative glows */}
      <div className="fixed top-1/4 -right-64 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[160px] pointer-events-none -z-10" />
      <div className="fixed bottom-0 -left-64 w-[600px] h-[600px] bg-secondary/5 rounded-full blur-[160px] pointer-events-none -z-10" />

      {/* Header */}
      <header className="mb-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <span className="text-tertiary font-label text-xs uppercase tracking-[0.2em] mb-3 block">
              DAO Control Center
            </span>
            <h1 className="text-5xl md:text-7xl font-headline font-bold tracking-tighter text-on-surface leading-none">
              GOVERNANCE
            </h1>
          </div>
          <div className="flex flex-col items-end">
            <p className="text-on-surface-variant text-sm max-w-[300px] text-right mb-4 leading-relaxed">
              On-chain statistics, member reputation, and voting history secured by Aptos.
            </p>
            <div className="h-1 w-32 bg-gradient-to-r from-primary to-secondary rounded-full" />
          </div>
        </div>
      </header>

      {/* Stats Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        <StatCard
          label="Total Contributions"
          value={stats?.totalContributions ?? 0}
          isLoading={statsLoading}
          accent="text-primary"
        />
        <StatCard
          label="Active DAO Members"
          value={stats?.totalMembers ?? 0}
          isLoading={statsLoading}
          accent="text-secondary"
        />
        <StatCard
          label="Distributed Revenue (APT)"
          value={stats?.totalRevenue ?? "0.00"}
          isLoading={statsLoading}
          accent="text-tertiary"
        />
      </section>

      {/* Leaderboard */}
      <section className="mb-16">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-headline font-bold text-on-surface tracking-tight">
            Reputation Leaderboard
          </h2>
          <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-primary/20">
            Top Curators
          </span>
        </div>
        <div className="glass-card rounded-xl overflow-hidden border border-outline-variant/10">
          <div className="grid grid-cols-12 text-[10px] font-label font-bold text-on-surface-variant px-8 py-5 border-b border-outline-variant/10 bg-surface-container-low/50 uppercase tracking-widest gap-2">
            <span className="col-span-1">#</span>
            <span className="col-span-5">Member</span>
            <span className="col-span-2 text-center">Power</span>
            <span className="col-span-2 text-center">Approved</span>
            <span className="col-span-2 text-right">Accuracy</span>
          </div>
          {leaderboardLoading ? (
            <div className="p-8 space-y-4 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-6 bg-surface-container rounded" />
              ))}
            </div>
          ) : leaderboard?.length === 0 ? (
            <div className="p-12 text-center text-on-surface-variant text-sm italic">
              No members yet.
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/5">
              {leaderboard?.map(
                (
                  m: {
                    address: string
                    votingPower: number
                    approvedContributions: number
                    totalContributions: number
                    accuracy: number
                  },
                  i: number,
                ) => (
                  <div
                    key={m.address}
                    className="grid grid-cols-12 px-8 py-5 text-sm items-center hover:bg-primary/5 transition-colors gap-2 cursor-default"
                  >
                    <span className="col-span-1 text-outline font-bold text-xs">{i + 1}</span>
                    <span className="col-span-5 font-mono text-primary text-xs">
                      {m.address.slice(0, 10)}...{m.address.slice(-4)}
                    </span>
                    <span className="col-span-2 text-center font-bold text-on-surface">
                      {m.votingPower}
                    </span>
                    <span className="col-span-2 text-center text-tertiary text-xs">
                      {m.approvedContributions}/{m.totalContributions}
                    </span>
                    <span className="col-span-2 text-right">
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full ${
                          m.accuracy >= 70
                            ? "bg-tertiary/10 text-tertiary border border-tertiary/20"
                            : m.accuracy >= 40
                              ? "bg-secondary/10 text-secondary border border-secondary/20"
                              : "bg-surface-container text-on-surface-variant border border-outline-variant/20"
                        }`}
                      >
                        {m.accuracy}%
                      </span>
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </section>

      {/* Members + Vote History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Members */}
        <div>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-headline font-bold text-on-surface tracking-tight">
              Active Members
            </h2>
            <span className="bg-secondary/10 text-secondary px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-secondary/20">
              {members?.length ?? 0} nodes
            </span>
          </div>
          <div className="glass-card rounded-xl overflow-hidden border border-outline-variant/10">
            <div className="grid grid-cols-2 text-[10px] font-label font-bold text-on-surface-variant px-8 py-5 border-b border-outline-variant/10 bg-surface-container-low/50 uppercase tracking-widest">
              <span>Member Address</span>
              <span className="text-right">Voting Power</span>
            </div>
            {membersLoading ? (
              <div className="p-8 space-y-4 animate-pulse">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-6 bg-surface-container rounded" />
                ))}
              </div>
            ) : members?.length === 0 ? (
              <div className="p-12 text-center text-on-surface-variant text-sm italic">
                No members found.
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/5 max-h-96 overflow-y-auto">
                {members?.map((m) => (
                  <div
                    key={m.address}
                    className="grid grid-cols-2 px-8 py-5 text-sm font-mono hover:bg-primary/5 transition-colors items-center"
                  >
                    <span className="text-primary text-xs">
                      {m.address.slice(0, 10)}...{m.address.slice(-4)}
                    </span>
                    <span className="text-right">
                      <span className="text-on-surface font-bold bg-surface-container px-3 py-1 rounded-full text-xs border border-outline-variant/20">
                        {m.votingPower} VP
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Vote History */}
        <div>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-headline font-bold text-on-surface tracking-tight">
              Recent Votes
            </h2>
            <span className="bg-tertiary/10 text-tertiary px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-tertiary/20">
              Live Sync
            </span>
          </div>
          <div className="glass-card rounded-xl overflow-hidden border border-outline-variant/10">
            <div className="grid grid-cols-12 text-[10px] font-label font-bold text-on-surface-variant px-8 py-5 border-b border-outline-variant/10 bg-surface-container-low/50 uppercase tracking-widest gap-2">
              <span className="col-span-5">Voter</span>
              <span className="col-span-3">Decision</span>
              <span className="col-span-4 text-right">Time</span>
            </div>
            {historyLoading ? (
              <div className="p-8 space-y-4 animate-pulse">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-6 bg-surface-container rounded" />
                ))}
              </div>
            ) : voteHistory?.length === 0 ? (
              <div className="p-12 text-center text-on-surface-variant text-sm italic">
                No votes cast yet.
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/5 max-h-96 overflow-y-auto">
                {voteHistory?.map((vote) => (
                  <div
                    key={vote.id}
                    className="grid grid-cols-12 px-8 py-5 text-sm font-mono items-center hover:bg-primary/5 transition-colors gap-2 cursor-default"
                  >
                    <span className="col-span-5 text-primary text-xs">
                      {vote.voterAddress.slice(0, 6)}...{vote.voterAddress.slice(-4)}
                    </span>
                    <span className="col-span-3">
                      {vote.decision === "approve" ? (
                        <span className="text-[10px] font-bold bg-tertiary/10 text-tertiary border border-tertiary/20 px-2 py-1 rounded-full uppercase">
                          Approve
                        </span>
                      ) : vote.decision === "reject" ? (
                        <span className="text-[10px] font-bold bg-error/10 text-error border border-error/20 px-2 py-1 rounded-full uppercase">
                          Reject
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold bg-secondary/10 text-secondary border border-secondary/20 px-2 py-1 rounded-full uppercase">
                          Improve
                        </span>
                      )}
                    </span>
                    <span className="col-span-4 text-right text-xs text-on-surface-variant">
                      {formatDistanceToNow(new Date(vote.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

function StatCard({
  label,
  value,
  isLoading,
  accent,
}: {
  label: string
  value: string | number
  isLoading?: boolean
  accent: string
}) {
  return (
    <div className="glass-card p-8 rounded-xl relative overflow-hidden group">
      <h3 className="text-on-surface-variant text-xs uppercase tracking-widest font-label mb-6">
        {label}
      </h3>
      {isLoading ? (
        <div className="h-10 w-24 bg-surface-container animate-pulse rounded" />
      ) : (
        <p className={`text-4xl font-headline font-bold ${accent}`}>{value}</p>
      )}
    </div>
  )
}
