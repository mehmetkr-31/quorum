import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk"
import { useWallet } from "@aptos-labs/wallet-adapter-react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { orpc } from "../../utils/orpc"

export const Route = createFileRoute("/contribute/")({
  component: ContributePage,
})

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS
const NODE_URL = import.meta.env.VITE_APTOS_NODE_URL

const aptos = new Aptos(
  new AptosConfig({
    network: NODE_URL?.includes("testnet") ? Network.TESTNET : Network.DEVNET,
    fullnode: NODE_URL,
  }),
)

function ContributePage() {
  const { connected, account, signAndSubmitTransaction } = useWallet()
  const [selectedDatasetId, setSelectedDatasetId] = useState("")
  const [shelbyAccount, setShelbyAccount] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [previewType, setPreviewType] = useState<"image" | "text" | "unsupported" | null>(null)
  const [status, setStatus] = useState<"idle" | "uploading" | "signing" | "done" | "error">("idle")
  const fileRef = useRef<HTMLInputElement>(null)

  const [isMember, setIsMember] = useState<boolean | null>(null)
  const [isJoining, setIsJoining] = useState(false)

  const { data: datasets } = useQuery(orpc.dataset.list.queryOptions())
  const submitMutation = useMutation(orpc.contribution.submit.mutationOptions())
  const confirmMutation = useMutation(orpc.contribution.confirmOnChain.mutationOptions())

  // Handle file selection and preview generation
  function handleFileChange(selectedFile: File | null) {
    setFile(selectedFile)
    setPreviewContent(null)
    setPreviewType(null)

    if (!selectedFile) return

    const fileType = selectedFile.type

    if (fileType.startsWith("image/")) {
      setPreviewType("image")
      const reader = new FileReader()
      reader.onload = (e) => setPreviewContent(e.target?.result as string)
      reader.readAsDataURL(selectedFile)
    } else if (
      fileType.startsWith("text/") ||
      fileType === "application/json" ||
      fileType === "application/javascript" ||
      selectedFile.name.endsWith(".md") ||
      selectedFile.name.endsWith(".ts")
    ) {
      setPreviewType("text")
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        // Preview only first 1000 characters
        setPreviewContent(
          text.slice(0, 1000) + (text.length > 1000 ? "\n\n... (truncated for preview)" : ""),
        )
      }
      reader.readAsText(selectedFile)
    } else {
      setPreviewType("unsupported")
    }
  }

  // Check if the connected wallet is registered as a DAO Member
  useEffect(() => {
    async function checkMembership() {
      if (!account?.address) return
      try {
        const resource = await aptos.getAccountResource({
          accountAddress: account.address.toString(),
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
    checkMembership()
  }, [account?.address?.toString(), isJoining])

  async function handleJoinDAO() {
    if (!connected || !account) return
    setIsJoining(true)
    try {
      const payload = {
        function: `${CONTRACT_ADDRESS}::dao_governance::register_member`,
        functionArguments: [],
      }
      const result = await signAndSubmitTransaction({
        data: payload as {
          function: `${string}::${string}::${string}`
          functionArguments: unknown[]
        },
      })
      await aptos.waitForTransaction({ transactionHash: result.hash })
      setIsMember(true)
      toast.success("Successfully joined the DAO!")
    } catch (e: unknown) {
      console.error(e)
      toast.error((e as Error).message || "Failed to join DAO")
    } finally {
      setIsJoining(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!connected || !account || !file || !selectedDatasetId || !shelbyAccount) return

    setStatus("uploading")
    try {
      const buffer = await file.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))

      const res = await submitMutation.mutateAsync({
        datasetId: selectedDatasetId,
        shelbyAccount,
        data: base64,
        contentType: file.type || "application/octet-stream",
      })

      setStatus("signing")

      const payload = {
        function: `${CONTRACT_ADDRESS}::dao_governance::submit_contribution`,
        functionArguments: [
          CONTRACT_ADDRESS,
          Array.from(new TextEncoder().encode(res.id)),
          Array.from(new TextEncoder().encode(selectedDatasetId)),
          Array.from(new TextEncoder().encode(res.shelbyAccount)),
          Array.from(new TextEncoder().encode(res.shelbyBlobName)),
          Array.from(
            new Uint8Array((res.dataHash.match(/.{1,2}/g) ?? []).map((byte) => parseInt(byte, 16))),
          ),
        ],
      }

      const result = await signAndSubmitTransaction({
        data: payload as {
          function: `${string}::${string}::${string}`
          functionArguments: unknown[]
        },
      })

      await confirmMutation.mutateAsync({
        id: res.id,
        aptosTxHash: result.hash,
      })

      setStatus("done")
      toast.success("Contribution submitted successfully!")
    } catch (e: unknown) {
      console.error(e)
      setStatus("error")
      toast.error((e as Error).message || "Contribution failed")
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-4 tracking-tight">Contribute Data</h1>
      <p className="text-neutral-400 mb-8">
        Upload high-quality data to Shelby and register it on Aptos.
      </p>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="space-y-2">
          <label htmlFor="datasetId" className="block text-sm font-semibold text-neutral-300">
            Dataset
          </label>
          <select
            id="datasetId"
            value={selectedDatasetId}
            onChange={(e) => setSelectedDatasetId(e.target.value)}
            className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 outline-none"
            required
          >
            <option value="">Select a dataset...</option>
            {datasets?.map((ds) => (
              <option key={ds.id} value={ds.id}>
                {ds.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="shelbyAccount" className="block text-sm font-semibold text-neutral-300">
            Shelby Account
          </label>
          <input
            id="shelbyAccount"
            type="text"
            value={shelbyAccount}
            onChange={(e) => setShelbyAccount(e.target.value)}
            placeholder="shelby://..."
            className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 outline-none font-mono"
            required
          />
        </div>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={!isMember}
          className="w-full cursor-pointer rounded-2xl border-2 border-dashed border-neutral-800 p-12 text-center hover:border-neutral-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {file ? file.name : "Click to select file"}
          <input
            ref={fileRef}
            type="file"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            className="hidden"
            disabled={!isMember}
          />
        </button>

        {/* File Preview Section */}
        {file && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
            <h3 className="text-sm font-bold text-neutral-300 mb-2 flex items-center justify-between">
              <span>Preview: {file.name}</span>
              <span className="text-xs font-mono text-neutral-500">
                {(file.size / 1024).toFixed(2)} KB
              </span>
            </h3>

            <div className="bg-neutral-950 rounded-lg p-4 overflow-hidden border border-neutral-800/50">
              {previewType === "image" && previewContent ? (
                <img
                  src={previewContent}
                  alt="Preview"
                  className="max-h-64 object-contain mx-auto rounded"
                />
              ) : previewType === "text" && previewContent ? (
                <pre className="text-xs text-neutral-400 font-mono whitespace-pre-wrap overflow-y-auto max-h-64 scrollbar-thin">
                  {previewContent}
                </pre>
              ) : previewType === "unsupported" ? (
                <div className="text-center py-8 text-neutral-500">
                  <p>Binary or unsupported file format.</p>
                  <p className="text-xs mt-1">
                    Preview is not available, but you can still submit.
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 text-neutral-500 animate-pulse">
                  Loading preview...
                </div>
              )}
            </div>
          </div>
        )}

        {!isMember ? (
          <button
            type="button"
            onClick={handleJoinDAO}
            disabled={isJoining || isMember === null}
            className="w-full rounded-xl bg-teal-600 py-4 font-bold disabled:opacity-50"
          >
            {isJoining ? "Joining DAO..." : "Join DAO First to Contribute"}
          </button>
        ) : (
          <button
            type="submit"
            disabled={status === "uploading" || status === "signing" || !connected}
            className="w-full rounded-xl bg-indigo-600 py-4 font-bold disabled:opacity-50"
          >
            {status === "uploading"
              ? "Uploading..."
              : status === "signing"
                ? "Signing..."
                : "Submit to DAO"}
          </button>
        )}
      </form>
    </div>
  )
}
