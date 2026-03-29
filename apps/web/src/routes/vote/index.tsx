import { Aptos, AptosConfig, type InputEntryFunctionData, Network } from "@aptos-labs/ts-sdk"
import { useWallet } from "@aptos-labs/wallet-adapter-react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { orpc } from "../../utils/orpc"

export const Route = createFileRoute("/vote/")({
  component: VotePage,
})

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS
const NODE_URL = import.meta.env.VITE_APTOS_NODE_URL

const aptos = new Aptos(
  new AptosConfig({
    network: NODE_URL?.includes("testnet") ? Network.TESTNET : Network.DEVNET,
    fullnode: NODE_URL,
  }),
)

function ContributionPreview({ id }: { id: string }) {
  const { data, isLoading, isError } = useQuery(
    orpc.contribution.getContent.queryOptions({ input: { id } }),
  )

  if (isLoading) {
    return (
      <div className="text-xs text-neutral-500 animate-pulse mt-4 p-4 bg-neutral-950 rounded-lg">
        Loading content from Shelby Protocol...
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="text-xs text-red-500 mt-4 p-4 bg-neutral-950 rounded-lg">
        Failed to load content from Shelby Protocol.
      </div>
    )
  }

  const { contentType, data: base64Data } = data
  const isImage = contentType.startsWith("image/")
  const isText =
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("javascript")

  let textContent = ""
  if (isText) {
    try {
      textContent = atob(base64Data)
      if (textContent.length > 800) textContent = `${textContent.slice(0, 800)}\n\n... (truncated)`
    } catch (_e) {
      textContent = "Failed to decode text content."
    }
  }

  return (
    <div className="mt-4 p-4 bg-neutral-950 rounded-lg border border-neutral-800/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
          Dataset Content Preview
        </span>
        <span className="text-[10px] font-mono text-neutral-600">{contentType}</span>
      </div>

      {isImage ? (
        <img
          src={`data:${contentType};base64,${base64Data}`}
          alt="Preview"
          className="max-h-64 object-contain rounded"
        />
      ) : isText ? (
        <pre className="text-xs text-neutral-400 font-mono whitespace-pre-wrap overflow-y-auto max-h-64 scrollbar-thin">
          {textContent}
        </pre>
      ) : (
        <div className="text-sm text-neutral-500 italic">
          Binary or unsupported preview format. (File is intact on Shelby)
        </div>
      )}
    </div>
  )
}

function VotePage() {
  const { connected, account, signAndSubmitTransaction } = useWallet()
  const {
    data: pending,
    isLoading,
    refetch,
  } = useQuery(
    orpc.contribution.list.queryOptions({
      input: { status: "pending" },
    }),
  )
  const castMutation = useMutation(orpc.vote.cast.mutationOptions())
  const { data: voteHistory } = useQuery(orpc.vote.listHistory.queryOptions())
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set())
  const [myVotes, setMyVotes] = useState<Map<string, string>>(new Map())

  // Sayfa yüklenince mevcut oyları yükle
  const addrStr = account?.address?.toString()
  useEffect(() => {
    if (!voteHistory || !addrStr) return
    const myVoteList = voteHistory.filter((v) => v.voterAddress === addrStr)
    setVotedIds(new Set(myVoteList.map((v) => v.contributionId)))
    setMyVotes(new Map(myVoteList.map((v) => [v.contributionId, v.decision])))
  }, [voteHistory, addrStr])

  const [isMember, setIsMember] = useState<boolean | null>(null)
  const [isJoining, setIsJoining] = useState(false)

  // Check membership
  useEffect(() => {
    async function checkMembership() {
      if (!account?.address) return
      try {
        const resource = await aptos.getAccountResource({
          accountAddress: account.address.toString(),
          resourceType: `${CONTRACT_ADDRESS}::dao_governance::Member`,
        })
        setIsMember(!!resource)
      } catch (e: unknown) {
        const error = e as { status?: number; message?: string }
        if (error?.status === 404 || error?.message?.includes("Resource not found")) {
          setIsMember(false)
        } else {
          console.error("Failed to check membership", e)
        }
      }
    }
    checkMembership()
  }, [account?.address?.toString(), isJoining])

  async function handleJoinDAO() {
    if (!connected || !account) return
    setIsJoining(true)
    try {
      const payload = {
        function: `${CONTRACT_ADDRESS}::dao_governance::register_member`,
        functionArguments: [],
      }
      const result = await signAndSubmitTransaction({
        data: payload as InputEntryFunctionData,
      })
      await aptos.waitForTransaction({ transactionHash: result.hash })
      setIsMember(true)
      toast.success("Successfully joined the DAO!")
    } catch (e: unknown) {
      console.error(e)
      toast.error((e as Error).message || "Failed to join DAO")
    } finally {
      setIsJoining(false)
    }
  }

  async function handleVote(contributionId: string, decision: "approve" | "reject" | "improve") {
    if (!connected || !account) return

    if (!isMember) {
      toast.error("Oy vermek için önce DAO'ya katılmalısınız.")
      return
    }

    if (votedIds.has(contributionId)) {
      toast.error("Bu katkıya zaten oy verdiniz.")
      return
    }

    try {
      const decisionValue = decision === "approve" ? 0 : decision === "reject" ? 1 : 2
      const payload = {
        function: `${CONTRACT_ADDRESS}::dao_governance::cast_vote`,
        functionArguments: [
          CONTRACT_ADDRESS,
          Array.from(new TextEncoder().encode(contributionId)),
          decisionValue,
        ],
      }

      const result = await signAndSubmitTransaction({
        data: payload as InputEntryFunctionData,
      })
      await aptos.waitForTransaction({ transactionHash: result.hash })

      await castMutation.mutateAsync({
        contributionId,
        voterAddress: account.address.toString(),
        decision,
        aptosTxHash: result.hash,
      })

      setVotedIds((prev) => new Set(prev).add(contributionId))
      toast.success(`Oy verildi: ${decision}`)
      refetch()
    } catch (e: unknown) {
      console.error("Vote Error:", e)
      const msg = (e as Error).message || String(e) || ""

      if (msg.includes("E_ALREADY_VOTED")) {
        toast.error("Bu katkıya zaten oy verdiniz.")
      } else if (msg.includes("E_NOT_MEMBER")) {
        toast.error("Oy vermek için önce DAO'ya katılmalısınız.")
      } else if (msg.includes("E_VOTING_CLOSED")) {
        toast.error("Bu katkı için oylama süresi kapandı.")
      } else if (msg.includes("E_ALREADY_FINALIZED")) {
        toast.error("Bu katkı zaten sonuçlandırıldı.")
      } else {
        toast.error(`Oy verilemedi: ${msg.slice(0, 80) || "Bilinmeyen hata"}`)
      }
    }
  }

  async function handleFinalize(contributionId: string) {
    if (!connected || !account) return

    try {
      const payload = {
        function: `${CONTRACT_ADDRESS}::dao_governance::finalize_contribution`,
        functionArguments: [CONTRACT_ADDRESS, Array.from(new TextEncoder().encode(contributionId))],
      }

      const result = await signAndSubmitTransaction({
        data: payload as InputEntryFunctionData,
      })
      await aptos.waitForTransaction({ transactionHash: result.hash })

      toast.success("Contribution finalized on-chain!")
      refetch()
    } catch (e: unknown) {
      console.error("Finalize Error:", e)
      const errorMsg = (e as Error).message || ""

      if (errorMsg.includes("0x5")) {
        toast.error("This contribution is already finalized.")
      } else if (errorMsg.includes("0x6")) {
        toast.error("Voting is still open. 48 hours have not passed yet.")
      } else {
        toast.error(`Finalize failed: ${errorMsg.slice(0, 50) || "Unknown error"}`)
      }
    }
  }

  return (
    <>
      <div className="flex mt-20" style={{ height: "calc(100vh - 80px)", overflow: "hidden" }}>
        {/* Left Sidebar */}
        <aside className="w-80 shrink-0 border-r border-outline-variant/10 bg-surface-container-lowest/40 backdrop-blur-3xl flex flex-col">
          <div className="p-10">
            <div className="text-xl font-headline font-black tracking-[0.2em] text-on-surface mb-10">
              <span className="text-gradient">NEURAL</span>_DAO
            </div>

            {/* Profile card */}
            <div className="mb-12 p-6 rounded-2xl glass-card border-none">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl ghost-border bg-surface-container flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-xl">person</span>
                </div>
                <div className="min-w-0">
                  <div className="label-sm !text-[8px] opacity-60">OPERATOR_NODE</div>
                  <div className="text-sm font-headline font-bold text-on-surface truncate">
                    {account ? `${account.address.toString().slice(0, 8)}...` : "NOT_CONNECTED"}
                  </div>
                </div>
              </div>
              {isMember && (
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="label-sm !text-[9px] !text-primary !normal-case">
                    DAO_MEMBER_ACTIVE
                  </span>
                </div>
              )}
            </div>

            {/* Nav links */}
            <nav className="space-y-2">
              <Link
                to="/"
                className="flex items-center gap-4 px-6 py-4 text-on-surface-variant hover:text-on-surface transition-all hover:bg-surface-container/50 rounded-xl group"
              >
                <span className="material-symbols-outlined text-xl group-hover:text-primary transition-colors">
                  dashboard
                </span>
                <span className="label-sm !normal-case opacity-80">Dashboard</span>
              </Link>
              <div className="flex items-center gap-4 px-6 py-4 bg-primary/10 text-primary border-r-2 border-primary rounded-r-none rounded-l-xl font-bold cursor-default">
                <span className="material-symbols-outlined text-xl">fact_check</span>
                <span className="label-sm !normal-case tracking-normal">Review Queue</span>
              </div>
              <Link
                to="/datasets"
                className="flex items-center gap-4 px-6 py-4 text-on-surface-variant hover:text-on-surface transition-all hover:bg-surface-container/50 rounded-xl group"
              >
                <span className="material-symbols-outlined text-xl group-hover:text-tertiary transition-colors">
                  inventory_2
                </span>
                <span className="label-sm !normal-case opacity-80">Data Archives</span>
              </Link>
              <Link
                to="/governance"
                className="flex items-center gap-4 px-6 py-4 text-on-surface-variant hover:text-on-surface transition-all hover:bg-surface-container/50 rounded-xl group"
              >
                <span className="material-symbols-outlined text-xl group-hover:text-secondary transition-colors">
                  hub
                </span>
                <span className="label-sm !normal-case opacity-80">Governance</span>
              </Link>
            </nav>
          </div>

          {/* Bottom of sidebar */}
          <div className="mt-auto p-10 space-y-6">
            {!isMember && connected && (
              <button
                onClick={handleJoinDAO}
                disabled={isJoining || isMember === null}
                type="button"
                className="w-full py-4 bg-primary text-surface font-headline font-black text-xs tracking-widest uppercase hover:scale-[1.02] shadow-xl shadow-primary/20 transition-all rounded-xl disabled:opacity-50"
              >
                {isJoining ? "JOINING..." : "JOIN_DAO"}
              </button>
            )}
            <button
              type="button"
              onClick={() => toast.info("Proposal submission coming soon")}
              className="w-full py-4 bg-surface-container-high text-on-surface font-headline font-black text-xs tracking-widest uppercase ghost-border hover:bg-surface-bright transition-all rounded-xl active:scale-95"
            >
              SUBMIT_PROPOSAL
            </button>
            <div className="flex justify-between items-center px-2">
              <Link to="/governance">
                <span className="material-symbols-outlined text-slate-500 hover:text-primary cursor-pointer">
                  settings
                </span>
              </Link>
              <button
                type="button"
                className="material-symbols-outlined text-slate-500 hover:text-primary cursor-pointer bg-transparent border-none p-0"
                onClick={() => toast.info("Terminal console coming soon")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    toast.info("Terminal console coming soon")
                  }
                }}
              >
                terminal
              </button>
            </div>
          </div>
        </aside>

        {/* Center Column: Review Queue */}
        <div className="flex-1 p-10 overflow-y-auto">
          <div className="max-w-3xl mx-auto space-y-8">
            {/* Section Header */}
            <div className="flex justify-between items-end mb-12">
              <div className="max-w-xl">
                <h1 className="display-lg text-on-surface mb-6">
                  NEURAL <span className="text-gradient">REVIEW</span>
                </h1>
                <p className="text-xl text-on-surface-variant font-light leading-relaxed">
                  Synthesizing raw data contributions for protocol validation.
                </p>
              </div>
              <div className="flex gap-3">
                <span className="px-4 py-1.5 rounded-full bg-primary/10 text-primary label-sm !normal-case ghost-border">
                  {pending?.length ?? 0} PENDING_TASKS
                </span>
              </div>
            </div>

            {/* Loading state */}
            {isLoading && (
              <div className="animate-pulse space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-64 bg-surface-container rounded-xl" />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isLoading && pending?.length === 0 && (
              <div className="glass-card rounded-xl p-16 text-center text-on-surface-variant border border-outline-variant/20">
                No contributions pending review.
              </div>
            )}

            {/* Next Tasks */}
            {pending && pending.length > 1 && (
              <div className="grid grid-cols-2 gap-8">
                {pending.slice(1, 4).map((c, i) => (
                  <div
                    key={c.id}
                    className="p-8 rounded-2xl glass-card flex items-center gap-6 hover:-translate-y-1 transition-all cursor-pointer border-none"
                  >
                    <div className="text-4xl font-headline font-black text-outline/20">
                      {String(i + 2).padStart(2, "0")}
                    </div>
                    <div className="min-w-0">
                      <div className="label-sm !text-[8px] opacity-40">NEXT_IN_QUEUE</div>
                      <div className="text-sm font-bold text-on-surface truncate tracking-tight">
                        ID: {c.id.slice(0, 16)}...
                      </div>
                    </div>
                    <span className="material-symbols-outlined ml-auto text-outline/40 shrink-0">
                      arrow_forward
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Contribution cards */}
            {pending?.map((c) => {
              const isExpired = Date.now() > new Date(c.createdAt).getTime() + 172800000
              return (
                <div
                  key={c.id}
                  className="glass-card rounded-2xl p-10 relative overflow-hidden border-none"
                >
                  {/* Background glow */}
                  <div className="absolute -top-24 -right-24 w-80 h-80 bg-primary/5 rounded-full blur-[80px]" />

                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-10 relative z-10">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-surface-container rounded-2xl flex items-center justify-center ghost-border shadow-xl">
                        <span className="material-symbols-outlined text-2xl text-primary">
                          data_object
                        </span>
                      </div>
                      <div>
                        <h3 className="font-headline font-black text-2xl text-on-surface tracking-tighter">
                          CNTRB_{c.id.slice(0, 6)}
                        </h3>
                        <div className="flex items-center gap-3 mt-1 underline-offset-4">
                          <span className="label-sm !text-[9px] !normal-case opacity-40">
                            Submitted {new Date(c.createdAt).toLocaleDateString()}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-outline/20" />
                          <span className="label-sm !text-[9px] !normal-case opacity-40">
                            by {c.contributorAddress.slice(0, 10)}...
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Trust indicator circle (SVG) */}
                    <div className="relative w-20 h-20 flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90">
                        <title>Trust indicator percentage circle</title>
                        <circle
                          className="text-surface-container-highest"
                          cx="40"
                          cy="40"
                          fill="transparent"
                          r="34"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <circle
                          className="text-tertiary"
                          cx="40"
                          cy="40"
                          fill="transparent"
                          r="34"
                          stroke="currentColor"
                          strokeDasharray="213.6"
                          strokeDashoffset="68.3"
                          strokeWidth="4"
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center">
                        <span className="text-xl font-headline font-black text-on-surface leading-none">
                          68%
                        </span>
                        <span className="label-sm !text-[7px] mt-1 opacity-40">PROBABILITY</span>
                      </div>
                    </div>
                  </div>

                  {/* ContributionPreview component */}
                  <ContributionPreview id={c.id} />

                  {/* Action Buttons */}
                  {isExpired ? (
                    <div className="mt-10">
                      <button
                        onClick={() => handleFinalize(c.id)}
                        type="button"
                        className="w-full py-5 bg-gradient-primary text-surface rounded-2xl font-headline font-black uppercase tracking-[0.2em] shadow-lg shadow-primary/10 hover:scale-[1.02] transition-all"
                      >
                        FINALIZE_RECORDS
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-6 mt-10">
                      <button
                        onClick={() => handleVote(c.id, "approve")}
                        type="button"
                        disabled={
                          !isMember ||
                          c.contributorAddress === account?.address?.toString() ||
                          votedIds.has(c.id)
                        }
                        className="flex flex-col items-center justify-center gap-4 py-8 glass-card rounded-2xl hover:bg-green-500/10 transition-all group/btn disabled:opacity-20 border-none group"
                      >
                        <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                          <span
                            className="material-symbols-outlined text-green-400 text-3xl group-hover/btn:scale-110 transition-transform"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            verified
                          </span>
                        </div>
                        <span className="label-sm !text-green-300">
                          {votedIds.has(c.id) && myVotes.get(c.id) === "approve"
                            ? "✓ ACCEPTED"
                            : "APPROVE"}
                        </span>
                      </button>
                      <button
                        onClick={() => handleVote(c.id, "reject")}
                        type="button"
                        disabled={
                          !isMember ||
                          c.contributorAddress === account?.address?.toString() ||
                          votedIds.has(c.id)
                        }
                        className="flex flex-col items-center justify-center gap-4 py-8 glass-card rounded-2xl hover:bg-red-500/10 transition-all group/btn disabled:opacity-20 border-none group"
                      >
                        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                          <span className="material-symbols-outlined text-red-400 text-3xl group-hover/btn:scale-110 transition-transform">
                            block
                          </span>
                        </div>
                        <span className="label-sm !text-red-300">
                          {votedIds.has(c.id) && myVotes.get(c.id) === "reject"
                            ? "✗ REJECTED"
                            : "REJECT"}
                        </span>
                      </button>
                      <button
                        onClick={() => handleVote(c.id, "improve")}
                        type="button"
                        disabled={
                          !isMember ||
                          c.contributorAddress === account?.address?.toString() ||
                          votedIds.has(c.id)
                        }
                        className="flex flex-col items-center justify-center gap-4 py-8 glass-card rounded-2xl hover:bg-yellow-500/10 transition-all group/btn disabled:opacity-20 border-none group"
                      >
                        <div className="w-14 h-14 rounded-full bg-yellow-500/10 flex items-center justify-center group-hover:bg-yellow-500/20 transition-colors">
                          <span className="material-symbols-outlined text-yellow-400 text-3xl group-hover/btn:scale-110 transition-transform">
                            auto_fix_high
                          </span>
                        </div>
                        <span className="label-sm !text-yellow-300 underline underline-offset-4">
                          IMPROVE
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Column: Polls & Stats */}
        <div className="w-96 shrink-0 border-l border-outline-variant/10 bg-surface-container-lowest/20 backdrop-blur-3xl p-10 flex flex-col gap-10 overflow-y-auto">
          <div>
            <h4 className="label-sm text-tertiary mb-10">Active_Governance_Polls</h4>
            <div className="space-y-6">
              {/* Poll 1 */}
              <button
                type="button"
                className="w-full text-left space-y-3 cursor-pointer group bg-transparent border-none p-0"
                onClick={() =>
                  toast.info("DAO_TREASURY_REBALANCE_Q3 — on-chain voting coming soon", {
                    description: "Proposal #9021 · Quorum: 78% · Ends in 14h",
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    toast.info("DAO_TREASURY_REBALANCE_Q3 — on-chain voting coming soon", {
                      description: "Proposal #9021 · Quorum: 78% · Ends in 14h",
                    })
                  }
                }}
              >
                <div className="flex justify-between items-start">
                  <span className="text-sm font-headline font-bold text-on-surface leading-tight group-hover:text-primary transition-colors tracking-tight">
                    DAO_TREASURY_REBALANCE_Q3
                  </span>
                  <span className="text-[10px] font-mono text-outline/40">#9021</span>
                </div>
                <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full bg-primary w-[78%] shadow-[0_0_10px_rgba(173,198,255,0.5)]" />
                </div>
                <div className="flex justify-between">
                  <span className="label-sm !text-[8px] !normal-case opacity-60">QUORUM: 78%</span>
                  <span className="label-sm !text-[8px] !normal-case opacity-60">ENDS_IN: 14H</span>
                </div>
              </button>
              {/* Poll 2 */}
              <button
                type="button"
                className="w-full text-left space-y-3 cursor-pointer group bg-transparent border-none p-0"
                onClick={() =>
                  toast.info("ADOPT_NEW_CURATION_ALGO_V2.1 — on-chain voting coming soon", {
                    description: "Proposal #9022 · Quorum: 32% · Ends in 2d",
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    toast.info("ADOPT_NEW_CURATION_ALGO_V2.1 — on-chain voting coming soon", {
                      description: "Proposal #9022 · Quorum: 32% · Ends in 2d",
                    })
                  }
                }}
              >
                <div className="flex justify-between items-start">
                  <span className="text-xs font-headline font-medium text-on-surface leading-tight group-hover:text-primary transition-colors">
                    ADOPT_NEW_CURATION_ALGO_V2.1
                  </span>
                  <span className="text-[9px] font-mono text-outline">#9022</span>
                </div>
                <div className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                  <div className="h-full bg-tertiary w-[32%]" />
                </div>
                <div className="flex justify-between text-[10px] text-on-surface-variant">
                  <span>Quorum: 32%</span>
                  <span>Ends in 2d</span>
                </div>
              </button>
            </div>
          </div>

          {/* DAO Synopsis */}
          <div className="mt-auto glass-card rounded-2xl p-8 space-y-8 border-none">
            <div className="label-sm text-primary">DAO_SYNOPSIS</div>
            <div className="space-y-6">
              <div>
                <div className="label-sm !text-[8px] !normal-case opacity-40 mb-2">
                  Total_Staked_VP
                </div>
                <div className="text-3xl font-headline font-black text-on-surface tracking-tighter">
                  1.28M <span className="text-sm font-normal text-primary/40">VP</span>
                </div>
              </div>
              <div>
                <div className="label-sm !text-[8px] !normal-case opacity-40 mb-2">
                  Active_Curators
                </div>
                <div className="text-3xl font-headline font-black text-on-surface tracking-tighter">
                  4,812 <span className="text-sm font-normal text-tertiary/40">NODE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating help button */}
      <div className="fixed bottom-10 right-10 z-50">
        <button
          type="button"
          onClick={() => toast.info("Help documentation coming soon")}
          className="w-12 h-12 bg-surface-container-high hover:bg-surface-bright text-primary rounded-full flex items-center justify-center border border-primary/20 transition-all shadow-xl"
        >
          <span className="material-symbols-outlined">help_outline</span>
        </button>
      </div>
    </>
  )
}
