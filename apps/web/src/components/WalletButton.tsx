import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk"
import { AptosWalletAdapterProvider, useWallet } from "@aptos-labs/wallet-adapter-react"
import { useEffect, useState } from "react"
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
      <button
        type="button"
        disabled
        className="rounded-xl bg-indigo-600/50 px-5 py-2.5 text-sm font-bold opacity-50 cursor-wait"
      >
        Loading Wallet...
      </button>
    )
  }

  return <WalletButtonClient />
}

function WalletButtonClient() {
  const { connected, account, disconnect, connect, wallets, signMessage } = useWallet()
  const [isMember, setIsMember] = useState<boolean | null>(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  useEffect(() => {
    async function checkMembership() {
      if (!account?.address) return
      try {
        const resource = await aptos.getAccountResource({
          accountAddress: account.address.toString(),
          resourceType: `${CONTRACT_ADDRESS}::dao_governance::Member`,
        })
        setIsMember(!!resource)
      } catch (e: any) {
        if (e?.status === 404 || e?.message?.includes("Resource not found")) {
          setIsMember(false)
        } else {
          console.error("Failed to check membership", e)
        }
      }
    }

    if (connected && account) {
      checkMembership()
    } else {
      setIsMember(null)
    }
  }, [connected, account?.address])

  // Wallet bağlandığında sunucu oturumu oluştur
  useEffect(() => {
    async function authenticate() {
      if (!connected || !account || !signMessage) return
      setIsAuthenticating(true)
      try {
        const pubKey =
          typeof account.publicKey === "string"
            ? account.publicKey
            : account.publicKey?.toString() ?? ""

        const ok = await walletSignIn({
          address: account.address.toString(),
          publicKey: pubKey,
          signMessage: async ({ message, nonce }) => {
            const result = await signMessage({ message, nonce })
            const sig =
              typeof result.signature === "string"
                ? result.signature
                : (result.signature as any)?.toString() ?? ""
            return { signature: sig }
          },
        })

        if (!ok) toast.error("Sunucu oturumu başlatılamadı.")
      } catch (e) {
        console.error("Auth error", e)
      } finally {
        setIsAuthenticating(false)
      }
    }

    authenticate()
  }, [connected, account?.address])

  const handleConnect = async () => {
    const petra = wallets?.find((w) => w.name === "Petra" || w.name === "Petra Web")
    if (!petra) {
      toast.error("Petra wallet bulunamadı. Lütfen eklentiyi yükleyin.")
      return
    }
    try {
      await connect(petra.name)
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
        {isAuthenticating && (
          <span className="text-xs text-neutral-500">Kimlik doğrulanıyor...</span>
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
