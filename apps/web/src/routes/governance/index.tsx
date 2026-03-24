import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { orpc } from "../../utils/orpc"

export const Route = createFileRoute("/governance/")({
  component: GovernancePage,
})

function GovernancePage() {
  const { data: stats } = useQuery(orpc.governance.getStats.queryOptions())
  const { data: members } = useQuery(orpc.governance.listMembers.queryOptions())

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-12">Governance</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        <StatCard label="Contributions" value={stats?.totalContributions ?? 0} />
        <StatCard label="DAO Members" value={stats?.totalMembers ?? 0} />
        <StatCard label="Revenue (APT)" value={stats?.totalRevenue ?? "0.00"} />
      </div>

      <h3 className="text-xl font-bold mb-6">Active Members</h3>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden shadow-2xl">
        <div className="grid grid-cols-2 text-xs font-bold text-neutral-500 p-4 border-b border-neutral-800 uppercase tracking-widest">
          <span>Address</span>
          <span className="text-right">Voting Power</span>
        </div>
        <div className="divide-y divide-neutral-800">
          {members?.map((m) => (
            <div
              key={m.address}
              className="grid grid-cols-2 p-4 text-sm font-mono hover:bg-neutral-900 transition-colors"
            >
              <span className="text-indigo-400">{m.address.slice(0, 12)}...</span>
              <span className="text-right text-neutral-200">{m.votingPower}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 text-center">
      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  )
}
