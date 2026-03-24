import { AptosWalletAdapterProvider, useWallet } from "@aptos-labs/wallet-adapter-react"
import { Network } from "@aptos-labs/ts-sdk"
import { toast } from "sonner"
import { useState, useEffect } from "react"

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <>{children}</>
  }

  return (
    <AptosWalletAdapterProvider
      optInWallets={["Petra"]}
      autoConnect={true}
      dappConfig={{ network: Network.TESTNET }}
      onError={(e) => {
        console.error("Wallet Provider Error:", e)
      }}
    >
      {children}
    </AptosWalletAdapterProvider>
  )
}

export function WalletButton() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button disabled className="rounded-xl bg-indigo-600/50 px-5 py-2.5 text-sm font-bold opacity-50 cursor-wait">
        Loading Wallet...
      </button>
    )
  }

  return <WalletButtonClient />
}

function WalletButtonClient() {
  const { connected, account, disconnect, connect, wallets } = useWallet()

  const handleConnect = async () => {
    console.log("Attempting to connect. Available wallets:", wallets?.map(w => w.name))
    const petra = wallets?.find(w => w.name === "Petra" || w.name === "Petra Web")
    if (!petra) {
      toast.error("Petra wallet not found. Please install the extension.")
      return
    }
    try {
      await connect(petra.name)
    } catch (e) {
      console.error("Connect error:", e)
      toast.error("Failed to connect.")
    }
  }

  if (connected && account) {
    const addr = account.address.toString()
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded">
          {addr.slice(0, 6)}...{addr.slice(-4)}
        </span>
        <button 
          onClick={() => disconnect()}
          className="text-xs font-bold text-neutral-400 hover:text-white transition-colors"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handleConnect}
      className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-sm font-bold transition-all shadow-lg active:scale-95"
    >
      Connect Petra
    </button>
  )
}

