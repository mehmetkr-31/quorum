import { AptosWalletAdapterProvider, useWallet } from "@aptos-labs/wallet-adapter-react"

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <AptosWalletAdapterProvider optInWallets={["Petra" as any]} autoConnect={true}>
      {children}
    </AptosWalletAdapterProvider>
  )
}

export function WalletButton() {
  const { connected, account, disconnect, connect } = useWallet()

  if (connected && account) {
    const address = account.address.toString()
    return (
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
            Connected
          </span>
          <span className="text-xs font-mono text-indigo-400">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          type="button"
          className="rounded-lg bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 text-xs font-bold transition-colors"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => connect("Petra" as any)}
      type="button"
      className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-sm font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
    >
      Connect Petra
    </button>
  )
}
