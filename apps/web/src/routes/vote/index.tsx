import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk"
import { useWallet } from "@aptos-labs/wallet-adapter-react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
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
        data: payload as {
          function: `${string}::${string}::${string}`
          functionArguments: unknown[]
        },
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
        data: payload as {
          function: `${string}::${string}::${string}`
          functionArguments: unknown[]
        },
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
        data: payload as {
          function: `${string}::${string}::${string}`
          functionArguments: unknown[]
        },
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
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-8">Curation Queue</h1>

      {!isMember && connected && (
        <div className="mb-8 p-6 bg-teal-900/30 border border-teal-800 rounded-2xl flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-teal-400">Join the DAO to Vote</h3>
            <p className="text-sm text-neutral-400">
              You need to register as a member before curating datasets.
            </p>
          </div>
          <button
            type="button"
            onClick={handleJoinDAO}
            disabled={isJoining || isMember === null}
            className="px-6 py-3 bg-teal-600 hover:bg-teal-500 rounded-xl font-bold transition-all disabled:opacity-50"
          >
            {isJoining ? "Joining..." : "Join DAO Now"}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-neutral-900 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {pending?.length === 0 ? (
            <div className="p-12 text-center text-neutral-500 border border-neutral-800 border-dashed rounded-2xl">
              No contributions pending approval.
            </div>
          ) : (
            pending?.map((c) => {
              // 48 hours = 48 * 60 * 60 * 1000 = 172800000 ms
              const isExpired = Date.now() > new Date(c.createdAt).getTime() + 172800000

              return (
                <div
                  key={c.id}
                  className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 flex flex-col"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-xs font-mono text-indigo-400 mb-1">{c.id}</p>
                      <p className="text-sm text-neutral-500">
                        Contributor: {c.contributorAddress.slice(0, 10)}...
                      </p>
                      <p className="text-xs text-neutral-600 mt-1">
                        Submitted: {new Date(c.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {isExpired ? (
                        <button
                          onClick={() => handleFinalize(c.id)}
                          type="button"
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-bold shadow-[0_0_15px_rgba(79,70,229,0.3)]"
                        >
                          Finalize (Time is Up)
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleVote(c.id, "approve")}
                            type="button"
                            disabled={
                              !isMember ||
                              c.contributorAddress === account?.address?.toString() ||
                              votedIds.has(c.id)
                            }
                            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              votedIds.has(c.id)
                                ? "Bu katkıya zaten oy verdiniz"
                                : c.contributorAddress === account?.address?.toString()
                                  ? "Kendi katkınıza oy veremezsiniz"
                                  : ""
                            }
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleVote(c.id, "reject")}
                            type="button"
                            disabled={
                              !isMember ||
                              c.contributorAddress === account?.address?.toString() ||
                              votedIds.has(c.id)
                            }
                            className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              votedIds.has(c.id)
                                ? "Bu katkıya zaten oy verdiniz"
                                : c.contributorAddress === account?.address?.toString()
                                  ? "Kendi katkınıza oy veremezsiniz"
                                  : ""
                            }
                          >
                            Reject
                          </button>
                          {votedIds.has(c.id) && (
                            <span
                              className={`px-3 py-2 rounded-lg text-sm font-bold ${
                                myVotes.get(c.id) === "approve"
                                  ? "bg-teal-900 text-teal-300"
                                  : myVotes.get(c.id) === "reject"
                                    ? "bg-red-900 text-red-300"
                                    : "bg-neutral-700 text-neutral-300"
                              }`}
                            >
                              {myVotes.get(c.id) === "approve"
                                ? "✓ Onayladınız"
                                : myVotes.get(c.id) === "reject"
                                  ? "✗ Reddettiniz"
                                  : "Oyladınız"}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <ContributionPreview id={c.id} />
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
