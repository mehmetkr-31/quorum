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

  const [selectedProtocol, setSelectedProtocol] = useState<
    "text" | "image" | "audio" | "structured"
  >("image")
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
        data: payload as any,
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
      const bytes = new Uint8Array(buffer)
      let binary = ""
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
      }
      const base64 = btoa(binary)

      const res = await submitMutation.mutateAsync({
        datasetId: selectedDatasetId,
        shelbyAccount,
        contributorAddress: account.address.toString(),
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
        data: payload as any,
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
    <main className="flex-grow pt-24 pb-24 px-6 dot-grid relative overflow-hidden">
      {/* Background Bloom */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-secondary/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Header */}
        <header className="mb-20">
          <h1 className="display-lg text-on-surface mb-6">
            Submit <span className="text-gradient">Contribution</span>
          </h1>
          <p className="text-on-surface-variant text-xl max-w-2xl leading-relaxed font-light">
            Add raw data to the Quorum dataset and earn future revenue. Your data is hashed,
            validated, and stored permanently on the Neural Void.
          </p>
        </header>

        {/* Data Type Selection (visual only) */}
        <section className="mb-16">
          <div className="flex items-center space-x-3 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <h2 className="label-sm text-primary">Select Protocol</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {(
              [
                { key: "text", icon: "description", label: "Text", sub: "NLP & LLM Training" },
                { key: "image", icon: "image", label: "Image", sub: "Computer Vision" },
                { key: "audio", icon: "mic", label: "Audio", sub: "Speech Synthesis" },
                {
                  key: "structured",
                  icon: "grid_view",
                  label: "Structured",
                  sub: "Tabular & JSON",
                },
              ] as const
            ).map(({ key, icon, label, sub }) => {
              const isActive = selectedProtocol === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedProtocol(key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setSelectedProtocol(key)
                    }
                  }}
                  className={`w-full text-left glass-card p-6 rounded-xl transition-all cursor-pointer group hover:-translate-y-1 ${isActive ? "ring-1 ring-primary/40 bg-surface-container-high/40" : ""}`}
                  style={{
                    border: isActive ? undefined : "1px solid rgba(255,255,255,0.05)",
                    background: "transparent",
                  }}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${isActive ? "bg-primary/20" : "bg-surface-container"}`}
                    >
                      <span
                        className={`material-symbols-outlined text-2xl transition-colors ${isActive ? "text-primary" : "text-on-surface-variant group-hover:text-primary"}`}
                        style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                      >
                        {icon}
                      </span>
                    </div>
                    {isActive && (
                      <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">
                        Active
                      </span>
                    )}
                  </div>
                  <h3 className="font-headline font-bold text-on-surface tracking-tight">
                    {label}
                  </h3>
                  <p className="text-[11px] text-on-surface-variant mt-1.5 font-medium">{sub}</p>
                </button>
              )
            })}
          </div>
        </section>

        <form onSubmit={handleSubmit}>
          {/* Main Input Area */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
            <div className="lg:col-span-2 space-y-6">
              {/* Dataset select dropdown */}
              <div className="glass-card rounded-2xl p-8 space-y-4">
                <label htmlFor="datasetId" className="label-sm block">
                  Target Dataset
                </label>
                <select
                  id="datasetId"
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  required
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-4 text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                >
                  <option value="">Select a dataset...</option>
                  {datasets?.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Shelby Account input */}
              <div className="glass-card rounded-2xl p-8 space-y-4">
                <label htmlFor="shelbyAccount" className="label-sm block">
                  Shelby Protocol Account
                </label>
                <input
                  id="shelbyAccount"
                  type="text"
                  value={shelbyAccount}
                  onChange={(e) => setShelbyAccount(e.target.value)}
                  placeholder="shelby://..."
                  required
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-4 text-on-surface placeholder:text-outline-variant focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                />
              </div>

              {/* File Uploader */}
              <div
                className="glass-card rounded-xl p-12 flex flex-col items-center justify-center text-center hover:border-primary/50 transition-all group bg-surface-container-low/20"
                style={{ border: "2px dashed rgba(66,71,84,0.3)" }}
              >
                <div className="w-20 h-20 rounded-full bg-surface-container flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-4xl text-primary">
                    cloud_upload
                  </span>
                </div>
                <h4 className="text-xl font-headline font-bold text-on-surface mb-2">
                  {file ? file.name : "Drop your files here"}
                </h4>
                <p className="text-on-surface-variant text-sm mb-6">
                  Support for any file type (Max 500MB)
                </p>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={!isMember}
                  className="px-10 py-3 rounded-xl bg-surface-container-high text-on-surface font-bold ghost-border hover:bg-surface-bright transition-all disabled:opacity-50 active:scale-95"
                >
                  Browse Files
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                  className="hidden"
                  disabled={!isMember}
                />
              </div>

              {/* File Preview Section */}
              {file && (
                <div
                  className="glass-card rounded-xl p-6"
                  style={{ border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <h3 className="text-sm font-headline font-bold text-on-surface-variant mb-3 flex items-center justify-between uppercase tracking-wider">
                    <span>Preview: {file.name}</span>
                    <span className="text-xs font-mono text-outline-variant normal-case tracking-normal">
                      {(file.size / 1024).toFixed(2)} KB
                    </span>
                  </h3>
                  <div className="bg-surface-container-lowest rounded-lg p-4 overflow-hidden border border-outline-variant/20">
                    {previewType === "image" && previewContent ? (
                      <img
                        src={previewContent}
                        alt="Preview"
                        className="max-h-64 object-contain mx-auto rounded"
                      />
                    ) : previewType === "text" && previewContent ? (
                      <pre className="text-xs text-on-surface-variant font-mono whitespace-pre-wrap overflow-y-auto max-h-64 scrollbar-thin">
                        {previewContent}
                      </pre>
                    ) : previewType === "unsupported" ? (
                      <div className="text-center py-8 text-outline-variant">
                        <p>Binary or unsupported file format.</p>
                        <p className="text-xs mt-1">
                          Preview is not available, but you can still submit.
                        </p>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-outline-variant animate-pulse">
                        Loading preview...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Console & Summary right panel */}
            <div className="lg:col-span-1 space-y-6">
              <div
                className="glass-card rounded-xl overflow-hidden flex flex-col h-full"
                style={{ borderColor: "rgba(173,198,255,0.1)" }}
              >
                <div className="bg-surface-container p-4 flex items-center justify-between border-b border-outline-variant/10">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-error animate-pulse" />
                    <span className="text-[10px] font-mono font-bold text-on-surface-variant uppercase">
                      Contribution Console
                    </span>
                  </div>
                  <span className="material-symbols-outlined text-xs text-outline-variant">
                    terminal
                  </span>
                </div>
                <div className="p-6 font-mono text-xs flex-grow space-y-4 bg-surface-container-lowest">
                  <div>
                    <p className="text-tertiary/60 mb-1">{/* // Initialization... */}</p>
                    <p className="text-on-surface-variant">Protocol: ImageV3.2</p>
                  </div>
                  <div>
                    <p className="text-primary/60 mb-1">DATA_HASH:</p>
                    <p className="text-on-surface truncate">0x4f8e21c97a53b2d1109a9c...</p>
                  </div>
                  <div>
                    <p className="text-secondary/60 mb-1">SHELBY_BLOB:</p>
                    <p className="text-on-surface truncate">
                      {shelbyAccount || "shelby://blob_8821_42af_99x"}
                    </p>
                  </div>
                  <div className="pt-4 border-t border-outline-variant/10">
                    <p className="text-on-surface-variant">
                      {status === "uploading"
                        ? "Uploading to Shelby..."
                        : status === "signing"
                          ? "Signing on Aptos..."
                          : status === "done"
                            ? "✓ Submitted successfully!"
                            : "Ready for transmission..."}
                    </p>
                  </div>
                </div>
                <div className="p-6 bg-surface-container-low">
                  <div className="flex justify-between mb-3 items-center">
                    <span className="label-sm !text-[9px] !normal-case opacity-60">
                      Estimated Reward
                    </span>
                    <span className="text-primary font-black tracking-tighter">14.2 QRM</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="label-sm !text-[9px] !normal-case opacity-60">
                      Gas Estimate
                    </span>
                    <span className="text-on-surface-variant text-[11px] font-mono">
                      0.0004 APT
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* DAO Join banner (if not member) */}
          {!isMember && connected && (
            <div className="mb-8 p-6 glass-card rounded-2xl border border-tertiary/20 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-headline font-bold text-tertiary">
                  Join the DAO to Contribute
                </h3>
                <p className="text-sm text-on-surface-variant">
                  You need to register as a DAO member first.
                </p>
              </div>
              <button
                type="button"
                onClick={handleJoinDAO}
                disabled={isJoining || isMember === null}
                className="px-8 py-3 rounded-xl bg-tertiary/10 border border-tertiary/30 text-tertiary font-bold hover:bg-tertiary/20 transition-all disabled:opacity-50"
              >
                {isJoining ? "Joining DAO..." : "Join DAO Now"}
              </button>
            </div>
          )}

          {/* Final Action Bar */}
          <div
            className="flex flex-col md:flex-row items-center justify-between gap-6 p-8 glass-card rounded-2xl border border-primary/20"
            style={{ background: "linear-gradient(to right, #1e1f24, rgba(41,42,47,0.4))" }}
          >
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span
                  className="material-symbols-outlined text-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  security
                </span>
              </div>
              <div>
                <h4 className="font-headline font-bold text-on-surface">DAO Validation Check</h4>
                <p className="text-xs text-on-surface-variant">
                  Your contribution will be reviewed by the Quorum oracle network.
                </p>
              </div>
            </div>
            <button
              type="submit"
              disabled={status === "uploading" || status === "signing" || !connected || !isMember}
              className="w-full md:w-auto px-16 py-5 rounded-2xl bg-gradient-primary text-surface font-headline font-black text-xl tracking-tight shadow-[0_0_40px_rgba(173,198,255,0.2)] hover:scale-[1.03] active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
            >
              {status === "uploading"
                ? "TRANSMITTING..."
                : status === "signing"
                  ? "AUTHORIZING..."
                  : "SUBMIT_TO_DAO"}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
