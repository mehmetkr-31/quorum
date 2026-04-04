/**
 * E2E helpers — shared fixtures and utilities for Quorum tests.
 *
 * Because Petra Wallet requires a real browser extension and Aptos signing,
 * all on-chain interactions (wallet connect, submit_contribution, cast_vote)
 * are mocked at the window level so we can test the full UI flow without a
 * live wallet or a running Aptos node.
 */
import { expect, type Page } from "@playwright/test"

// ---------------------------------------------------------------------------
// Wallet mock — injected into every page before tests run
// ---------------------------------------------------------------------------

/** Install a mock AptosWalletAdapter into the page so the UI behaves as if
 *  a wallet is connected without needing the Petra extension. */
export async function mockWalletConnected(page: Page, address = "0xdeadbeefcafe") {
  await page.addInitScript(
    ({ addr }) => {
      // The AptosWalletAdapterProvider reads from window.aptos (Petra legacy)
      // and the adapter hooks. We shim both so the hook returns "connected".
      Object.defineProperty(window, "__QUORUM_MOCK_WALLET__", {
        value: { address: addr, connected: true },
        writable: false,
      })

      // Shim the Petra legacy window.aptos object
      ;(window as Window & { aptos?: unknown }).aptos = {
        isConnected: () => Promise.resolve(true),
        account: () => Promise.resolve({ address: addr, publicKey: "0xpubkey" }),
        connect: () => Promise.resolve({ address: addr, publicKey: "0xpubkey" }),
        disconnect: () => Promise.resolve(undefined),
        signAndSubmitTransaction: () => Promise.resolve({ hash: "0xmocktxhash" }),
        signMessage: () => Promise.resolve({ signature: "0xmocksig", fullMessage: "mock" }),
        network: () => Promise.resolve({ name: "Testnet", chainId: "2" }),
        onNetworkChange: () => {},
        onAccountChange: () => {},
      }
    },
    { addr: address },
  )
}

/** Wait for the page to be fully loaded (no network/spinner). */
export async function waitForPageReady(page: Page) {
  await page.waitForLoadState("networkidle")
}

/** Assert a toast notification appears with the given text. */
export async function expectToast(page: Page, text: string | RegExp) {
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: text })
  await expect(toast).toBeVisible({ timeout: 8_000 })
}
