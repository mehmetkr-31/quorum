import { useWallet } from "@aptos-labs/wallet-adapter-react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { formatDistanceToNow } from "date-fns"
import { orpc } from "../../utils/orpc"

export const Route = createFileRoute("/earnings/")({
  component: EarningsPage,
})

function EarningsPage() {
  const { connected, account } = useWallet()
  const { data: earnings } = useQuery({
    ...orpc.revenue.getEarnings.queryOptions({
      input: { contributorAddress: account?.address?.toString() ?? "" },
    }),
    enabled: !!connected && !!account,
  })

  const { data: receipts, isLoading: receiptsLoading } = useQuery({
    ...orpc.revenue.listReceipts.queryOptions(),
  })

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-12 tracking-tight">My Earnings & Receipts</h1>
      {!connected ? (
        <div className="p-12 border-2 border-dashed border-neutral-800 rounded-3xl text-center text-neutral-500">
          Connect your wallet to see your contribution weight and rewards.
        </div>
      ) : (
        <div className="space-y-12">
          {/* Earnings Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="p-8 rounded-3xl bg-neutral-900 border border-neutral-800 shadow-[0_0_30px_rgba(79,70,229,0.1)]">
              <p className="text-sm font-bold text-neutral-500 uppercase tracking-widest mb-2">
                Approved Weight
              </p>
              <p className="text-5xl font-bold text-indigo-400">{earnings?.totalWeight ?? 0}</p>
            </div>
            <div className="p-8 rounded-3xl bg-neutral-900 border border-neutral-800 shadow-[0_0_30px_rgba(20,184,166,0.1)]">
              <p className="text-sm font-bold text-neutral-500 uppercase tracking-widest mb-2">
                Approved Submissions
              </p>
              <p className="text-5xl font-bold text-teal-400">
                {earnings?.approvedContributions ?? 0}
              </p>
            </div>
          </div>

          {/* Platform Receipts History */}
          <div className="pt-8 border-t border-neutral-800/50">
            <h2 className="text-2xl font-bold mb-3">Platform Data Reads (Receipts)</h2>
            <p className="text-sm text-neutral-400 mb-8 max-w-3xl">
              When AI models read data from Quorum's datasets on Shelby Protocol, receipts are
              generated and anchored to Aptos. The revenue from these reads is automatically
              distributed to contributors and curators.
            </p>

            {receiptsLoading ? (
              <div className="animate-pulse space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-neutral-900 rounded-xl" />
                ))}
              </div>
            ) : receipts?.length === 0 ? (
              <div className="p-12 text-center text-neutral-500 border border-neutral-800 border-dashed rounded-2xl">
                <svg
                  className="w-12 h-12 mx-auto mb-4 opacity-20"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                No data reads (receipts) recorded on-chain yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/40">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-900/80 text-neutral-400 border-b border-neutral-800">
                    <tr>
                      <th className="px-6 py-5 font-bold">Time</th>
                      <th className="px-6 py-5 font-bold">Reader Address</th>
                      <th className="px-6 py-5 font-bold">Amount (APT)</th>
                      <th className="px-6 py-5 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/50">
                    {receipts?.map((r) => (
                      <tr key={r.id} className="hover:bg-neutral-800/30 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-neutral-300">
                          {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-indigo-400/80">
                          {r.readerAddress.slice(0, 10)}...{r.readerAddress.slice(-4)}
                        </td>
                        <td className="px-6 py-4 font-bold text-teal-400">
                          {(r.amount / 100000000).toFixed(4)}
                        </td>
                        <td className="px-6 py-4">
                          {r.distributed ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                              Distributed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-xs font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                              Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
