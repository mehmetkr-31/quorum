import { useState } from "react"
import { connectWallet, type WalletAccount } from "~/lib/wallet"

interface Props {
  onConnect: (account: WalletAccount) => void
  account: WalletAccount | null
}

export function WalletButton({ onConnect, account }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    setLoading(true)
    setError(null)
    try {
      const acc = await connectWallet()
      onConnect(acc)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect")
    } finally {
      setLoading(false)
    }
  }

  if (account) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-900/30 border border-green-700 px-3 py-1.5 text-sm">
        <span className="h-2 w-2 rounded-full bg-green-400" />
        <span className="font-mono text-green-300">
          {account.address.slice(0, 6)}…{account.address.slice(-4)}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleConnect}
        disabled={loading}
        className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-1.5 text-sm font-medium text-white transition-colors"
      >
        {loading ? "Connecting…" : "Connect Wallet"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
