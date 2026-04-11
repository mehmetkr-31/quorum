import { AptosWalletAdapterProvider, useWallet } from "@aptos-labs/wallet-adapter-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { detectAptosNetwork } from "@/utils/aptos-network"
import { walletSignIn, walletSignOut } from "@/utils/auth-client"

// Provider her zaman render edilir — mounted trick'i kaldırıldı.
// AptosWalletAdapterProvider browser-safe, SSR'da boş state döner.
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const network = detectAptosNetwork(import.meta.env.VITE_APTOS_NODE_URL)

  return (
    <AptosWalletAdapterProvider
      autoConnect={false}
      dappConfig={{ network }}
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
  const { connected, account, disconnect, connect, wallets, signMessage } = useWallet()
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const authenticatedAddressRef = useRef<string | null>(null)

  const addrStr = account?.address?.toString() ?? null

  useEffect(() => {
    if (!connected || !account || !signMessage || !addrStr) {
      authenticatedAddressRef.current = null
      setIsAuthenticating(false)
      return
    }

    if (authenticatedAddressRef.current === addrStr) return

    let cancelled = false

    async function ensureSession() {
      const currentAccount = account
      const currentAddress = addrStr

      if (!currentAccount || !currentAddress) return

      const publicKey = currentAccount.publicKey ?? ""

      if (!publicKey) {
        toast.error("Wallet public key not available.")
        return
      }

      setIsAuthenticating(true)
      try {
        const success = await walletSignIn({
          address: currentAddress,
          publicKey,
          signMessage: async ({ message, nonce }) => {
            return signMessage({ message, nonce })
          },
        })

        if (cancelled) return

        if (!success) {
          toast.error("Wallet session could not be established.")
          return
        }

        authenticatedAddressRef.current = currentAddress
      } catch (error) {
        if (!cancelled) {
          console.error("Wallet auth error:", error)
          toast.error((error as Error).message || "Wallet authentication failed.")
        }
      } finally {
        if (!cancelled) {
          setIsAuthenticating(false)
        }
      }
    }

    void ensureSession()

    return () => {
      cancelled = true
    }
  }, [account, addrStr, connected, signMessage])

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
        <span className="text-xs font-mono text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded">
          {addr.slice(0, 6)}...{addr.slice(-4)}
        </span>
        {isAuthenticating && (
          <span className="text-xs font-bold text-amber-400 bg-amber-400/10 px-2 py-1 rounded">
            Authorizing
          </span>
        )}
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
