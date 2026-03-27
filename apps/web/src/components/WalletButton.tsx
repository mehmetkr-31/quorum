import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk"
import { AptosWalletAdapterProvider, useWallet } from "@aptos-labs/wallet-adapter-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { walletSignIn, walletSignOut } from "@/utils/auth-client"

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS
const NODE_URL = import.meta.env.VITE_APTOS_NODE_URL

const aptos = new Aptos(
  new AptosConfig({
    network: NODE_URL?.includes("testnet") ? Network.TESTNET : Network.DEVNET,
    fullnode: NODE_URL,
  }),
)

// Provider her zaman render edilir — mounted trick'i kaldırıldı.
// AptosWalletAdapterProvider browser-safe, SSR'da boş state döner.
export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <AptosWalletAdapterProvider
      autoConnect={false}
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
  return <WalletButtonClient />
}

function WalletButtonClient() {
  const { connected, account, disconnect, connect, wallets } = useWallet()
  const [isMember, setIsMember] = useState<boolean | null>(null)

  const addrStr = account?.address?.toString() ?? null

  useEffect(() => {
    async function checkMembership() {
      if (!addrStr) return
      try {
        const resource = await aptos.getAccountResource({
          accountAddress: addrStr,
          resourceType: `${CONTRACT_ADDRESS}::dao_governance::Member`,
        })
        setIsMember(!!resource)
      } catch (e: unknown) {
        const error = e as { status?: number; message?: string }
        if (error?.status === 404 || error?.message?.includes("Resource not found")) {
          setIsMember(false)
        } else {
          console.error("Failed to check membership", e)
        }
      }
    }

    if (connected && addrStr) {
      checkMembership()
    } else {
      setIsMember(null)
    }
  }, [connected, addrStr])

  // Session auth devre dışı — wallet adapter multikey desteği gelene kadar ertelendi

  const handleConnect = async () => {
    console.log(
      "Mevcut wallets:",
      wallets?.map((w) => w.name),
    )
    const wallet = wallets?.[0]
    if (!wallet) {
      toast.error("Petra wallet bulunamadı. Lütfen eklentiyi yükleyin.")
      return
    }
    try {
      await connect(wallet.name)
    } catch (e) {
      console.error("Connect error:", e)
      toast.error("Bağlantı başarısız.")
    }
  }

  const handleDisconnect = async () => {
    await walletSignOut()
    disconnect()
  }

  if (connected && account) {
    const addr = account.address.toString()
    return (
      <div className="flex items-center gap-3">
        {isMember === true && (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-teal-400 bg-teal-400/10 px-2.5 py-1.5 rounded-md border border-teal-400/20">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            DAO Member
          </span>
        )}
        {isMember === false && (
          <span className="hidden sm:inline-flex text-xs font-bold text-neutral-400 bg-neutral-800/50 px-2.5 py-1.5 rounded-md border border-neutral-700">
            Not Joined
          </span>
        )}

        <span className="text-xs font-mono text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded">
          {addr.slice(0, 6)}...{addr.slice(-4)}
        </span>
        <button
          type="button"
          onClick={handleDisconnect}
          className="text-xs font-bold text-neutral-400 hover:text-white transition-colors"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={handleConnect}
      className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-sm font-bold transition-all shadow-lg active:scale-95"
    >
      Connect Petra
    </button>
  )
}
