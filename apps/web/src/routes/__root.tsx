import { createRootRoute, Link, Outlet, ScrollRestoration } from "@tanstack/react-router";
import { Body, Head, Html, Meta, Scripts } from "@tanstack/react-router";
import { WalletProvider, WalletButton } from "../components/WalletButton";
import { Toaster } from "sonner";
import "@quorum/ui/globals.css";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <Html>
      <Head>
        <Meta />
      </Head>
      <Body>
        <WalletProvider>
          <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-500/30">
            {/* Navbar */}
            <nav className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-10">
                <Link to="/" className="flex items-center gap-2 group transition-opacity hover:opacity-90">
                  <span className="text-2xl">🏛️</span>
                  <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
                    QUORUM
                  </span>
                </Link>
                <div className="hidden md:flex gap-8 text-sm font-medium text-neutral-400">
                  <Link to="/" className="hover:text-white transition-colors [&.active]:text-white">
                    Home
                  </Link>
                  <Link to="/contribute" className="hover:text-white transition-colors [&.active]:text-white">
                    Contribute
                  </Link>
                  <Link to="/vote" className="hover:text-white transition-colors [&.active]:text-white">
                    Vote
                  </Link>
                  <Link to="/datasets" className="hover:text-white transition-colors [&.active]:text-white">
                    Datasets
                  </Link>
                  <Link to="/earnings" className="hover:text-white transition-colors [&.active]:text-white">
                    Earnings
                  </Link>
                  <Link to="/governance" className="hover:text-white transition-colors [&.active]:text-white">
                    Governance
                  </Link>
                </div>
              </div>
              <WalletButton />
            </nav>

            <main>
              <Outlet />
            </main>

            <footer className="border-t border-neutral-800 py-12 px-6">
              <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="flex items-center gap-2 grayscale opacity-50">
                  <span className="text-xl">🏛️</span>
                  <span className="text-lg font-bold tracking-tight">QUORUM</span>
                </div>
                <p className="text-neutral-500 text-sm">
                  Powered by Aptos & Shelby Protocol
                </p>
              </div>
            </footer>
          </div>
          <Toaster richColors position="top-right" />
        </WalletProvider>
        <ScrollRestoration />
        <Scripts />
      </Body>
    </Html>
  );
}
