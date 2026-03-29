import { useWallet } from "@aptos-labs/wallet-adapter-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { orpc } from "../../utils/orpc"

export const Route = createFileRoute("/datasets/")({
  component: DatasetsPage,
})

const CATEGORIES = ["Medical", "Code", "Vision", "Finance", "Audio", "NLP"]
const SIZES = [
  { label: "Small", max: 100 },
  { label: "Medium", max: 1000 },
  { label: "Large", max: Number.POSITIVE_INFINITY },
]

function DatasetsPage() {
  const { connected, account } = useWallet()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: datasets, isLoading } = useQuery(orpc.dataset.list.queryOptions())
  const createMutation = useMutation(orpc.dataset.create.mutationOptions())

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  // Filter & search state
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [showCategoryMenu, setShowCategoryMenu] = useState(false)
  const [activeSize, setActiveSize] = useState<string | null>(null)
  const [showSizeMenu, setShowSizeMenu] = useState(false)
  const [visibleCount, setVisibleCount] = useState(6)

  // Refs for fixed-position dropdowns
  const categoryBtnRef = useRef<HTMLButtonElement>(null)
  const sizeBtnRef = useRef<HTMLButtonElement>(null)
  const [categoryPos, setCategoryPos] = useState({ top: 0, left: 0 })
  const [sizePos, setSizePos] = useState({ top: 0, left: 0 })

  function openCategoryMenu() {
    if (categoryBtnRef.current) {
      const r = categoryBtnRef.current.getBoundingClientRect()
      setCategoryPos({ top: r.bottom + 8, left: r.left })
    }
    setShowCategoryMenu((v) => !v)
    setShowSizeMenu(false)
  }

  function openSizeMenu() {
    if (sizeBtnRef.current) {
      const r = sizeBtnRef.current.getBoundingClientRect()
      setSizePos({ top: r.bottom + 8, left: r.left })
    }
    setShowSizeMenu((v) => !v)
    setShowCategoryMenu(false)
  }

  // Close on outside click or scroll
  useEffect(() => {
    function close() {
      setShowCategoryMenu(false)
      setShowSizeMenu(false)
    }
    if (showCategoryMenu || showSizeMenu) {
      document.addEventListener("click", close)
      window.addEventListener("scroll", close, true)
      return () => {
        document.removeEventListener("click", close)
        window.removeEventListener("scroll", close, true)
      }
    }
  }, [showCategoryMenu, showSizeMenu])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        ownerAddress: account?.address.toString() ?? "",
      })
      toast.success("Dataset created!")
      setName("")
      setDescription("")
      setShowForm(false)
      queryClient.invalidateQueries({ queryKey: orpc.dataset.list.queryOptions().queryKey })
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to create dataset")
    }
  }

  function handleAccessShelby(dsId: string, dsName: string) {
    navigator.clipboard.writeText(dsId).then(() => {
      toast.success(`Dataset ID copied! Navigating to contribute...`, { description: dsName })
    })
    navigate({ to: "/contribute" })
  }

  // Apply filters
  const filtered = (datasets ?? []).filter((ds) => {
    const matchSearch =
      !search ||
      ds.name.toLowerCase().includes(search.toLowerCase()) ||
      (ds.description ?? "").toLowerCase().includes(search.toLowerCase())

    const matchCategory =
      !activeCategory ||
      ds.name.toLowerCase().includes(activeCategory.toLowerCase()) ||
      (ds.description ?? "").toLowerCase().includes(activeCategory.toLowerCase())

    const sizeObj = SIZES.find((s) => s.label === activeSize)
    const matchSize = !sizeObj || ds.totalWeight <= sizeObj.max

    return matchSearch && matchCategory && matchSize
  })

  const visible = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount

  return (
    <main className="pt-24 pb-24 px-8 max-w-screen-2xl mx-auto dot-grid min-h-screen">
      {/* Header & Search */}
      <header className="mb-20">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-12 text-left">
          <div className="max-w-3xl">
            <h1 className="display-lg text-on-surface mb-8 leading-none">
              The Neural <span className="text-gradient">Archive</span>
            </h1>
            <p className="text-xl text-on-surface-variant max-w-xl font-light leading-relaxed">
              Access high-fidelity AI training sets curated by the Quorum DAO. Governed by the
              community, powered by the Shelby Protocol.
            </p>
          </div>

          <div className="w-full md:w-96 flex flex-col gap-4">
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-primary opacity-60">
                search
              </span>
              <input
                className="w-full glass-card border-none rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:ring-1 focus:ring-primary/40 text-on-surface placeholder:text-outline/40 transition-all"
                placeholder="Search datasets..."
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setVisibleCount(6)
                }}
              />
            </div>

            {connected && (
              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                className={`w-full px-8 py-4 rounded-xl font-headline font-black text-xs uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95 ${showForm ? "bg-surface-container-high text-on-surface-variant ghost-border" : "bg-gradient-primary text-surface shadow-primary/20"}`}
              >
                {showForm ? "CANCEL_ACTION" : "+ CREATE_NEW_DATASET"}
              </button>
            )}
          </div>
        </div>

        {/* Filters toolbar */}
        <div className="mt-12 flex flex-wrap items-center gap-6 py-4 px-8 glass-card rounded-full border-none shadow-xl">
          <div className="flex items-center space-x-3 border-r border-outline-variant/10 pr-6">
            <span className="material-symbols-outlined text-primary text-sm">filter_list</span>
            <span className="label-sm !text-primary/60">Refine</span>
          </div>

          {/* Category filter */}
          <button
            ref={categoryBtnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              openCategoryMenu()
            }}
            className={`flex items-center space-x-2 px-4 py-1.5 rounded-full transition-colors ${activeCategory ? "bg-primary/20 text-primary" : "hover:bg-surface-variant/50"}`}
          >
            <span className="text-sm font-medium">{activeCategory ?? "Category"}</span>
            <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
          </button>

          {/* License filter */}
          <button
            type="button"
            onClick={() => toast.info("License filter coming soon")}
            className="flex items-center space-x-2 px-4 py-1.5 rounded-full hover:bg-surface-variant/50 transition-colors"
          >
            <span className="text-sm font-medium">License</span>
            <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
          </button>

          {/* Size filter */}
          <button
            ref={sizeBtnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              openSizeMenu()
            }}
            className={`flex items-center space-x-2 px-4 py-1.5 rounded-full transition-colors ${activeSize ? "bg-secondary/20 text-secondary" : "hover:bg-surface-variant/50"}`}
          >
            <span className="text-sm font-medium">{activeSize ?? "Size"}</span>
            <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
          </button>

          {/* Clear filters */}
          {(activeCategory || activeSize || search) && (
            <button
              type="button"
              onClick={() => {
                setActiveCategory(null)
                setActiveSize(null)
                setSearch("")
                setVisibleCount(6)
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-error/10 text-error text-xs font-bold hover:bg-error/20 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">close</span>
              Clear
            </button>
          )}

          <div className="ml-auto flex items-center space-x-2">
            <span className="text-xs text-outline">{filtered.length} Datasets Found</span>
          </div>
        </div>

        {/* Fixed-position dropdowns (portal-style, never clipped) */}
        {showCategoryMenu && (
          <div
            role="menu"
            aria-label="Category filter menu"
            className="fixed z-[9999] glass-card rounded-xl p-2 min-w-[160px] shadow-2xl border border-outline-variant/20"
            style={{ top: categoryPos.top, left: categoryPos.left }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setActiveCategory(null)
                setShowCategoryMenu(false)
              }}
              className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-primary/10 text-on-surface-variant"
            >
              All
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setActiveCategory(c)
                  setShowCategoryMenu(false)
                  setVisibleCount(6)
                }}
                className={`w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-primary/10 ${activeCategory === c ? "text-primary font-bold" : "text-on-surface-variant"}`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {showSizeMenu && (
          <div
            role="menu"
            aria-label="Size filter menu"
            className="fixed z-[9999] glass-card rounded-xl p-2 min-w-[120px] shadow-2xl border border-outline-variant/20"
            style={{ top: sizePos.top, left: sizePos.left }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setActiveSize(null)
                setShowSizeMenu(false)
              }}
              className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-secondary/10 text-on-surface-variant"
            >
              All
            </button>
            {SIZES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  setActiveSize(s.label)
                  setShowSizeMenu(false)
                  setVisibleCount(6)
                }}
                className={`w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-secondary/10 ${activeSize === s.label ? "text-secondary font-bold" : "text-on-surface-variant"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="mb-12 glass-card rounded-xl p-8 space-y-6">
          <h2 className="text-xl font-bold font-headline text-on-surface">Create New Dataset</h2>
          <div className="space-y-2">
            <label
              htmlFor="ds-name"
              className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant"
            >
              Name
            </label>
            <input
              id="ds-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Medical Q&A 2026..."
              required
              className="w-full rounded-xl px-4 py-3 outline-none transition-all bg-surface-container-lowest border border-outline-variant/30 text-on-surface focus:border-primary"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="ds-desc"
              className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant"
            >
              Description (optional)
            </label>
            <textarea
              id="ds-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="High-quality dataset..."
              rows={3}
              className="w-full rounded-xl px-4 py-3 outline-none transition-all resize-none bg-surface-container-lowest border border-outline-variant/30 text-on-surface focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending || !name.trim()}
            className="rounded-xl px-8 py-3 font-bold text-sm uppercase tracking-wider transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #ADC6FF, #DDB7FF)", color: "#0D0E13" }}
          >
            {createMutation.isPending ? "Creating..." : "Create Dataset"}
          </button>
        </form>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-80 glass-card rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="glass-card rounded-xl p-16 text-center text-on-surface-variant">
          {datasets?.length === 0
            ? "No datasets found. Be the first to create one!"
            : "No datasets match your filters."}
        </div>
      )}

      {!isLoading && visible.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {visible.map((ds) => (
            <div
              key={ds.id}
              className="glass-card rounded-2xl p-10 flex flex-col h-full relative group transition-all duration-500 hover:-translate-y-2 hover:shadow-primary/10 border-none"
            >
              <div className="absolute top-6 right-6 flex flex-col items-end gap-2">
                {ds.totalWeight > 0 && (
                  <span className="px-3 py-1 bg-tertiary/10 text-tertiary text-[10px] font-bold uppercase tracking-[0.2em] rounded-full ghost-border">
                    High Yield
                  </span>
                )}
                <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-[0.2em] rounded-full ghost-border">
                  Active
                </span>
              </div>

              <div className="mb-8">
                <div className="w-16 h-16 rounded-2xl mb-8 ghost-border bg-surface-container flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                  📊
                </div>
                <h3 className="font-headline text-3xl font-bold text-on-surface mb-4 tracking-tight group-hover:text-primary transition-colors">
                  {ds.name}
                </h3>
                <p className="text-on-surface-variant font-light leading-relaxed text-[15px] line-clamp-3">
                  {ds.description ||
                    "A community-curated dataset for high-performance AI model training."}
                </p>
              </div>

              <div className="mt-auto pt-10 ghost-border border-x-0 border-b-0">
                <div className="grid grid-cols-2 gap-y-6 gap-x-4 mb-10">
                  <div className="flex items-center space-x-3">
                    <span className="material-symbols-outlined text-primary/60 text-lg">token</span>
                    <div className="flex flex-col">
                      <span className="label-sm !text-[8px] opacity-40">Protocol</span>
                      <span className="text-xs font-bold text-on-surface">Shelby</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="material-symbols-outlined text-secondary/60 text-lg">
                      database
                    </span>
                    <div className="flex flex-col">
                      <span className="label-sm !text-[8px] opacity-40">Network</span>
                      <span className="text-xs font-bold text-on-surface">Aptos</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="material-symbols-outlined text-tertiary/60 text-lg">
                      monitoring
                    </span>
                    <div className="flex flex-col">
                      <span className="label-sm !text-[8px] opacity-40">Weight</span>
                      <span className="text-xs font-bold text-on-surface">
                        {ds.totalWeight.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="material-symbols-outlined text-on-surface-variant/40 text-lg">
                      group
                    </span>
                    <div className="flex flex-col">
                      <span className="label-sm !text-[8px] opacity-40">Files</span>
                      <span className="text-xs font-bold text-on-surface">
                        {ds.contributionCount ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAccessShelby(ds.id, ds.name)}
                  className="w-full py-4 px-4 bg-surface-container-high hover:bg-primary hover:text-surface transition-all rounded-xl flex items-center justify-center space-x-3 group/btn font-label font-black text-[10px] uppercase tracking-[0.2em] ghost-border"
                >
                  <span className="opacity-80">ACCESS_VIA_SHELBY</span>
                  <span className="material-symbols-outlined text-sm transition-transform group-hover/btn:translate-x-1">
                    arrow_forward
                  </span>
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {!isLoading && hasMore && (
        <div className="mt-20 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + 6)}
            className="group flex items-center space-x-4 px-8 py-4 bg-surface-container rounded-xl border border-outline-variant/20 hover:border-primary transition-all"
          >
            <span className="font-headline font-bold text-on-surface">
              Discover More Datasets ({filtered.length - visibleCount} remaining)
            </span>
            <span className="material-symbols-outlined text-primary group-hover:rotate-90 transition-transform">
              sync
            </span>
          </button>
        </div>
      )}
    </main>
  )
}
