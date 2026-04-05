import { useWallet } from "@aptos-labs/wallet-adapter-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { orpc } from "../../utils/orpc"

export const Route = createFileRoute("/daos/")({
  component: DaosPage,
})

function DaosPage() {
  const { connected, account } = useWallet()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: daos, isLoading } = useQuery(orpc.dao.list.queryOptions())
  const createMutation = useMutation(orpc.dao.create.mutationOptions())

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [search, setSearch] = useState("")

  const filtered = (daos ?? []).filter((d) => {
    if (search) {
      const q = search.toLowerCase()
      return d.name.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q)
    }
    return true
  })

  const handleCreate = async () => {
    if (!connected || !account) {
      toast.error("Connect your wallet to create a DAO")
      return
    }
    if (!name.trim()) {
      toast.error("DAO name is required")
      return
    }
    try {
      const result = await createMutation.mutateAsync({
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        ownerAddress: account.address.toString(),
        treasuryAddress: account.address.toString(),
      })
      toast.success(`DAO created! Let's set it up.`)
      setName("")
      setSlug("")
      setDescription("")
      setShowForm(false)
      queryClient.invalidateQueries({ queryKey: orpc.dao.list.queryOptions().queryKey })
      // Redirect to the new DAO with onboarding flag
      navigate({ to: "/daos/$slug", params: { slug: result.slug }, search: { onboarding: "1" } })
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to create DAO")
    }
  }

  return (
    <div className="min-h-screen pt-28 pb-20 px-6 font-['Inter']">
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <div className="text-xs font-bold tracking-[0.25em] uppercase text-tertiary mb-3">
              Community DAOs
            </div>
            <h1 className="text-4xl md:text-5xl font-headline font-bold text-on-surface tracking-tight mb-3">
              Explore DAOs
            </h1>
            <p className="text-on-surface-variant/80 text-base max-w-lg">
              Each DAO governs its own AI training datasets. Join an existing community or launch
              your own.
            </p>
          </div>
          {connected && (
            <button
              type="button"
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-lg hover:shadow-primary/30 transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              Launch a DAO
            </button>
          )}
        </div>

        {/* Create form */}
        {showForm && (
          <div className="mb-10 p-6 rounded-2xl border border-outline-variant/20 bg-surface-container/60 backdrop-blur-sm">
            <h3 className="text-lg font-bold text-on-surface mb-4">Launch a New DAO</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label
                  htmlFor="dao-name"
                  className="block text-xs font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider"
                >
                  Name
                </label>
                <input
                  id="dao-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (!slug)
                      setSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-|-$/g, ""),
                      )
                  }}
                  placeholder="Medical Research DAO"
                  className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="dao-slug"
                  className="block text-xs font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider"
                >
                  Slug
                </label>
                <input
                  id="dao-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="medical-research"
                  className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none text-sm font-mono"
                />
              </div>
            </div>
            <div className="mb-4">
              <label
                htmlFor="dao-description"
                className="block text-xs font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider"
              >
                Description
              </label>
              <textarea
                id="dao-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A community-governed dataset for medical research AI training..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none text-sm resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="px-6 py-3 rounded-xl bg-primary text-on-primary text-sm font-bold hover:shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-50"
              >
                {createMutation.isPending ? "Creating..." : "Create DAO"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-3 rounded-xl border border-outline-variant/20 text-on-surface-variant text-sm font-bold hover:bg-surface-container transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-8">
          <div className="relative max-w-md">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-lg">
              search
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search DAOs..."
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none text-sm"
            />
          </div>
        </div>

        {/* DAO Grid */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-4 block">
              groups
            </span>
            <p className="text-on-surface-variant/60 text-sm">
              {search ? "No DAOs match your search" : "No DAOs yet. Be the first to launch one!"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((dao) => (
              <Link
                key={dao.id}
                to="/daos/$slug"
                params={{ slug: dao.slug }}
                className="group relative p-6 rounded-2xl border border-outline-variant/15 bg-surface-container/40 hover:bg-surface-container/70 hover:border-primary/30 transition-all hover:shadow-lg hover:shadow-primary/5"
              >
                {/* DAO Avatar */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/30 to-tertiary/30 flex items-center justify-center text-xl font-bold text-on-surface">
                    {dao.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-on-surface truncate group-hover:text-primary transition-colors">
                      {dao.name}
                    </h3>
                    <span className="text-xs font-mono text-on-surface-variant/50">
                      /{dao.slug}
                    </span>
                  </div>
                </div>

                {/* Description */}
                {dao.description && (
                  <p className="text-sm text-on-surface-variant/70 line-clamp-2 mb-5">
                    {dao.description}
                  </p>
                )}

                {/* Stats */}
                <div className="flex items-center gap-6 text-xs text-on-surface-variant/60">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">group</span>
                    <span className="font-bold">{dao.memberCount}</span> members
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">database</span>
                    <span className="font-bold">{dao.datasetCount}</span> datasets
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">upload_file</span>
                    <span className="font-bold">{dao.contributionCount}</span>
                  </div>
                </div>

                {/* Arrow */}
                <span className="absolute top-6 right-6 material-symbols-outlined text-on-surface-variant/20 group-hover:text-primary/60 transition-all group-hover:translate-x-1">
                  arrow_forward
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
