import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { orpc } from "../utils/orpc";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { data: datasets, isLoading } = useQuery(
    orpc.dataset.list.queryOptions({
      input: { limit: 6 },
    }),
  );
  const { data: stats } = useQuery(orpc.governance.getStats.queryOptions());

  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.08)_0,transparent_70%)] pointer-events-none" />
        <div className="max-w-5xl mx-auto px-6 text-center">
          <div className="inline-flex items-center rounded-full border border-indigo-500/20 bg-indigo-500/5 px-3 py-1 text-xs font-medium text-indigo-400 mb-8">
            Community-Owned AI Training Data
          </div>
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-8 leading-[1.1]">
            The community builds it.<br />
            <span className="text-neutral-400">The community earns from it.</span>
          </h1>
          <p className="text-neutral-400 text-lg sm:text-xl mb-12 max-w-2xl mx-auto leading-relaxed">
            Quorum is a decentralized DAO where domain experts collaboratively build, curate, and govern high-quality AI training datasets.
          </p>
        </div>
      </section>

      {/* Stats Row */}
      <section className="border-y border-neutral-800 bg-neutral-900/30">
        <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          <StatItem label="Total Contributions" value={stats?.totalContributions ?? 0} />
          <StatItem label="Active Members" value={stats?.totalMembers ?? 0} />
          <StatItem label="Total Revenue (APT)" value={stats?.totalRevenue ?? "0.00"} />
          <StatItem label="Approved Datasets" value={datasets?.length ?? 0} />
        </div>
      </section>

      {/* Featured Datasets */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="flex items-end justify-between mb-12">
          <div>
            <h2 className="text-3xl font-bold mb-2">Featured Datasets</h2>
            <p className="text-neutral-400">High-quality, community-verified data ready for training.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-48 rounded-2xl bg-neutral-900 animate-pulse border border-neutral-800" />
            ))}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {datasets?.map((ds) => (
              <div
                key={ds.id}
                className="group block rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 transition-all hover:border-neutral-600 hover:bg-neutral-900"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-xl">
                    📊
                  </div>
                  <span className="text-xs font-mono text-neutral-500">w: {ds.totalWeight.toLocaleString()}</span>
                </div>
                <h3 className="text-lg font-bold mb-2 group-hover:text-indigo-400 transition-colors">{ds.name}</h3>
                <p className="text-sm text-neutral-400 line-clamp-2 mb-6">
                  {ds.description || "A community-curated dataset for high-performance AI model training."}
                </p>
                <div className="flex items-center justify-between text-xs">
                  <span className="px-2 py-1 rounded-md bg-neutral-800 text-neutral-400 uppercase tracking-wider font-semibold">Active</span>
                  <span className="text-neutral-500">{new Date(ds.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center sm:text-left">
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">{label}</p>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
