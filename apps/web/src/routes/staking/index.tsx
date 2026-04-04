import { Aptos, AptosConfig, type InputEntryFunctionData, Network } from "@aptos-labs/ts-sdk"
import { useWallet } from "@aptos-labs/wallet-adapter-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { orpc } from "../../utils/orpc"

export const Route = createFileRoute("/staking/")({
  component: StakingPage,
})

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS
const NODE_URL = import.meta.env.VITE_APTOS_NODE_URL

const aptos = new Aptos(
  new AptosConfig({
    network: NODE_URL?.includes("testnet") ? Network.TESTNET : Network.DEVNET,
    fullnode: NODE_URL,
  }),
)

const TIERS = [
  { id: 0, label: "30 Days", boost: "1.5x", boostBps: 150, description: "Short-term commitment" },
  { id: 1, label: "90 Days", boost: "2.0x", boostBps: 200, description: "Medium-term commitment" },
  { id: 2, label: "180 Days", boost: "3.0x", boostBps: 300, description: "Long-term commitment" },
]

/** Format QRM amount from base units (8 decimals) */
function formatQrm(amount: number): string {
  return (amount / 1e8).toFixed(2)
}

function StakingPage() {
  const { connected, account, signAndSubmitTransaction } = useWallet()
  const queryClient = useQueryClient()

  const [selectedTier, setSelectedTier] = useState(1)
  const [stakeAmount, setStakeAmount] = useState("")
  const [isStaking, setIsStaking] = useState(false)
  const [isUnstaking, setIsUnstaking] = useState(false)

  const addrStr = account?.address?.toString() ?? ""

  // Staking record from off-chain DB
  const { data: stakeData } = useQuery({
    ...orpc.staking.getStake.queryOptions({
      input: { stakerAddress: addrStr as `0x${string}` },
    }),
    enabled: !!addrStr && addrStr.length > 10,
  })

  const { data: boostData } = useQuery({
    ...orpc.staking.getBoost.queryOptions({
      input: { stakerAddress: addrStr as `0x${string}` },
    }),
    enabled: !!addrStr && addrStr.length > 10,
  })

  const stakeMutation = useMutation(orpc.staking.stake.mutationOptions())
  const unstakeMutation = useMutation(orpc.staking.unstake.mutationOptions())

  async function handleStake() {
    if (!connected || !account) {
      toast.error("Connect wallet first")
      return
    }
    const amountQrm = Number.parseFloat(stakeAmount)
    if (Number.isNaN(amountQrm) || amountQrm < 10) {
      toast.error("Minimum stake is 10 QRM")
      return
    }
    const amountBase = Math.floor(amountQrm * 1e8)
    setIsStaking(true)
    try {
      // 1. On-chain stake
      const payload = {
        function: `${CONTRACT_ADDRESS}::staking::stake`,
        functionArguments: [CONTRACT_ADDRESS, amountBase, selectedTier],
      }
      const result = await signAndSubmitTransaction({
        data: payload as InputEntryFunctionData,
      })
      await aptos.waitForTransaction({ transactionHash: result.hash })

      // 2. Record off-chain
      await stakeMutation.mutateAsync({
        stakerAddress: addrStr as `0x${string}`,
        amount: amountBase,
        tier: selectedTier as 0 | 1 | 2,
        aptosTxHash: result.hash as `0x${string}`,
      })

      toast.success(`Staked ${amountQrm} QRM for ${TIERS[selectedTier]?.label}!`)
      setStakeAmount("")
      queryClient.invalidateQueries({
        queryKey: orpc.staking.getStake.queryOptions({
          input: { stakerAddress: addrStr as `0x${string}` },
        }).queryKey,
      })
      queryClient.invalidateQueries({
        queryKey: orpc.staking.getBoost.queryOptions({
          input: { stakerAddress: addrStr as `0x${string}` },
        }).queryKey,
      })
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to stake")
    } finally {
      setIsStaking(false)
    }
  }

  async function handleUnstake() {
    if (!connected || !account) return
    setIsUnstaking(true)
    try {
      const payload = {
        function: `${CONTRACT_ADDRESS}::staking::unstake`,
        functionArguments: [CONTRACT_ADDRESS],
      }
      const result = await signAndSubmitTransaction({
        data: payload as InputEntryFunctionData,
      })
      await aptos.waitForTransaction({ transactionHash: result.hash })

      await unstakeMutation.mutateAsync({
        stakerAddress: addrStr as `0x${string}`,
      })

      toast.success("Unstaked successfully!")
      queryClient.invalidateQueries()
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to unstake")
    } finally {
      setIsUnstaking(false)
    }
  }

  const isLocked = stakeData ? new Date() < new Date(stakeData.unlockAt) : false
  const daysLeft = stakeData
    ? Math.ceil((new Date(stakeData.unlockAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0

  return (
    <div className="min-h-screen pt-28 pb-20 px-6 font-['Inter']">
      <div className="max-w-[800px] mx-auto">
        {/* Header */}
        <div className="mb-12">
          <div className="text-xs font-bold tracking-[0.25em] uppercase text-tertiary mb-3">
            Token Economy
          </div>
          <h1 className="text-4xl md:text-5xl font-headline font-bold text-on-surface tracking-tight mb-3">
            Stake <span className="text-gradient">QRM</span>
          </h1>
          <p className="text-on-surface-variant/80 max-w-lg">
            Stake QRM tokens to boost your voting power in all DAOs you're a member of. Longer
            lockup periods earn higher multipliers.
          </p>
        </div>

        {/* Current stake */}
        {stakeData && (
          <div className="mb-8 p-6 rounded-2xl border border-primary/20 bg-primary/5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-on-surface">Active Stake</h3>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                  isLocked ? "bg-teal-400/10 text-teal-400" : "bg-orange-400/10 text-orange-400"
                }`}
              >
                {isLocked ? `Locked — ${daysLeft}d left` : "Unlocked"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-on-surface">
                  {formatQrm(stakeData.amount)}
                </div>
                <div className="text-xs text-on-surface-variant/50">QRM Staked</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {(stakeData.boostBps / 100).toFixed(1)}x
                </div>
                <div className="text-xs text-on-surface-variant/50">Boost</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-on-surface">
                  {TIERS[stakeData.tier]?.label}
                </div>
                <div className="text-xs text-on-surface-variant/50">Lock Period</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleUnstake}
              disabled={isUnstaking || isLocked}
              className="w-full py-3 rounded-xl border border-outline-variant/20 text-on-surface-variant text-sm font-bold hover:bg-surface-container transition-all disabled:opacity-50"
            >
              {isUnstaking
                ? "Unstaking..."
                : isLocked
                  ? `Locked for ${daysLeft} more days`
                  : "Unstake"}
            </button>
            {isLocked && (
              <p className="text-xs text-orange-400/70 text-center mt-2">
                Early unstake available with 10% penalty
              </p>
            )}
          </div>
        )}

        {/* Boost display (no active stake) */}
        {!stakeData && boostData && (
          <div className="mb-8 p-4 rounded-xl border border-outline-variant/15 bg-surface-container/30 flex items-center gap-4">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/30">
              bolt
            </span>
            <div>
              <div className="text-sm font-bold text-on-surface-variant">Current Voting Boost</div>
              <div className="text-lg font-bold text-on-surface">
                {boostData.multiplier} — No active stake
              </div>
            </div>
          </div>
        )}

        {/* Tier selector */}
        {connected && (
          <div>
            <h3 className="text-lg font-bold text-on-surface mb-4">Stake QRM</h3>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {TIERS.map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedTier(tier.id)}
                  className={`p-5 rounded-2xl border text-left transition-all ${
                    selectedTier === tier.id
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-outline-variant/15 bg-surface-container/40 hover:border-primary/30"
                  }`}
                >
                  <div className="text-2xl font-black text-primary mb-1">{tier.boost}</div>
                  <div className="text-sm font-bold text-on-surface">{tier.label}</div>
                  <div className="text-xs text-on-surface-variant/50 mt-1">{tier.description}</div>
                  {selectedTier === tier.id && (
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider mt-2 block">
                      Selected
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label
                  htmlFor="stake-amount"
                  className="block text-xs font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider"
                >
                  Amount (QRM)
                </label>
                <input
                  id="stake-amount"
                  type="number"
                  min="10"
                  step="1"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  placeholder="Min: 10 QRM"
                  className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleStake}
                  disabled={isStaking || !stakeAmount}
                  className="px-8 py-3 rounded-xl bg-primary text-on-primary font-bold hover:shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-50 active:scale-95"
                >
                  {isStaking ? "Staking..." : "Stake"}
                </button>
              </div>
            </div>

            {/* Info */}
            <div className="mt-6 p-4 rounded-xl bg-surface-container/30 border border-outline-variant/10 text-xs text-on-surface-variant/60 space-y-1">
              <p>• Staked QRM boosts your voting power in ALL DAOs you're a member of</p>
              <p>• Effective VP = Base VP × Boost multiplier</p>
              <p>• Early unstake incurs a 10% penalty (returned to DAO treasury)</p>
              <p>• Adding more stake resets the lockup timer</p>
            </div>
          </div>
        )}

        {!connected && (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-4 block">
              lock
            </span>
            <p className="text-on-surface-variant/60">Connect your wallet to stake QRM tokens</p>
          </div>
        )}
      </div>
    </div>
  )
}
