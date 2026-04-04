import { useWallet } from "@aptos-labs/wallet-adapter-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { orpc } from "../../utils/orpc"

export const Route = createFileRoute("/daos/$slug")({
  component: DaoDetailPage,
})

function DaoDetailPage() {
  const { slug } = Route.useParams()
  const { connected, account } = useWallet()
  const queryClient = useQueryClient()

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

  const [showDatasetForm, setShowDatasetForm] = useState(false)
  const [datasetName, setDatasetName] = useState("")
  const [datasetDesc, setDatasetDesc] = useState("")
  const [activeTab, setActiveTab] = useState<"overview" | "datasets" | "members" | "governance">(
    "overview",
  )

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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Datasets */}
            <div>
              <h3 className="text-lg font-bold text-on-surface mb-4">Datasets</h3>
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

            {/* Members */}
            <div>
              <h3 className="text-lg font-bold text-on-surface mb-4">Top Members</h3>
              {(members ?? []).length === 0 ? (
                <p className="text-sm text-on-surface-variant/50">No members yet</p>
              ) : (
                <div className="space-y-2">
                  {(members ?? []).slice(0, 8).map((m, i) => (
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
                    <div className="mt-3 flex gap-2">
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
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-4 block">
              how_to_vote
            </span>
            <p className="text-on-surface-variant/60 text-sm mb-2">DAO governance settings</p>
            <div className="inline-flex flex-col gap-3 text-left p-6 rounded-2xl border border-outline-variant/15 bg-surface-container/30 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-on-surface-variant/50 w-40">Voting Window</span>
                <span className="font-bold text-on-surface">
                  {Math.round(dao.votingWindowSeconds / 3600)}h
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-on-surface-variant/50 w-40">Quorum Threshold</span>
                <span className="font-bold text-on-surface">{dao.quorumThreshold}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-on-surface-variant/50 w-40">Treasury</span>
                <span className="font-mono text-xs text-on-surface">
                  {dao.treasuryAddress.slice(0, 10)}...{dao.treasuryAddress.slice(-6)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-on-surface-variant/50 w-40">Owner</span>
                <span className="font-mono text-xs text-on-surface">
                  {dao.ownerAddress.slice(0, 10)}...{dao.ownerAddress.slice(-6)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
