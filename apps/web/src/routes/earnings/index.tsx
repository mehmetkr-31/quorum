import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../../utils/orpc";
import { useWallet } from "@aptos-labs/wallet-adapter-react";

export const Route = createFileRoute("/earnings/")({
  component: EarningsPage,
});

function EarningsPage() {
  const { connected, account } = useWallet();
  const { data: earnings } = orpc.revenue.getEarnings.useQuery({
    input: { contributorAddress: account?.address ?? "" },
    enabled: !!connected && !!account,
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-12">My Earnings</h1>
      {!connected ? (
        <div className="p-12 border-2 border-dashed border-neutral-800 rounded-3xl text-center text-neutral-500">
          Connect your wallet to see your contribution weight and rewards.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-8 rounded-3xl bg-neutral-900 border border-neutral-800">
            <p className="text-sm font-bold text-neutral-500 uppercase tracking-widest mb-2">Approved Weight</p>
            <p className="text-5xl font-bold">{earnings?.totalWeight ?? 0}</p>
          </div>
          <div className="p-8 rounded-3xl bg-neutral-900 border border-neutral-800">
            <p className="text-sm font-bold text-neutral-500 uppercase tracking-widest mb-2">Approved Submissions</p>
            <p className="text-5xl font-bold">{earnings?.approvedContributions ?? 0}</p>
          </div>
        </div>
      )}
    </div>
  );
}
