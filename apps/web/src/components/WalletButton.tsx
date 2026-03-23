import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { PetraWallet } from "petra-plugin-wallet-adapter";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { cn } from "@quorum/ui/utils";

const wallets = [new PetraWallet()];

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <AptosWalletAdapterProvider plugins={wallets} autoConnect={true}>
      {children}
    </AptosWalletAdapterProvider>
  );
}

export function WalletButton() {
  const { connected, account, connect, disconnect, wallet } = useWallet();

  if (connected && account) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Connected</span>
          <span className="text-xs font-mono text-indigo-400">
            {account.address.slice(0, 6)}...{account.address.slice(-4)}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="rounded-lg bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 text-xs font-bold transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => connect("Petra" as any)}
      className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-sm font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
    >
      Connect Petra
    </button>
  );
}
