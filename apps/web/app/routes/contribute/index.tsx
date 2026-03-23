import { createFileRoute, Link } from "@tanstack/react-router"
import { useState, useRef } from "react"
import { trpc } from "~/lib/trpc"
import { WalletButton } from "~/components/WalletButton"
import {
  connectWallet,
  signAndSubmitTx,
  buildSubmitContributionPayload,
  type WalletAccount,
} from "~/lib/wallet"

export const Route = createFileRoute("/contribute/")({
  component: ContributePage,
})

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? ""

function ContributePage() {
  const [wallet, setWallet] = useState<WalletAccount | null>(null)
  const [selectedDatasetId, setSelectedDatasetId] = useState("")
  const [shelbyAccount, setShelbyAccount] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<"idle" | "uploading" | "signing" | "done" | "error">("idle")
  const [result, setResult] = useState<{ id: string; aptosTxHash: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: datasets } = trpc.dataset.list.useQuery({ limit: 50 })
  const submitMutation = trpc.contribution.submit.useMutation()
  const confirmMutation = trpc.contribution.confirmOnChain.useMutation()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!wallet || !file || !selectedDatasetId || !shelbyAccount) return

    setStatus("uploading")
    setErrorMsg("")
    try {
      // 1. Read file as base64
      const buffer = await file.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))

      // 2. Upload to Shelby + create DB record
      const res = await submitMutation.mutateAsync({
        datasetId: selectedDatasetId,
        contributorAddress: wallet.address,
        shelbyAccount,
        data: base64,
        contentType: file.type || "application/octet-stream",
      })

      // 3. Sign Aptos tx client-side
      setStatus("signing")
      const payload = buildSubmitContributionPayload(
        CONTRACT_ADDRESS,
        res.id,
        selectedDatasetId,
        res.shelbyAccount,
        res.shelbyBlobName,
        res.dataHash,
      )
      const aptosTxHash = await signAndSubmitTx(payload)

      // 4. Confirm on-chain hash in DB
      await confirmMutation.mutateAsync({ id: res.id, aptosTxHash })

      setResult({ id: res.id, aptosTxHash })
      setStatus("done")
    } catch (e) {
      setStatus("error")
      setErrorMsg(e instanceof Error ? e.message : "Unknown error")
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold tracking-tight">🏛️ Quorum</Link>
        <WalletButton account={wallet} onConnect={setWallet} />
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Contribute Data</h1>
        <p className="text-gray-400 mb-8">
          Upload your data to Shelby Protocol and register your contribution on Aptos.
          DAO members will vote to approve it.
        </p>

        {!wallet && (
          <div className="rounded-xl border border-yellow-800 bg-yellow-900/20 p-4 mb-6 text-sm text-yellow-300">
            Connect your wallet to contribute.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Dataset selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Dataset</label>
            <select
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Select a dataset…</option>
              {datasets?.map((ds) => (
                <option key={ds.id} value={ds.id}>{ds.name}</option>
              ))}
            </select>
          </div>

          {/* Shelby account */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Your Shelby Account Address
            </label>
            <input
              type="text"
              value={shelbyAccount}
              onChange={(e) => setShelbyAccount(e.target.value)}
              placeholder="shelby://0x..."
              required
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* File upload */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Data File</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer rounded-xl border-2 border-dashed border-gray-700 hover:border-indigo-500 p-8 text-center transition-colors"
            >
              {file ? (
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-400">Click to select a file</p>
                  <p className="text-xs text-gray-600 mt-1">Any format: text, image, audio, JSON…</p>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </div>

          <button
            type="submit"
            disabled={!wallet || !file || !selectedDatasetId || status === "uploading" || status === "signing"}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed py-3 font-semibold transition-colors"
          >
            {status === "uploading" && "Uploading to Shelby…"}
            {status === "signing" && "Sign in wallet…"}
            {(status === "idle" || status === "done" || status === "error") && "Submit Contribution"}
          </button>
        </form>

        {status === "done" && result && (
          <div className="mt-6 rounded-xl border border-green-700 bg-green-900/20 p-5">
            <p className="font-semibold text-green-300 mb-2">✓ Contribution submitted!</p>
            <p className="text-xs text-gray-400 mb-1">Contribution ID: <span className="font-mono">{result.id}</span></p>
            <p className="text-xs text-gray-400">Aptos Tx: <span className="font-mono">{result.aptosTxHash}</span></p>
            <p className="text-sm text-gray-400 mt-3">
              Your contribution is now pending DAO approval. The 48-hour voting window has started.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="mt-6 rounded-xl border border-red-700 bg-red-900/20 p-4 text-sm text-red-300">
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  )
}
