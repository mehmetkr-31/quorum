import { useWallet } from "@aptos-labs/wallet-adapter-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import { orpc } from "../../utils/orpc"

export const Route = createFileRoute("/earnings/")({
  component: EarningsPage,
})

function EarningsPage() {
  const { connected, account } = useWallet()
  const queryClient = useQueryClient()

  const { data: earnings } = useQuery({
    ...orpc.revenue.getEarnings.queryOptions({
      input: { contributorAddress: account?.address?.toString() ?? "" },
    }),
    enabled: !!connected && !!account,
  })

  const { data: receipts, isLoading: receiptsLoading } = useQuery(
    orpc.revenue.listReceipts.queryOptions(),
  )

  const { data: myContributions } = useQuery({
    ...orpc.contribution.listMine.queryOptions({
      input: { walletAddress: account?.address?.toString() ?? "" },
    }),
    enabled: !!connected && !!account,
  })

  const distributeMutation = useMutation(orpc.revenue.distribute.mutationOptions())

  async function handleClaimAll() {
    const pending = receipts?.filter((r) => !r.distributed) ?? []
    if (pending.length === 0) {
      toast.info("No pending rewards to claim")
      return
    }
    for (const r of pending) {
      await handleDistribute(r.id)
    }
    toast.success(`Claimed ${pending.length} reward(s)!`)
  }

  async function handleDistribute(receiptId: string) {
    try {
      const { aptosTxHash } = await distributeMutation.mutateAsync({ receiptId })
      toast.success(`Revenue distributed! Tx: ${aptosTxHash.slice(0, 12)}...`)
      queryClient.invalidateQueries({ queryKey: orpc.revenue.listReceipts.queryOptions().queryKey })
    } catch (err: unknown) {
      toast.error((err as Error).message || "Distribution failed")
    }
  }

  return (
    <>
      {/* Background decorative glows */}
      <div className="fixed top-1/4 -right-64 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[160px] pointer-events-none -z-10" />
      <div className="fixed bottom-0 -left-64 w-[600px] h-[600px] bg-secondary/5 rounded-full blur-[160px] pointer-events-none -z-10" />

      <main className="pt-24 pb-24 px-8 max-w-[1440px] mx-auto dot-grid min-h-screen">
        {/* Header */}
        <header className="mb-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-12 text-left">
            <div className="max-w-3xl">
              <span className="label-sm !text-tertiary mb-6 block">NODE_OPERATOR_ANALYTICS</span>
              <h1 className="display-lg text-on-surface leading-none">
                CONTRIBUTOR <br /> <span className="text-gradient">EARNINGS</span>
              </h1>
            </div>
            <div className="flex flex-col items-end">
              <p className="text-lg text-on-surface-variant max-w-[400px] text-right mb-6 font-light leading-relaxed">
                Real-time analytics of your agentic curation performance and data provisioning
                rewards.
              </p>
              <div className="h-1 w-48 bg-gradient-primary rounded-full shadow-[0_0_15px_rgba(173,198,255,0.4)]" />
            </div>
          </div>
        </header>

        {/* Not connected state */}
        {!connected ? (
          <div className="glass-card p-12 text-center text-on-surface-variant">
            Connect your wallet to see your contribution weight and rewards.
          </div>
        ) : (
          <>
            {/* Hero Metrics Grid */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-20">
              {/* Card 1: Total APT Earned */}
              <div className="glass-card p-10 rounded-2xl relative overflow-hidden group border-none">
                <div className="absolute -right-8 -top-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <span
                    className="material-symbols-outlined text-[160px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    account_balance_wallet
                  </span>
                </div>
                <h3 className="label-sm !text-on-surface-variant/60 mb-8">TOTAL_APT_EARNED</h3>
                <p className="text-5xl font-headline font-black text-gradient leading-none">
                  {earnings?.totalWeight ?? 0}
                </p>
                <div className="mt-6 flex items-center gap-2 text-tertiary label-sm !text-[10px] !normal-case">
                  <span className="material-symbols-outlined text-sm">trending_up</span>
                  <span>+12.4% THIS_CYLCE</span>
                </div>
              </div>

              {/* Card 2: Approved Contributions */}
              <div className="glass-card p-10 rounded-2xl relative overflow-hidden group border-none">
                <div className="absolute -right-8 -top-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <span
                    className="material-symbols-outlined text-[160px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    verified
                  </span>
                </div>
                <h3 className="label-sm !text-on-surface-variant/60 mb-8">VALIDATED_ASSETS</h3>
                <p className="text-5xl font-headline font-black text-on-surface leading-none tracking-tighter">
                  {earnings?.approvedContributions ?? 0}
                </p>
                <p className="mt-6 label-sm !text-[9px] !normal-case opacity-40">
                  Consensus_Validated
                </p>
              </div>

              {/* Card 3: Pending Rewards */}
              <div className="glass-card p-10 rounded-2xl relative overflow-hidden group border-none">
                <div className="absolute -right-8 -top-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <span
                    className="material-symbols-outlined text-[160px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    pending
                  </span>
                </div>
                <h3 className="label-sm !text-on-surface-variant/60 mb-8">PENDING_YIELD</h3>
                <p className="text-5xl font-headline font-black text-secondary leading-none tracking-tighter">
                  {receipts?.filter((r) => !r.distributed).length ?? 0}
                </p>
                <div className="mt-8 w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                  <div className="bg-secondary h-full w-[65%] shadow-[0_0_10px_rgba(221,183,255,0.5)]" />
                </div>
              </div>

              {/* Card 4: My Contributions */}
              <div className="glass-card p-10 rounded-2xl relative overflow-hidden group border-none">
                <div className="absolute -right-8 -top-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <span
                    className="material-symbols-outlined text-[160px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    monitoring
                  </span>
                </div>
                <h3 className="label-sm !text-on-surface-variant/60 mb-8">TOTAL_PROVISIONS</h3>
                <p className="text-5xl font-headline font-black text-on-surface leading-none tracking-tighter">
                  {myContributions?.length ?? 0}
                </p>
                <p className="mt-6 text-tertiary label-sm !text-[9px] !normal-case flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">verified_user</span>
                  SHELBY_SECURED
                </p>
              </div>
            </section>

            {/* Revenue Stream Table */}
            <section className="mb-24">
              <div className="flex items-center justify-between mb-10">
                <h2 className="font-headline text-3xl font-bold text-on-surface tracking-tight">
                  Revenue Stream{" "}
                  <span className="text-outline/40 font-light ml-2">/ Shelby_Micropayments</span>
                </h2>
                <div className="flex gap-3">
                  <span className="bg-primary/10 text-primary px-4 py-1.5 rounded-full label-sm !normal-case ghost-border">
                    LIVE_SYNC_ACTIVE
                  </span>
                </div>
              </div>

              {receiptsLoading ? (
                <div className="animate-pulse space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 glass-card rounded-xl" />
                  ))}
                </div>
              ) : receipts?.length === 0 ? (
                <div className="glass-card p-12 text-center text-on-surface-variant">
                  No data reads (receipts) recorded on-chain yet.
                </div>
              ) : (
                <div className="glass-card rounded-2xl overflow-hidden border-none shadow-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low/40">
                        <th className="px-10 py-6 label-sm !text-[10px] !opacity-40">TIMESTAMP</th>
                        <th className="px-10 py-6 label-sm !text-[10px] !opacity-40">
                          READER_ADDRESS
                        </th>
                        <th className="px-10 py-6 label-sm !text-[10px] !opacity-40">STATUS</th>
                        <th className="px-10 py-6 label-sm !text-[10px] !opacity-40 text-right">
                          AMOUNT (APT)
                        </th>
                        <th className="px-10 py-6 label-sm !text-[10px] !opacity-40 text-right">
                          ACTIONS
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/5">
                      {receipts?.map((r) => (
                        <tr
                          key={r.id}
                          className="hover:bg-surface-container-high/40 transition-colors cursor-default border-t border-outline-variant/5"
                        >
                          <td className="px-10 py-8 text-sm text-on-surface-variant font-light">
                            {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                          </td>
                          <td className="px-10 py-8 font-mono text-xs text-primary/80">
                            {r.readerAddress.slice(0, 12)}...{r.readerAddress.slice(-6)}
                          </td>
                          <td className="px-10 py-8">
                            <span
                              className={`px-3 py-1 rounded-full label-sm !text-[8px] !normal-case ghost-border ${r.distributed ? "!text-tertiary bg-tertiary/5" : "!text-primary bg-primary/5"}`}
                            >
                              {r.distributed ? "DISTRIBUTED" : "READ_ACCESS"}
                            </span>
                          </td>
                          <td className="px-10 py-8 text-right">
                            <div className="flex items-center justify-end gap-3 text-on-surface font-headline font-bold text-lg">
                              <span>{(r.amount / 100000000).toFixed(4)}</span>
                              <span className="material-symbols-outlined text-primary text-xl">
                                toll
                              </span>
                            </div>
                          </td>
                          <td className="px-10 py-8 text-right">
                            {!r.distributed && (
                              <button
                                type="button"
                                onClick={() => handleDistribute(r.id)}
                                disabled={distributeMutation.isPending}
                                className="px-6 py-2 bg-surface-container hover:bg-primary hover:text-surface rounded-xl label-sm !text-[9px] !normal-case transition-all disabled:opacity-20 ghost-border"
                              >
                                {distributeMutation.isPending ? "PROCESSING..." : "DISTRIBUTE"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Action Section: Claim Rewards */}
            <section className="flex flex-col items-center justify-center pt-16 pb-12">
              <div className="text-center mb-12 max-w-2xl">
                <h3 className="font-headline text-3xl font-black text-on-surface mb-4 tracking-tight">
                  SECURE_YOUR_YIELD
                </h3>
                <p className="text-xl text-on-surface-variant font-light leading-relaxed">
                  Withdraw your earned APT tokens directly to your connected wallet. Rewards are
                  instantly processed via the Neural Void smart contracts.
                </p>
              </div>
              <button className="relative group" type="button" onClick={handleClaimAll}>
                <div className="absolute -inset-2 bg-gradient-primary rounded-full blur-2xl opacity-20 group-hover:opacity-60 transition duration-1000 group-hover:duration-300" />
                <div className="relative flex items-center gap-6 bg-surface px-16 py-6 rounded-full ghost-border hover:bg-surface-bright transition-all active:scale-95 shadow-2xl">
                  <span
                    className="material-symbols-outlined text-primary text-2xl"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    payments
                  </span>
                  <span className="font-headline font-black text-xs uppercase tracking-[0.3em] text-on-surface">
                    CLAIM_ACCURED_REWARDS
                  </span>
                  <span className="material-symbols-outlined text-primary/40 group-hover:translate-x-2 transition-transform text-2xl">
                    north_east
                  </span>
                </div>
              </button>
              <p className="mt-10 label-sm !text-[9px] !normal-case opacity-30">
                Network_Gas_Estimated: 0.0001 APT
              </p>
            </section>
          </>
        )}
      </main>
    </>
  )
}
