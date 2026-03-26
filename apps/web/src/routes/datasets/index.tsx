import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { formatDistanceToNow } from "date-fns"
import { orpc } from "../../utils/orpc"

export const Route = createFileRoute("/datasets/")({
  component: DatasetsPage,
})

function DatasetsPage() {
  const { data: datasets, isLoading } = useQuery(orpc.dataset.list.queryOptions())

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-12 tracking-tight">Dataset Marketplace</h1>

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-48 bg-neutral-900 rounded-[2rem]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {datasets?.map((ds) => (
            <div
              key={ds.id}
              className="rounded-[2rem] border border-neutral-800 bg-neutral-900/40 p-8 flex flex-col h-full hover:border-neutral-700 transition-colors"
            >
              <h3 className="text-2xl font-bold mb-3 text-white">{ds.name}</h3>
              <p className="text-neutral-400 text-sm mb-6 flex-grow">{ds.description}</p>

              <div className="flex flex-wrap items-center gap-3 text-xs mt-auto pt-4 border-t border-neutral-800/50">
                <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                  {ds.contributionCount || 0} files
                </span>

                <span className="bg-teal-500/10 text-teal-400 border border-teal-500/20 px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Weight: {ds.totalWeight || 0}
                </span>

                <span className="text-neutral-500 flex items-center gap-1.5 ml-auto">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {ds.lastActivity
                    ? formatDistanceToNow(new Date(ds.lastActivity), { addSuffix: true })
                    : "No activity"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
