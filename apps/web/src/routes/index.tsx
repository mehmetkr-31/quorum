import { useWallet } from "@aptos-labs/wallet-adapter-react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { toast } from "sonner"
import { orpc } from "../utils/orpc"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  const { connect, wallets, connected } = useWallet()

  async function handleConnectWallet() {
    if (connected) return
    const wallet = wallets?.[0]
    if (!wallet) {
      toast.error("Petra wallet bulunamadı. Lütfen eklentiyi yükleyin.")
      return
    }
    try {
      await connect(wallet.name)
    } catch (_e) {
      toast.error("Bağlantı başarısız.")
    }
  }

  const { data: datasets } = useQuery(
    orpc.dataset.list.queryOptions({
      input: { limit: 6 },
    }),
  )
  const { data: stats } = useQuery(orpc.governance.getStats.queryOptions())

  return (
    <main className="relative">
      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden pt-20">
        <div className="absolute inset-0 dot-grid pointer-events-none" />
        <div className="relative z-10 max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-outline-variant/20 bg-surface-container-low mb-8">
            <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
            <span className="text-xs font-medium text-on-surface-variant uppercase tracking-widest">
              Mainnet Beta Now Live
            </span>
          </div>
          <h1 className="font-headline text-5xl md:text-8xl font-bold tracking-tighter leading-[0.9] mb-8">
            The community <span className="text-gradient">builds it.</span>
            <br />
            The community <span className="text-gradient">votes on it.</span>
            <br />
            The community <span className="text-gradient">earns from it.</span>
          </h1>
          <p className="font-body text-on-surface-variant text-lg md:text-xl max-w-2xl mx-auto mb-12">
            Quorum is the first decentralized autonomous organization dedicated to curating
            high-fidelity AI training sets through collective intelligence.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link to="/contribute">
              <button
                type="button"
                className="bg-gradient-primary text-on-primary px-10 py-4 rounded-full font-bold text-sm uppercase tracking-widest shadow-[0_0_30px_rgba(173,198,255,0.3)] hover:scale-105 transition-transform"
              >
                Start Contributing
              </button>
            </Link>
            <Link to="/datasets">
              <button
                type="button"
                className="glass-card px-10 py-4 rounded-full font-bold text-sm uppercase tracking-widest text-on-surface border border-outline-variant/30 hover:bg-surface-bright/20 transition-all"
              >
                Explore Datasets
              </button>
            </Link>
          </div>
        </div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[1200px] h-[400px] opacity-20 pointer-events-none">
          <img
            className="w-full h-full object-cover rounded-t-full"
            alt="Abstract futuristic visualization of interconnected neural networks"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBxXF2aI46NpKBY9AZ_zFhvkBJBo-YRqEMSxbev7jmGgPn_jXNcAfvNr3zgoUnCyhFfU0DBbGOLxgI3DVC_srmBvhfia45LHg5mnILPvR2mn9iULe1vny2Jnp319ZFjAUgnY59t4Y2LDvFyz176C-cKEGQM8MeFI6Rzf0ekhd7_unlGfkcYZYtv-MhIY4iSLyOecqdL5DHrKPNwk9CRgx8hUbvUdyx0IJEsNobvkPaOlQe5ZN7VbJlDrS42YPv-Z3LANOw8GwEgVB0"
          />
        </div>
      </section>

      {/* The Paradigm Shift (Bento Grid) */}
      <section className="py-32 px-8 max-w-[1440px] mx-auto">
        <div className="mb-20 space-y-4">
          <h2 className="font-headline text-4xl md:text-6xl font-bold tracking-tighter">
            The Paradigm Shift
          </h2>
          <p className="text-on-surface-variant max-w-xl">
            Breaking the silos of centralized data collection with an open, incentivized, and
            verifiable ecosystem.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Large Card */}
          <div className="md:col-span-8 glass-card rounded-xl p-10 flex flex-col justify-between group hover:border-primary/30 transition-all duration-500">
            <div className="space-y-6">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined">account_tree</span>
              </div>
              <h3 className="text-3xl font-bold tracking-tight">Collective Data Sourcing</h3>
              <p className="text-on-surface-variant text-lg">
                Instead of narrow data harvesting by tech giants, Quorum leverages thousands of
                individual contributors to provide diverse, edge-case rich datasets that machines
                actually need to learn.
              </p>
            </div>
            <div className="mt-12 h-48 bg-surface-container-low rounded-lg overflow-hidden relative">
              <img
                className="w-full h-full object-cover opacity-50"
                alt="High-density data stream visualization with floating particles and glowing lines"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuB2gLiGfJ5QCxGx9Nnp3352wgfnJqGXObjH8tGb9kROuv-Y3RVkJR6JhSq4icegB6sZuY-CDwNvOk_0QaxsO9GbEv4zkXJzjZo59_xH1Ux5ORvVIIwTVSyL7IJCOtsYWJh3XN9iOqCHE1HjNItb-fd94M1zIjeOZoGwmPD6tnT4JXfW_afxLmf5YLFrZQ0byseJDYF8tErc-yUgof95uOTQ2lodiOQzujzT28WJStqYu8YTcVKvMOa55iwF1RN9jIPGajdN5lN9RD4"
              />
            </div>
          </div>

          {/* Small Card 1 */}
          <div className="md:col-span-4 glass-card rounded-xl p-8 flex flex-col space-y-6 group hover:border-secondary/30 transition-all duration-500">
            <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined">how_to_vote</span>
            </div>
            <h3 className="text-2xl font-bold">Community Curation</h3>
            <p className="text-on-surface-variant">
              Every dataset entry is verified by the DAO. Quality is not determined by an algorithm,
              but by human consensus and reputation.
            </p>
            <div className="flex-grow" />
            <div className="p-4 bg-surface-container rounded-lg border border-outline-variant/10">
              <div className="flex items-center justify-between text-xs mb-2">
                <span>Verification Hash</span>
                <span className="text-tertiary">0x88...f2a</span>
              </div>
              <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
                <div className="h-full bg-tertiary w-3/4" />
              </div>
            </div>
          </div>

          {/* Small Card 2 */}
          <div className="md:col-span-4 glass-card rounded-xl p-8 flex flex-col space-y-6 group hover:border-tertiary/30 transition-all duration-500">
            <div className="w-12 h-12 rounded-xl bg-tertiary/10 flex items-center justify-center text-tertiary">
              <span className="material-symbols-outlined">token</span>
            </div>
            <h3 className="text-2xl font-bold">Shelby Protocol</h3>
            <p className="text-on-surface-variant">
              Proprietary revenue sharing mechanism ensuring every contributor receives a fair slice
              of the value their data generates.
            </p>
          </div>

          {/* Medium Card */}
          <div className="md:col-span-8 glass-card rounded-xl p-10 flex items-center gap-8 group hover:border-primary/30 transition-all duration-500">
            <div className="w-1/2 space-y-6">
              <h3 className="text-3xl font-bold tracking-tight">On-Chain Transparency</h3>
              <p className="text-on-surface-variant">
                Powered by Aptos for sub-second finality and absolute auditability of data
                provenance and reward distribution.
              </p>
              <div className="flex gap-4">
                <span className="text-sm font-mono text-tertiary">#Web3</span>
                <span className="text-sm font-mono text-tertiary">#AI_Safety</span>
                <span className="text-sm font-mono text-tertiary">#DAO</span>
              </div>
            </div>
            <div className="w-1/2 h-full rounded-lg bg-surface-container-lowest p-4 flex items-center justify-center">
              <img
                className="w-full h-full object-contain"
                alt="Futuristic digital node architecture with glowing geometric shapes representing a blockchain network"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBO7BMpLe-KlN-PPvAZ4RF0ZM37cl5MBjYFor73emnuxl3S34sSIS0oOHfpiqzVUMqPoMZF5gK6cDVR-hNOAgVIh_O7sP1nS_TScsdc0i7dn1scqlevrTJbJtnfJsTNFR2KUmpD4fS3IGf7O6VoCYyF6C9PkqlQH3F5zT_b1yTBTfzP_aTEBtvFprfqpHSsIhzbgTKIX8R8Km50aJnoMFcYTIhQuxfKJuBCk_9OAcMaqdijDpdLBSUs4mLRVflNI7VZ4lf6kbZOhmc"
              />
            </div>
          </div>
        </div>
      </section>

      {/* The Lifecycle of Data (Timeline) */}
      <section className="py-32 bg-surface-container-lowest relative overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-5" />
        <div className="max-w-4xl mx-auto px-8 relative z-10">
          <div className="text-center mb-24">
            <h2 className="font-headline text-4xl md:text-6xl font-bold mb-6">
              The Lifecycle of Data
            </h2>
            <p className="text-on-surface-variant">
              From raw contribution to decentralized intelligence.
            </p>
          </div>
          <div className="space-y-24 relative">
            <div className="absolute left-8 top-4 bottom-4 w-px bg-gradient-to-b from-primary via-secondary to-tertiary opacity-30" />

            <div className="relative pl-24 group">
              <div className="absolute left-4 top-0 w-8 h-8 rounded-full bg-surface border-2 border-primary flex items-center justify-center text-primary z-20 group-hover:scale-110 transition-transform">
                <span className="text-xs font-bold">01</span>
              </div>
              <h3 className="text-2xl font-bold mb-4">Submit Contribution</h3>
              <p className="text-on-surface-variant leading-relaxed">
                Upload raw text, images, or audio snippets. Our validation engine pre-screens for
                basic formatting while preserving your privacy through zero-knowledge proofs.
              </p>
            </div>

            <div className="relative pl-24 group">
              <div className="absolute left-4 top-0 w-8 h-8 rounded-full bg-surface border-2 border-secondary flex items-center justify-center text-secondary z-20 group-hover:scale-110 transition-transform">
                <span className="text-xs font-bold">02</span>
              </div>
              <h3 className="text-2xl font-bold mb-4">DAO Votes</h3>
              <p className="text-on-surface-variant leading-relaxed">
                Token holders review submissions in the Governance Portal. Only data that meets the
                strict community-defined quality standards is merged into the master dataset.
              </p>
            </div>

            <div className="relative pl-24 group">
              <div className="absolute left-4 top-0 w-8 h-8 rounded-full bg-surface border-2 border-tertiary flex items-center justify-center text-tertiary z-20 group-hover:scale-110 transition-transform">
                <span className="text-xs font-bold">03</span>
              </div>
              <h3 className="text-2xl font-bold mb-4">AI Teams Access</h3>
              <p className="text-on-surface-variant leading-relaxed">
                Top-tier AI labs lease dataset access via the Shelby Protocol. Payments are handled
                automatically on-chain, ensuring immediate settlement without intermediaries.
              </p>
            </div>

            <div className="relative pl-24 group">
              <div className="absolute left-4 top-0 w-8 h-8 rounded-full bg-surface border-2 border-primary flex items-center justify-center text-primary z-20 group-hover:scale-110 transition-transform">
                <span className="text-xs font-bold">04</span>
              </div>
              <h3 className="text-2xl font-bold mb-4">Earn Revenue</h3>
              <p className="text-on-surface-variant leading-relaxed">
                Revenue flows back to the DAO treasury and directly to contributors' wallets based
                on the weight and utility of their verified contributions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Live Network Metrics */}
      <section className="py-32 px-8 max-w-[1440px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <h2 className="font-headline text-4xl md:text-6xl font-bold leading-tight">
              Live Network <br />
              <span className="text-tertiary">Metrics</span>
            </h2>
            <p className="text-on-surface-variant text-lg">
              Real-time status of the Quorum ecosystem, secured by Aptos and optimized by the Shelby
              Protocol.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 bg-surface-container-low rounded-xl border border-outline-variant/10">
                <span className="text-xs text-on-surface-variant uppercase tracking-widest block mb-2">
                  Total Datasets
                </span>
                <span className="text-3xl font-bold font-headline">{datasets?.length ?? 1402}</span>
              </div>
              <div className="p-6 bg-surface-container-low rounded-xl border border-outline-variant/10">
                <span className="text-xs text-on-surface-variant uppercase tracking-widest block mb-2">
                  DAO Members
                </span>
                <span className="text-3xl font-bold font-headline">
                  {stats?.totalMembers ? `${stats.totalMembers.toLocaleString()}` : "84.2k"}
                </span>
              </div>
              <div className="p-6 bg-surface-container-low rounded-xl border border-outline-variant/10">
                <span className="text-xs text-on-surface-variant uppercase tracking-widest block mb-2">
                  Network TPS
                </span>
                <span className="text-3xl font-bold font-headline text-tertiary">12.4k</span>
              </div>
              <div className="p-6 bg-surface-container-low rounded-xl border border-outline-variant/10">
                <span className="text-xs text-on-surface-variant uppercase tracking-widest block mb-2">
                  Yield Distributed
                </span>
                <span className="text-3xl font-bold font-headline text-primary">
                  {stats?.totalRevenue ? `$${stats.totalRevenue}` : "$4.1M"}
                </span>
              </div>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-secondary rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000" />
            <div className="relative bg-surface p-8 rounded-2xl border border-outline-variant/20">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-error animate-pulse" />
                  <span className="font-mono text-sm uppercase tracking-tighter">
                    Live Protocol Stream
                  </span>
                </div>
                <span className="text-on-surface-variant text-xs font-mono">Uptime: 99.99%</span>
              </div>
              <div className="space-y-4 font-mono text-xs">
                <div className="flex gap-4 text-on-surface-variant border-b border-outline-variant/10 pb-2">
                  <span className="w-16">09:41:02</span>
                  <span className="text-tertiary">[COMMIT]</span>
                  <span>Dataset #4902 verified by Validator Node_09</span>
                </div>
                <div className="flex gap-4 text-on-surface-variant border-b border-outline-variant/10 pb-2">
                  <span className="w-16">09:41:15</span>
                  <span className="text-primary">[REWARD]</span>
                  <span>14.5 QRM distributed to contributor 0x...b32</span>
                </div>
                <div className="flex gap-4 text-on-surface-variant border-b border-outline-variant/10 pb-2">
                  <span className="w-16">09:42:01</span>
                  <span className="text-secondary">[VOTE]</span>
                  <span>New Proposal: ImageNet-Redux v2.0 initiated</span>
                </div>
                <div className="flex gap-4 text-on-surface-variant border-b border-outline-variant/10 pb-2">
                  <span className="w-16">09:42:24</span>
                  <span className="text-tertiary">[SYNC]</span>
                  <span>Aptos Mainnet block finality reached in 0.4s</span>
                </div>
                <div className="flex gap-4 text-on-surface-variant">
                  <span className="w-16">09:43:05</span>
                  <span className="text-primary">[COMMIT]</span>
                  <span>Dataset #4903 ingress initiated...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-40 px-8">
        <div className="max-w-5xl mx-auto rounded-3xl bg-gradient-to-br from-[#121318] to-[#1a1b20] border border-outline-variant/20 p-12 md:p-20 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/3 w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/3 w-96 h-96 bg-secondary/10 rounded-full blur-[120px]" />
          <h2 className="font-headline text-4xl md:text-7xl font-bold tracking-tighter mb-8 relative z-10">
            Own the data that <br />
            powers the future.
          </h2>
          <p className="text-on-surface-variant text-lg max-w-xl mx-auto mb-12 relative z-10">
            Join the Quorum DAO today and help steer the development of ethical, high-quality AI
            models.
          </p>
          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-center gap-6">
            <button
              type="button"
              onClick={handleConnectWallet}
              className="bg-gradient-primary text-on-primary w-full sm:w-auto px-12 py-5 rounded-full font-bold text-lg uppercase tracking-widest shadow-2xl hover:scale-105 transition-all"
            >
              {connected ? "Wallet Connected" : "Connect Wallet"}
            </button>
            <Link to="/governance">
              <button
                type="button"
                className="text-on-surface hover:text-primary transition-colors font-bold uppercase tracking-widest flex items-center gap-2 group"
              >
                Read the Whitepaper
                <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
