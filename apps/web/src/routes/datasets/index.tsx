import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../../utils/orpc";
import { useWallet } from "@aptos-labs/wallet-adapter-react";

export const Route = createFileRoute("/datasets/")({
  component: DatasetsPage,
});

function DatasetsPage() {
  const { data: datasets, isLoading } = orpc.dataset.list.useQuery();

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-12">Dataset Marketplace</h1>
      <div className="grid gap-6 sm:grid-cols-2">
        {datasets?.map((ds) => (
          <div key={ds.id} className="rounded-[2rem] border border-neutral-800 bg-neutral-900/40 p-8">
            <h3 className="text-2xl font-bold mb-2">{ds.name}</h3>
            <p className="text-neutral-400 text-sm mb-6">{ds.description}</p>
            <div className="flex items-center gap-4 text-xs">
              <span className="bg-neutral-800 px-3 py-1 rounded-full text-neutral-400">
                Weight: {ds.totalWeight}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
