import { useWallet } from "@aptos-labs/wallet-adapter-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { orpc } from "../../utils/orpc"

export const Route = createFileRoute("/daos/$slug")({
  component: DaoDetailPage,
  validateSearch: (search: Record<string, unknown>): { onboarding?: "1" } => ({
    ...(search.onboarding === "1" ? { onboarding: "1" as const } : {}),
  }),
})

function DaoDetailPage() {
  const { slug } = Route.useParams()
  const { onboarding } = Route.useSearch()
  const { connected, account } = useWallet()
  const queryClient = useQueryClient()
  const [showOnboarding, setShowOnboarding] = useState(!!onboarding)

  const { data: dao, isLoading: daoLoading } = useQuery(
    orpc.dao.get.queryOptions({ input: { slugOrId: slug } }),
  )

  const { data: stats } = useQuery({
    ...orpc.dao.getStats.queryOptions({ input: { daoId: dao?.id ?? "" } }),
    enabled: !!dao?.id,
  })

  const { data: membership } = useQuery({
    ...orpc.dao.getMembership.queryOptions({
      input: {
        daoId: dao?.id ?? "",
        memberAddress: account?.address?.toString() ?? "",
      },
    }),
    enabled: !!dao?.id && !!account?.address,
  })

  const { data: members } = useQuery({
    ...orpc.dao.listMembers.queryOptions({ input: { daoId: dao?.id ?? "" } }),
    enabled: !!dao?.id,
  })

  const { data: datasets } = useQuery({
    ...orpc.dataset.list.queryOptions({ input: { daoId: dao?.id ?? "" } }),
    enabled: !!dao?.id,
  })

  const joinMutation = useMutation(orpc.dao.join.mutationOptions())
  const createDatasetMutation = useMutation(orpc.dataset.create.mutationOptions())
  const createProposalMutation = useMutation(orpc.proposal.create.mutationOptions())
  const voteProposalMutation = useMutation(orpc.proposal.vote.mutationOptions())
  const pushToHubMutation = useMutation(orpc.dataset.pushToHub.mutationOptions())

  const [showDatasetForm, setShowDatasetForm] = useState(false)
  const [datasetName, setDatasetName] = useState("")
  const [datasetDesc, setDatasetDesc] = useState("")
  const [pushingDatasetId, setPushingDatasetId] = useState<string | null>(null)
  const [hfRepoInput, setHfRepoInput] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<"overview" | "datasets" | "members" | "governance">(
    "overview",
  )
  const [showProposalForm, setShowProposalForm] = useState(false)
  const [proposalTitle, setProposalTitle] = useState("")
  const [proposalDescription, setProposalDescription] = useState("")
  const [proposalType, setProposalType] = useState<0 | 1 | 2>(2)
  // ParameterChange payload fields
  const [newQuorumThreshold, setNewQuorumThreshold] = useState("")
  const [newVotingWindowH, setNewVotingWindowH] = useState("")

  // Proposals for this DAO
  const { data: proposalList } = useQuery({
    ...orpc.proposal.list.queryOptions({ input: { daoId: dao?.id ?? "" } }),
    enabled: !!dao?.id,
  })

  const { data: proposalStats } = useQuery({
    ...orpc.proposal.getStats.queryOptions({ input: { daoId: dao?.id ?? "" } }),
    enabled: !!dao?.id,
  })

  const handleJoin = async () => {
    if (!dao || !account) return
    try {
      await joinMutation.mutateAsync({
        daoId: dao.id,
        memberAddress: account.address.toString(),
      })
      toast.success("Joined DAO successfully!")
      queryClient.invalidateQueries({
        queryKey: orpc.dao.getMembership.queryOptions({
          input: { daoId: dao.id, memberAddress: account.address.toString() },
        }).queryKey,
      })
      queryClient.invalidateQueries({
        queryKey: orpc.dao.listMembers.queryOptions({ input: { daoId: dao.id } }).queryKey,
      })
      queryClient.invalidateQueries({
        queryKey: orpc.dao.getStats.queryOptions({ input: { daoId: dao.id } }).queryKey,
      })
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to join DAO")
    }
  }

  const handleCreateDataset = async () => {
    if (!dao || !account || !datasetName.trim()) return
    try {
      await createDatasetMutation.mutateAsync({
        daoId: dao.id,
        name: datasetName.trim(),
        description: datasetDesc.trim() || undefined,
        ownerAddress: account.address.toString(),
      })
      toast.success("Dataset created!")
      setDatasetName("")
      setDatasetDesc("")
      setShowDatasetForm(false)
      queryClient.invalidateQueries({
        queryKey: orpc.dataset.list.queryOptions({ input: { daoId: dao.id } }).queryKey,
      })
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to create dataset")
    }
  }

  const handleCreateProposal = async () => {
    if (!dao || !account) return
    if (!proposalTitle.trim()) {
      toast.error("Title required")
      return
    }

    const payload: Record<string, unknown> = {}
    if (proposalType === 0) {
      if (newQuorumThreshold) payload.quorumThreshold = Number(newQuorumThreshold)
      if (newVotingWindowH) payload.votingWindowSeconds = Number(newVotingWindowH) * 3600
    }

    try {
      await createProposalMutation.mutateAsync({
        daoId: dao.id,
        proposerAddress: account.address.toString(),
        proposalType,
        title: proposalTitle.trim(),
        description: proposalDescription.trim(),
        payload,
      })
      toast.success("Proposal created!")
      setProposalTitle("")
      setProposalDescription("")
      setShowProposalForm(false)
      queryClient.invalidateQueries({
        queryKey: orpc.proposal.list.queryOptions({ input: { daoId: dao.id } }).queryKey,
      })
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to create proposal")
    }
  }

  const handleVoteProposal = async (proposalId: string, support: boolean) => {
    if (!account) {
      toast.error("Connect wallet to vote")
      return
    }
    // In production: sign & submit on-chain first, get tx hash, then call API
    const mockTxHash = "0x" + "0".repeat(64)
    try {
      await voteProposalMutation.mutateAsync({
        proposalId,
        voterAddress: account.address.toString(),
        support,
        aptosTxHash: mockTxHash,
      })
      toast.success(support ? "Voted: For" : "Voted: Against")
      queryClient.invalidateQueries({
        queryKey: orpc.proposal.list.queryOptions({ input: { daoId: dao?.id ?? "" } }).queryKey,
      })
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to vote")
    }
  }

  const handlePushToHub = async (datasetId: string) => {
    const repoId = hfRepoInput[datasetId]?.trim()
    if (!repoId) {
      toast.error("Enter HuggingFace repo ID (e.g. username/dataset-name)")
      return
    }
    if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(repoId)) {
      toast.error("Format: username/dataset-name")
      return
    }
    setPushingDatasetId(datasetId)
    try {
      const result = await pushToHubMutation.mutateAsync({ datasetId, repoId })
      toast.success(`Pushed to HuggingFace! ${result.recordCount} records → ${repoId}`)
      setHfRepoInput((prev) => ({ ...prev, [datasetId]: "" }))
    } catch (e: unknown) {
      toast.error((e as Error).message || "Push failed")
    } finally {
      setPushingDatasetId(null)
    }
  }

  if (daoLoading) {
    return (
      <div className="min-h-screen pt-28 flex justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    )
  }

  if (!dao) {
    return (
      <div className="min-h-screen pt-28 text-center">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-4 block">
          error
        </span>
        <p className="text-on-surface-variant/60">DAO not found</p>
        <Link to="/daos" className="text-primary text-sm mt-4 inline-block hover:underline">
          Back to DAOs
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-28 pb-20 px-6 font-['Inter']">
      <div className="max-w-[1200px] mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-on-surface-variant/50 mb-6">
          <Link to="/daos" className="hover:text-primary transition-colors">
            DAOs
          </Link>
          <span>/</span>
          <span className="text-on-surface-variant">{dao.name}</span>
        </div>

        {/* DAO Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-tertiary/30 flex items-center justify-center text-2xl font-bold text-on-surface flex-shrink-0">
              {dao.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-headline font-bold text-on-surface tracking-tight">
                {dao.name}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm font-mono text-on-surface-variant/50">/{dao.slug}</span>
                <span className="text-xs text-on-surface-variant/40">
                  Created {new Date(dao.createdAt).toLocaleDateString()}
                </span>
              </div>
              {dao.description && (
                <p className="text-sm text-on-surface-variant/70 mt-3 max-w-xl">
                  {dao.description}
                </p>
              )}
            </div>
          </div>

          {/* Join / Member badge */}
          <div className="flex items-center gap-3">
            {connected && membership ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-400 bg-teal-400/10 px-3 py-2 rounded-lg border border-teal-400/20">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                {membership.role === "owner"
                  ? "Owner"
                  : membership.role === "admin"
                    ? "Admin"
                    : "Member"}
              </span>
            ) : connected ? (
              <button
                type="button"
                onClick={handleJoin}
                disabled={joinMutation.isPending}
                className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {joinMutation.isPending ? "Joining..." : "Join DAO"}
              </button>
            ) : null}
          </div>
        </div>

        {/* Onboarding Banner */}
        {showOnboarding && (
          <div className="mb-8 p-5 rounded-2xl border border-primary/30 bg-primary/5 relative">
            <button
              type="button"
              onClick={() => setShowOnboarding(false)}
              className="absolute top-4 right-4 material-symbols-outlined text-on-surface-variant/40 hover:text-on-surface-variant transition-colors bg-transparent border-none p-0 cursor-pointer"
            >
              close
            </button>
            <h3 className="text-base font-bold text-primary mb-2">🎉 Your DAO is live!</h3>
            <p className="text-sm text-on-surface-variant/70 mb-4">Get started in 3 steps:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  step: "1",
                  title: "Create a Dataset",
                  desc: "Go to the Datasets tab and create your first AI training dataset",
                  tab: "datasets",
                },
                {
                  step: "2",
                  title: "Invite Members",
                  desc: "Share your DAO link so contributors can join and start submitting data",
                  tab: "members",
                },
                {
                  step: "3",
                  title: "Create a Proposal",
                  desc: "Use the Governance tab to set up voting rules for your community",
                  tab: "governance",
                },
              ].map((s) => (
                <button
                  key={s.step}
                  type="button"
                  onClick={() => {
                    setActiveTab(s.tab as typeof activeTab)
                    setShowOnboarding(false)
                  }}
                  className="p-4 rounded-xl bg-surface-container/50 border border-outline-variant/15 text-left hover:border-primary/30 hover:bg-surface-container transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-black flex items-center justify-center">
                      {s.step}
                    </span>
                    <span className="text-sm font-bold text-on-surface">{s.title}</span>
                  </div>
                  <p className="text-xs text-on-surface-variant/60">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Members", value: stats?.totalMembers ?? 0, icon: "group" },
            { label: "Datasets", value: stats?.totalDatasets ?? 0, icon: "database" },
            {
              label: "Contributions",
              value: stats?.totalContributions ?? 0,
              icon: "upload_file",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="p-4 rounded-xl border border-outline-variant/15 bg-surface-container/40 text-center"
            >
              <span className="material-symbols-outlined text-primary/60 text-xl mb-1 block">
                {s.icon}
              </span>
              <div className="text-2xl font-bold text-on-surface">{s.value}</div>
              <div className="text-xs text-on-surface-variant/50 uppercase tracking-wider">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-8 border-b border-outline-variant/15">
          {(["overview", "datasets", "members", "governance"] as const).map((tab) => (
            <button
              type="button"
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-bold capitalize transition-colors border-b-2 ${
                activeTab === tab
                  ? "text-primary border-primary"
                  : "text-on-surface-variant/50 border-transparent hover:text-on-surface-variant"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Analytics row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: "Total Contributions",
                  value: stats?.totalContributions ?? 0,
                  icon: "upload_file",
                  color: "text-primary",
                },
                {
                  label: "Total Members",
                  value: stats?.totalMembers ?? 0,
                  icon: "group",
                  color: "text-secondary",
                },
                {
                  label: "Active Proposals",
                  value: proposalStats?.active ?? 0,
                  icon: "how_to_vote",
                  color: "text-tertiary",
                },
                {
                  label: "Datasets",
                  value: stats?.totalDatasets ?? 0,
                  icon: "database",
                  color: "text-teal-400",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="p-4 rounded-xl border border-outline-variant/15 bg-surface-container/40"
                >
                  <span className={`material-symbols-outlined ${s.color} text-xl mb-2 block`}>
                    {s.icon}
                  </span>
                  <div className="text-2xl font-bold text-on-surface">{s.value}</div>
                  <div className="text-xs text-on-surface-variant/50 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Recent Datasets */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-on-surface">Datasets</h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("datasets")}
                    className="text-xs text-primary hover:underline"
                  >
                    View all
                  </button>
                </div>
                {(datasets ?? []).length === 0 ? (
                  <p className="text-sm text-on-surface-variant/50">No datasets yet</p>
                ) : (
                  <div className="space-y-3">
                    {(datasets ?? []).slice(0, 5).map((ds) => (
                      <div
                        key={ds.id}
                        className="p-4 rounded-xl border border-outline-variant/15 bg-surface-container/30"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-on-surface">{ds.name}</span>
                          <span className="text-xs text-on-surface-variant/50">
                            {ds.contributionCount} contributions
                          </span>
                        </div>
                        {ds.description && (
                          <p className="text-xs text-on-surface-variant/60 mt-1 line-clamp-1">
                            {ds.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Proposals + Top Members */}
              <div className="space-y-6">
                {/* Active proposals */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-on-surface">Active Proposals</h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab("governance")}
                      className="text-xs text-primary hover:underline"
                    >
                      View all
                    </button>
                  </div>
                  {(proposalList ?? []).filter((p) => p.status === "active").length === 0 ? (
                    <p className="text-sm text-on-surface-variant/50">No active proposals</p>
                  ) : (
                    <div className="space-y-2">
                      {(proposalList ?? [])
                        .filter((p) => p.status === "active")
                        .slice(0, 3)
                        .map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between p-3 rounded-xl border border-outline-variant/10 bg-surface-container/20"
                          >
                            <span className="text-sm text-on-surface truncate flex-1">
                              {p.title}
                            </span>
                            <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded ml-2 whitespace-nowrap">
                              {p.totalPower} VP
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Top Members */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-on-surface">Top Members</h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab("members")}
                      className="text-xs text-primary hover:underline"
                    >
                      View all
                    </button>
                  </div>
                  {(members ?? []).length === 0 ? (
                    <p className="text-sm text-on-surface-variant/50">No members yet</p>
                  ) : (
                    <div className="space-y-2">
                      {(members ?? []).slice(0, 5).map((m, i) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-outline-variant/10 bg-surface-container/20"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-on-surface-variant/40 w-5">
                              #{i + 1}
                            </span>
                            <span className="text-sm font-mono text-on-surface">
                              {m.memberAddress.slice(0, 8)}...{m.memberAddress.slice(-4)}
                            </span>
                            {m.role !== "member" && (
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                {m.role}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-bold text-on-surface-variant/60">
                            VP: {m.votingPower}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "datasets" && (
          <div>
            {/* Create dataset button */}
            {connected && membership && (
              <div className="mb-6">
                {showDatasetForm ? (
                  <div className="p-5 rounded-2xl border border-outline-variant/20 bg-surface-container/60">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label
                          htmlFor="ds-name"
                          className="block text-xs font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider"
                        >
                          Dataset Name
                        </label>
                        <input
                          id="ds-name"
                          value={datasetName}
                          onChange={(e) => setDatasetName(e.target.value)}
                          placeholder="Medical Imaging Dataset"
                          className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none text-sm"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="ds-desc"
                          className="block text-xs font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider"
                        >
                          Description
                        </label>
                        <input
                          id="ds-desc"
                          value={datasetDesc}
                          onChange={(e) => setDatasetDesc(e.target.value)}
                          placeholder="High-quality labeled medical images..."
                          className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleCreateDataset}
                        disabled={createDatasetMutation.isPending}
                        className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold hover:shadow-lg transition-all disabled:opacity-50"
                      >
                        {createDatasetMutation.isPending ? "Creating..." : "Create Dataset"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDatasetForm(false)}
                        className="px-5 py-2.5 rounded-xl border border-outline-variant/20 text-on-surface-variant text-sm hover:bg-surface-container transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDatasetForm(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-outline-variant/20 text-on-surface-variant text-sm font-bold hover:bg-surface-container hover:border-primary/30 transition-all"
                  >
                    <span className="material-symbols-outlined text-base">add</span>
                    New Dataset
                  </button>
                )}
              </div>
            )}

            {/* Dataset list */}
            {(datasets ?? []).length === 0 ? (
              <div className="text-center py-16">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-4 block">
                  database
                </span>
                <p className="text-on-surface-variant/60 text-sm">
                  No datasets yet. Create the first one!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(datasets ?? []).map((ds) => (
                  <div
                    key={ds.id}
                    className="p-5 rounded-2xl border border-outline-variant/15 bg-surface-container/40 hover:border-primary/20 transition-all"
                  >
                    <h4 className="text-base font-bold text-on-surface mb-1">{ds.name}</h4>
                    {ds.description && (
                      <p className="text-xs text-on-surface-variant/60 mb-3 line-clamp-2">
                        {ds.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-on-surface-variant/50">
                      <span>{ds.contributionCount} contributions</span>
                      <span>Weight: {ds.totalWeight.toFixed(1)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        to="/contribute"
                        className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
                      >
                        Contribute
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(ds.id)
                          toast.success("Dataset ID copied")
                        }}
                        className="px-3 py-1.5 rounded-lg border border-outline-variant/20 text-on-surface-variant text-xs hover:bg-surface-container transition-colors"
                      >
                        Copy ID
                      </button>
                    </div>
                    {/* HuggingFace push */}
                    {connected && membership && (
                      <div className="mt-3 pt-3 border-t border-outline-variant/10">
                        <div className="flex gap-2">
                          <input
                            value={hfRepoInput[ds.id] ?? ""}
                            onChange={(e) =>
                              setHfRepoInput((prev) => ({
                                ...prev,
                                [ds.id]: e.target.value,
                              }))
                            }
                            placeholder="username/dataset-name"
                            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/30 text-xs font-mono focus:border-orange-400/50 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handlePushToHub(ds.id)}
                            disabled={pushingDatasetId === ds.id || !hfRepoInput[ds.id]?.trim()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-400/10 text-orange-400 text-xs font-bold hover:bg-orange-400/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            {pushingDatasetId === ds.id ? (
                              <span className="animate-spin material-symbols-outlined text-sm">
                                progress_activity
                              </span>
                            ) : (
                              <span className="material-symbols-outlined text-sm">upload</span>
                            )}
                            {pushingDatasetId === ds.id ? "Pushing..." : "Push to HF"}
                          </button>
                        </div>
                        <p className="text-[10px] text-on-surface-variant/30 mt-1">
                          Push approved contributions to HuggingFace Hub
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "members" && (
          <div>
            <div className="space-y-2">
              {(members ?? []).map((m, i) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-4 rounded-xl border border-outline-variant/10 bg-surface-container/20"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-on-surface-variant/40 w-6">
                      #{i + 1}
                    </span>
                    <div>
                      <span className="text-sm font-mono text-on-surface block">
                        {m.memberAddress.slice(0, 10)}...{m.memberAddress.slice(-6)}
                      </span>
                      <span className="text-xs text-on-surface-variant/40">
                        Joined {new Date(m.joinedAt).toLocaleDateString()}
                      </span>
                    </div>
                    {m.role !== "member" && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-primary/10 text-primary">
                        {m.role}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-6 text-xs text-on-surface-variant/60">
                    <div>
                      <span className="font-bold text-on-surface">{m.votingPower}</span> VP
                    </div>
                    <div>
                      <span className="font-bold text-on-surface">{m.approvedContributions}</span>/
                      {m.totalContributions}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "governance" && (
          <div>
            {/* DAO Settings Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              {[
                { label: "Quorum", value: `${dao.quorumThreshold}%` },
                { label: "Voting Window", value: `${Math.round(dao.votingWindowSeconds / 3600)}h` },
                { label: "Proposals", value: proposalStats?.total ?? 0 },
                { label: "Active", value: proposalStats?.active ?? 0 },
              ].map((s) => (
                <div
                  key={s.label}
                  className="p-4 rounded-xl border border-outline-variant/15 bg-surface-container/40 text-center"
                >
                  <div className="text-xl font-bold text-on-surface">{s.value}</div>
                  <div className="text-xs text-on-surface-variant/50 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Create proposal button */}
            {connected && membership && (
              <div className="mb-6">
                {showProposalForm ? (
                  <div className="p-5 rounded-2xl border border-outline-variant/20 bg-surface-container/60 space-y-4">
                    <h4 className="font-bold text-on-surface">New Proposal</h4>
                    {/* Type selector */}
                    <div className="flex gap-2">
                      {[
                        { value: 2, label: "Text" },
                        { value: 0, label: "Parameter Change" },
                        { value: 1, label: "Treasury Spend" },
                      ].map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setProposalType(t.value as 0 | 1 | 2)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            proposalType === t.value
                              ? "bg-primary text-on-primary"
                              : "border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    <div>
                      <label
                        htmlFor="proposal-title"
                        className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider"
                      >
                        Title
                      </label>
                      <input
                        id="proposal-title"
                        value={proposalTitle}
                        onChange={(e) => setProposalTitle(e.target.value)}
                        placeholder="Proposal title..."
                        className="w-full px-4 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:border-primary focus:outline-none text-sm"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="proposal-desc"
                        className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider"
                      >
                        Description
                      </label>
                      <textarea
                        id="proposal-desc"
                        value={proposalDescription}
                        onChange={(e) => setProposalDescription(e.target.value)}
                        placeholder="Describe the proposal..."
                        rows={3}
                        className="w-full px-4 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:border-primary focus:outline-none text-sm resize-none"
                      />
                    </div>

                    {proposalType === 0 && (
                      <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-surface-container/30 border border-primary/10">
                        <div>
                          <label
                            htmlFor="new-quorum"
                            className="block text-xs text-on-surface-variant mb-1"
                          >
                            New Quorum % (optional)
                          </label>
                          <input
                            id="new-quorum"
                            type="number"
                            min="1"
                            max="100"
                            value={newQuorumThreshold}
                            onChange={(e) => setNewQuorumThreshold(e.target.value)}
                            placeholder={String(dao.quorumThreshold)}
                            className="w-full px-3 py-2 rounded-lg bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm focus:border-primary focus:outline-none"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="new-window"
                            className="block text-xs text-on-surface-variant mb-1"
                          >
                            New Window Hours (optional)
                          </label>
                          <input
                            id="new-window"
                            type="number"
                            min="1"
                            value={newVotingWindowH}
                            onChange={(e) => setNewVotingWindowH(e.target.value)}
                            placeholder={String(Math.round(dao.votingWindowSeconds / 3600))}
                            className="w-full px-3 py-2 rounded-lg bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm focus:border-primary focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleCreateProposal}
                        disabled={createProposalMutation.isPending}
                        className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold hover:shadow-lg transition-all disabled:opacity-50"
                      >
                        {createProposalMutation.isPending ? "Submitting..." : "Submit Proposal"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowProposalForm(false)}
                        className="px-5 py-2.5 rounded-xl border border-outline-variant/20 text-on-surface-variant text-sm hover:bg-surface-container transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowProposalForm(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-outline-variant/20 text-on-surface-variant text-sm font-bold hover:bg-surface-container hover:border-primary/30 transition-all"
                  >
                    <span className="material-symbols-outlined text-base">add</span>
                    New Proposal
                  </button>
                )}
              </div>
            )}

            {/* Proposal List */}
            {(proposalList ?? []).length === 0 ? (
              <div className="text-center py-16">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-4 block">
                  how_to_vote
                </span>
                <p className="text-on-surface-variant/60 text-sm">
                  No proposals yet. DAO members can create proposals to change governance parameters
                  or allocate treasury funds.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {(proposalList ?? []).map((p) => {
                  const totalVP = p.totalPower
                  const yesPercent = totalVP > 0 ? Math.round((p.yesPower / totalVP) * 100) : 0
                  const isActive = p.status === "active" && new Date() <= new Date(p.votingDeadline)
                  const typeLabel =
                    p.proposalType === 0
                      ? "Parameter Change"
                      : p.proposalType === 1
                        ? "Treasury Spend"
                        : "Text"
                  const statusColors: Record<string, string> = {
                    active: "text-primary bg-primary/10",
                    passed: "text-teal-400 bg-teal-400/10",
                    rejected: "text-error bg-error/10",
                    executed: "text-secondary bg-secondary/10",
                  }

                  return (
                    <div
                      key={p.id}
                      className="p-5 rounded-2xl border border-outline-variant/15 bg-surface-container/40"
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${statusColors[p.status] ?? ""}`}
                            >
                              {p.status}
                            </span>
                            <span className="text-[10px] text-on-surface-variant/40 uppercase font-bold">
                              {typeLabel}
                            </span>
                          </div>
                          <h4 className="text-base font-bold text-on-surface">{p.title}</h4>
                          {p.description && (
                            <p className="text-xs text-on-surface-variant/60 mt-1 line-clamp-2">
                              {p.description}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs text-on-surface-variant/40">
                            {new Date(p.votingDeadline) > new Date()
                              ? `Ends ${new Date(p.votingDeadline).toLocaleDateString()}`
                              : `Ended ${new Date(p.votingDeadline).toLocaleDateString()}`}
                          </div>
                        </div>
                      </div>

                      {/* Vote bar */}
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-on-surface-variant/50 mb-1">
                          <span>For: {yesPercent}%</span>
                          <span>Against: {100 - yesPercent}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
                          <div
                            className="h-full rounded-full bg-teal-400 transition-all"
                            style={{ width: `${yesPercent}%` }}
                          />
                        </div>
                        <div className="text-xs text-on-surface-variant/40 mt-1">
                          {totalVP} total voting power
                        </div>
                      </div>

                      {/* Vote buttons */}
                      {isActive && connected && membership && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleVoteProposal(p.id, true)}
                            disabled={voteProposalMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-400/10 text-teal-400 text-xs font-bold hover:bg-teal-400/20 transition-colors disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-sm">thumb_up</span>
                            For
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVoteProposal(p.id, false)}
                            disabled={voteProposalMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-error/10 text-error text-xs font-bold hover:bg-error/20 transition-colors disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-sm">thumb_down</span>
                            Against
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
