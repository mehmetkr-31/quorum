import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "../../utils/orpc";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { toast } from "sonner";

export const Route = createFileRoute("/vote/")({
  component: VotePage,
});

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

function VotePage() {
  const { connected, account, signAndSubmitTransaction } = useWallet();
  const { data: pending, isLoading, refetch } = useQuery(
    orpc.contribution.list.queryOptions({
      input: { status: "pending" },
    }),
  );
  const castMutation = useMutation(orpc.vote.cast.mutationOptions());

  async function handleVote(contributionId: string, decision: "approve" | "reject" | "improve") {
    if (!connected || !account) return;

    try {
      const decisionValue = decision === "approve" ? 0 : decision === "reject" ? 1 : 2;
      const payload = {
        function: `${CONTRACT_ADDRESS}::dao_governance::cast_vote`,
        functionArguments: [CONTRACT_ADDRESS, Array.from(new TextEncoder().encode(contributionId)), decisionValue],
      };

      const result = await signAndSubmitTransaction({ data: payload as any });

      await castMutation.mutateAsync({
        input: {
          contributionId,
          voterAddress: account.address,
          decision,
          aptosTxHash: result.hash,
        },
      });

      toast.success(`Vote cast: ${decision}`);
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Vote failed");
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-8">Curation Queue</h1>
      {isLoading ? (
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-neutral-900 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {pending?.map((c) => (
            <div key={c.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-xs font-mono text-indigo-400 mb-1">{c.id}</p>
                  <p className="text-sm text-neutral-500">Contributor: {c.contributorAddress.slice(0, 10)}...</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVote(c.id, "approve")}
                    className="px-4 py-2 bg-teal-600 rounded-lg text-sm font-bold"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleVote(c.id, "reject")}
                    className="px-4 py-2 bg-red-600 rounded-lg text-sm font-bold"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
