import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { trpc } from "~/lib/trpc"
import { WalletButton } from "~/components/WalletButton"
import { signAndSubmitTx, buildCastVotePayload, type WalletAccount } from "~/lib/wallet"

export const Route = createFileRoute("/vote/")({
  component: VotePage,
})

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? ""

const DECISION_LABELS = {
  approve: { label: "Approve", value: 0 as const, color: "bg-green-600 hover:bg-green-500" },
  reject:  { label: "Reject",  value: 1 as const, color: "bg-red-600 hover:bg-red-500" },
  improve: { label: "Improve", value: 2 as const, color: "bg-yellow-600 hover:bg-yellow-500" },
}

function VotePage() {
  const [wallet, setWallet] = useState<WalletAccount | null>(null)
  const [voting, setVoting] = useState<string | null>(null) // contributionId being voted on
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [successIds, setSuccessIds] = useState<Set<string>>(new Set())
  const [errorMap, setErrorMap] = useState<Record<string, string>>({})

  const utils = trpc.useUtils()
  const { data: pending, isLoading } = trpc.contribution.list.useQuery({
    status: "pending",
    limit: 50,
  })
  const castMutation = trpc.vote.cast.useMutation()

  async function handleVote(
    contributionId: string,
    decision: "approve" | "reject" | "improve",
  ) {
    if (!wallet) return
    setVoting(contributionId)
    setErrorMap((p) => ({ ...p, [contributionId]: "" }))
    try {
      const payload = buildCastVotePayload(
        CONTRACT_ADDRESS,
        contributionId,
        DECISION_LABELS[decision].value,
      )
      const aptosTxHash = await signAndSubmitTx(payload)

      await castMutation.mutateAsync({
        contributionId,
        voterAddress: wallet.address,
        decision,
        reason: reasons[contributionId] || undefined,
        aptosTxHash,
      })

      setSuccessIds((p) => new Set([...p, contributionId]))
      utils.contribution.list.invalidate()
    } catch (e) {
      setErrorMap((p) => ({
        ...p,
        [contributionId]: e instanceof Error ? e.message : "Vote failed",
      }))
    } finally {
      setVoting(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold tracking-tight">🏛️ Quorum</Link>
        <WalletButton account={wallet} onConnect={setWallet} />
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Vote Queue</h1>
        <p className="text-gray-400 mb-8">
          Review pending contributions. Votes are weighted by your curation history.
          48-hour window — approve, reject, or request improvements.
        </p>

        {!wallet && (
          <div className="rounded-xl border border-yellow-800 bg-yellow-900/20 p-4 mb-6 text-sm text-yellow-300">
            Connect your wallet to cast votes.
          </div>
        )}

        {isLoading && (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-gray-800/50 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && !pending?.length && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-2xl mb-2">🎉</p>
            <p>No pending contributions. Queue is clear!</p>
          </div>
        )}

        <div className="space-y-4">
          {pending?.map((c) => {
            const done = successIds.has(c.id)
            return (
              <div
                key={c.id}
                className={`rounded-xl border p-5 transition-all ${
                  done
                    ? "border-green-800 bg-green-900/10 opacity-60"
                    : "border-gray-800 bg-gray-900"
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 font-mono truncate">ID: {c.id}</p>
                    <p className="text-sm text-gray-400 mt-0.5 truncate">
                      By: <span className="font-mono">{c.contributorAddress.slice(0, 10)}…</span>
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-yellow-900/40 border border-yellow-700 px-2 py-0.5 text-xs text-yellow-400">
                    pending
                  </span>
                </div>

                <div className="rounded-lg bg-gray-800/50 px-3 py-2 mb-3 text-xs font-mono text-gray-400 truncate">
                  {c.shelbyAccount}/{c.shelbyBlobName}
                </div>

                {!done && (
                  <>
                    <input
                      type="text"
                      placeholder="Optional reason…"
                      value={reasons[c.id] ?? ""}
                      onChange={(e) =>
                        setReasons((p) => ({ ...p, [c.id]: e.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm mb-3 focus:border-indigo-500 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      {(Object.entries(DECISION_LABELS) as [keyof typeof DECISION_LABELS, typeof DECISION_LABELS[keyof typeof DECISION_LABELS]][]).map(
                        ([key, d]) => (
                          <button
                            key={key}
                            onClick={() => handleVote(c.id, key)}
                            disabled={!wallet || voting === c.id}
                            className={`flex-1 rounded-lg py-1.5 text-sm font-medium text-white disabled:opacity-50 transition-colors ${d.color}`}
                          >
                            {voting === c.id ? "Signing…" : d.label}
                          </button>
                        ),
                      )}
                    </div>
                  </>
                )}

                {done && (
                  <p className="text-sm text-green-400 mt-2">✓ Vote submitted</p>
                )}

                {errorMap[c.id] && (
                  <p className="text-xs text-red-400 mt-2">{errorMap[c.id]}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
