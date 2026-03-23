import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { orpc } from "../../utils/orpc";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { toast } from "sonner";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

export const Route = createFileRoute("/contribute/")({
  component: ContributePage,
});

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const NODE_URL = import.meta.env.VITE_APTOS_NODE_URL;

function ContributePage() {
  const { connected, account, signAndSubmitTransaction } = useWallet();
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [shelbyAccount, setShelbyAccount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "signing" | "done" | "error">("idle");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: datasets } = orpc.dataset.list.useQuery();
  const submitMutation = orpc.contribution.submit.useMutation();
  const confirmMutation = orpc.contribution.confirmOnChain.useMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!connected || !account || !file || !selectedDatasetId || !shelbyAccount) return;

    setStatus("uploading");
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

      const res = await submitMutation.mutateAsync({
        input: {
          datasetId: selectedDatasetId,
          contributorAddress: account.address,
          shelbyAccount,
          data: base64,
          contentType: file.type || "application/octet-stream",
        },
      });

      setStatus("signing");
      
      const payload = {
        function: `${CONTRACT_ADDRESS}::dao_governance::submit_contribution`,
        functionArguments: [
          CONTRACT_ADDRESS,
          Array.from(new TextEncoder().encode(res.id)),
          Array.from(new TextEncoder().encode(selectedDatasetId)),
          Array.from(new TextEncoder().encode(res.shelbyAccount)),
          Array.from(new TextEncoder().encode(res.shelbyBlobName)),
          Array.from(new Uint8Array(res.dataHash.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))),
        ],
      };

      const result = await signAndSubmitTransaction({
        data: payload as any,
      });

      await confirmMutation.mutateAsync({
        input: { id: res.id, aptosTxHash: result.hash },
      });

      setStatus("done");
      toast.success("Contribution submitted successfully!");
    } catch (e: any) {
      console.error(e);
      setStatus("error");
      toast.error(e.message || "Contribution failed");
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
          <label className="block text-sm font-semibold text-neutral-300">Dataset</label>
          <select
            value={selectedDatasetId}
            onChange={(e) => setSelectedDatasetId(e.target.value)}
            className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 outline-none"
            required
          >
            <option value="">Select a dataset...</option>
            {datasets?.map((ds) => (
              <option key={ds.id} value={ds.id}>{ds.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold text-neutral-300">Shelby Account</label>
          <input
            type="text"
            value={shelbyAccount}
            onChange={(e) => setShelbyAccount(e.target.value)}
            placeholder="shelby://..."
            className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 outline-none font-mono"
            required
          />
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          className="cursor-pointer rounded-2xl border-2 border-dashed border-neutral-800 p-12 text-center hover:border-neutral-600 transition-all"
        >
          {file ? file.name : "Click to select file"}
          <input
            ref={fileRef}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </div>

        <button
          type="submit"
          disabled={status === "uploading" || status === "signing" || !connected}
          className="w-full rounded-xl bg-indigo-600 py-4 font-bold disabled:opacity-50"
        >
          {status === "uploading" ? "Uploading..." : status === "signing" ? "Signing..." : "Submit to DAO"}
        </button>
      </form>
    </div>
  );
}
