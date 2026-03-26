import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Wallet adapter mock
const mockUseWallet = vi.fn()
vi.mock("@aptos-labs/wallet-adapter-react", () => ({
  AptosWalletAdapterProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useWallet: () => mockUseWallet(),
}))

// Aptos SDK mock
vi.mock("@aptos-labs/ts-sdk", () => ({
  Aptos: vi.fn().mockImplementation(() => ({
    getAccountResource: vi.fn().mockRejectedValue({ status: 404 }),
  })),
  AptosConfig: vi.fn(),
  Network: { TESTNET: "testnet", DEVNET: "devnet" },
}))

// Auth client mock
vi.mock("@/utils/auth-client", () => ({
  walletSignIn: vi.fn().mockResolvedValue(true),
  walletSignOut: vi.fn().mockResolvedValue(undefined),
}))

// sonner mock
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import { WalletButton, WalletProvider } from "@/components/WalletButton"

function renderWithProvider(ui: React.ReactElement) {
  return render(<WalletProvider>{ui}</WalletProvider>)
}

describe("WalletButton", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("bağlı değilken 'Connect Petra' butonu render eder", async () => {
    mockUseWallet.mockReturnValue({
      connected: false,
      account: null,
      disconnect: vi.fn(),
      connect: vi.fn(),
      wallets: [],
      signMessage: null,
    })
    renderWithProvider(<WalletButton />)
    expect(await screen.findByRole("button", { name: /Connect Petra/i })).toBeInTheDocument()
  })

  it("bağlıyken adresin kısaltılmış halini gösterir", () => {
    mockUseWallet.mockReturnValue({
      connected: true,
      account: {
        address: { toString: () => "0x1234567890abcdef" },
        publicKey: "0xpubkey",
      },
      disconnect: vi.fn(),
      connect: vi.fn(),
      wallets: [],
      signMessage: vi.fn(),
    })
    renderWithProvider(<WalletButton />)
    expect(screen.getByText(/0x1234\.\.\.cdef/i)).toBeInTheDocument()
  })

  it("bağlıyken Disconnect butonu görünür", () => {
    mockUseWallet.mockReturnValue({
      connected: true,
      account: {
        address: { toString: () => "0xaabbccddeeff0011" },
        publicKey: "0xpubkey",
      },
      disconnect: vi.fn(),
      connect: vi.fn(),
      wallets: [],
      signMessage: vi.fn(),
    })
    renderWithProvider(<WalletButton />)
    expect(screen.getByRole("button", { name: /Disconnect/i })).toBeInTheDocument()
  })

  it("Petra bulunamazsa bağlantı denemesinde hata toast gösterir", async () => {
    const { toast } = await import("sonner")
    mockUseWallet.mockReturnValue({
      connected: false,
      account: null,
      disconnect: vi.fn(),
      connect: vi.fn(),
      wallets: [],
      signMessage: null,
    })
    renderWithProvider(<WalletButton />)
    const btn = screen.getByRole("button", { name: /Connect Petra/i })
    await userEvent.click(btn)
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Petra"))
  })
})

describe("WalletProvider", () => {
  it("children'ı render eder", () => {
    mockUseWallet.mockReturnValue({
      connected: false,
      account: null,
      disconnect: vi.fn(),
      connect: vi.fn(),
      wallets: [],
      signMessage: null,
    })
    render(
      <WalletProvider>
        <div data-testid="child">test</div>
      </WalletProvider>,
    )
    expect(screen.getByTestId("child")).toBeInTheDocument()
  })
})
