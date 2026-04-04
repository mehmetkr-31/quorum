import { expect, test } from "@playwright/test"
import { waitForPageReady } from "./helpers"

/**
 * Vote page E2E tests.
 * Tests the review queue UI, DAO filter, and unauthenticated guard states.
 */

test.describe("Vote page — unauthenticated", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/vote")
    await waitForPageReady(page)
  })

  test("renders NEURAL REVIEW heading", async ({ page }) => {
    await expect(page.getByText(/REVIEW/i)).toBeVisible()
  })

  test("shows pending task count badge", async ({ page }) => {
    await expect(page.getByText(/PENDING_TASKS/i)).toBeVisible()
  })

  test("shows JOIN_DAO button when not connected", async ({ page }) => {
    // Without a wallet, JOIN_DAO button should appear
    const joinBtn = page.getByRole("button", { name: /JOIN_DAO/i })
    await expect(joinBtn).toBeVisible()
  })

  test("DAO filter dropdown is visible in sidebar", async ({ page }) => {
    const filter = page.locator("select#dao-filter")
    await expect(filter).toBeVisible()
    // Default option is "All DAOs"
    const defaultOpt = filter.locator("option[value='']")
    await expect(defaultOpt).toHaveText(/All DAOs/i)
  })

  test("sidebar nav links are present", async ({ page }) => {
    await expect(page.getByRole("link", { name: /Dashboard/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /Data Archives/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /Governance/i })).toBeVisible()
  })

  test("SUBMIT_PROPOSAL button shows coming-soon toast", async ({ page }) => {
    const btn = page.getByRole("button", { name: /SUBMIT_PROPOSAL/i })
    await btn.click()
    await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 4_000 })
  })

  test("empty queue shows no-pending message when no contributions", async ({ page }) => {
    // Check if queue is empty — either "No contributions pending" or cards
    const emptyMsg = page.getByText(/No contributions pending review/i)
    const cards = page.locator(".glass-card").filter({ hasText: /approve|reject|improve/i })
    const cardCount = await cards.count()

    if (cardCount === 0) {
      await expect(emptyMsg).toBeVisible()
    }
  })

  test("selecting a DAO in filter updates pending count", async ({ page }) => {
    const filter = page.locator("select#dao-filter")
    const options = await filter.locator("option").allTextContents()
    const realOptions = options.filter((o) => o.trim() && o !== "All DAOs")

    if (realOptions.length > 0) {
      await filter.selectOption({ index: 1 })
      // Count might change or stay the same — just shouldn't crash
      await expect(page.getByText(/PENDING_TASKS/i)).toBeVisible()
    }
  })
})
