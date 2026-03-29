import { Link } from "@tanstack/react-router"
import { WalletButton } from "../components/WalletButton"

export default function Header() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/15 shadow-[0px_24px_48px_rgba(0,0,0,0.4)]">
      <div className="flex justify-between items-center h-20 px-8 max-w-[1440px] mx-auto font-headline tracking-tight">
        <Link to="/" className="text-2xl font-bold tracking-tighter text-on-surface">
          Quorum
        </Link>
        <div className="hidden md:flex items-center gap-8">
          <Link
            to="/"
            className="text-on-surface-variant hover:text-on-surface transition-colors [&.active]:text-primary [&.active]:border-b-2 [&.active]:border-primary [&.active]:pb-1"
          >
            Ecosystem
          </Link>
          <Link
            to="/governance"
            className="text-on-surface-variant hover:text-on-surface transition-colors [&.active]:text-primary"
          >
            Governance
          </Link>
          <Link
            to="/datasets"
            className="text-on-surface-variant hover:text-on-surface transition-colors [&.active]:text-primary"
          >
            Datasets
          </Link>
          <Link
            to="/vote"
            className="text-on-surface-variant hover:text-on-surface transition-colors [&.active]:text-primary"
          >
            Vote
          </Link>
          <Link
            to="/contribute"
            className="text-on-surface-variant hover:text-on-surface transition-colors [&.active]:text-primary"
          >
            Docs
          </Link>
        </div>
        <WalletButton />
      </div>
    </nav>
  )
}
