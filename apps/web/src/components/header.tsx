import { Link } from "@tanstack/react-router"
import { WalletButton } from "../components/WalletButton"

export default function Header() {
  return (
    <nav className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-10">
        <Link to="/" className="flex items-center gap-2 group transition-opacity hover:opacity-90">
          <span className="text-2xl">🏛️</span>
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent uppercase">
            QUORUM
          </span>
        </Link>
        <div className="hidden md:flex gap-8 text-sm font-medium text-neutral-400">
          <Link to="/" className="hover:text-white transition-colors [&.active]:text-white">
            Home
          </Link>
          <Link
            to="/contribute"
            className="hover:text-white transition-colors [&.active]:text-white"
          >
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
          <Link
            to="/governance"
            className="hover:text-white transition-colors [&.active]:text-white"
          >
            Governance
          </Link>
        </div>
      </div>
      <WalletButton />
    </nav>
  )
}
