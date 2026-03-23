import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { trpc } from "~/lib/trpc"
import { WalletButton } from "~/components/WalletButton"
import type { WalletAccount } from "~/lib/wallet"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  const [wallet, setWallet] = useState<WalletAccount | null>(null)

  const { data: datasets, isLoading } = trpc.dataset.list.useQuery({ limit: 10 })
  const { data: pending } = trpc.contribution.list.useQuery({ status: "pending", limit: 1 })

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="text-xl font-bold tracking-tight">🏛️ Quorum</span>
          <div className="hidden sm:flex gap-6 text-sm text-gray-400">
            <Link to="/contribute" className="hover:text-white transition-colors">Contribute</Link>
            <Link to="/vote" className="hover:text-white transition-colors">
              Vote
              {(pending?.length ?? 0) > 0 && (
                <span className="ml-1 rounded-full bg-indigo-600 px-1.5 py-0.5 text-xs text-white">
                  {pending?.length}
                </span>
              )}
            </Link>
            <Link to="/datasets" className="hover:text-white transition-colors">Datasets</Link>
            <Link to="/earnings" className="hover:text-white transition-colors">Earnings</Link>
          </div>
        </div>
        <WalletButton account={wallet} onConnect={setWallet} />
      </nav>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-5xl font-bold mb-4">
          Community-Governed<br />
          <span className="text-indigo-400">AI Training Datasets</span>
        </h1>
        <p className="text-gray-400 text-lg mb-10 max-w-2xl mx-auto">
          The community builds it. The community votes on it. The community earns from it.
          Every contribution stored on Shelby Protocol. Every vote on Aptos.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            to="/contribute"
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-3 font-semibold transition-colors"
          >
            Contribute Data
          </Link>
          <Link
            to="/datasets"
            className="rounded-lg border border-gray-700 hover:border-gray-500 px-6 py-3 font-semibold transition-colors"
          >
            Browse Datasets
          </Link>
        </div>
      </div>

      {/* Active Datasets */}
      <div className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-xl font-semibold mb-6 text-gray-200">Active Datasets</h2>
        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-gray-800/50 animate-pulse" />
            ))}
          </div>
        )}
        {!isLoading && !datasets?.length && (
          <p className="text-gray-500 text-center py-12">
            No datasets yet.{" "}
            <Link to="/contribute" className="text-indigo-400 hover:underline">
              Be the first to contribute.
            </Link>
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {datasets?.map((ds) => (
            <Link
              key={ds.id}
              to="/datasets"
              className="block rounded-xl border border-gray-800 bg-gray-900 hover:border-gray-600 p-5 transition-colors"
            >
              <h3 className="font-semibold mb-1">{ds.name}</h3>
              {ds.description && (
                <p className="text-sm text-gray-400 line-clamp-2">{ds.description}</p>
              )}
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                <span>Weight: {ds.totalWeight.toLocaleString()}</span>
                <span>{new Date(ds.createdAt).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
