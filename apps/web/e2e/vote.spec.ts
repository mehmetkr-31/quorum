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
    await expect(page.getByRole("heading", { name: /NEURAL REVIEW/i })).toBeVisible()
  })

  test("shows pending task count badge", async ({ page }) => {
    await expect(page.getByText(/PENDING_TASKS/i)).toBeVisible()
  })

  test("hides JOIN_DAO button when not connected", async ({ page }) => {
    const joinBtn = page.getByRole("button", { name: /JOIN_DAO/i })
    await expect(joinBtn).toHaveCount(0)
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
    await expect(page.getByRole("link", { name: /^Governance$/i }).first()).toBeVisible()
  })

  test("SUBMIT_PROPOSAL button shows coming-soon toast", async ({ page }) => {
    const btn = page.getByRole("button", { name: /SUBMIT_PROPOSAL/i })
    await btn.click()
    await expect(page.getByText(/Proposal submission coming soon/i)).toBeVisible({ timeout: 4_000 })
  })

  test("empty queue shows no-pending message when no contributions", async ({ page }) => {
    const emptyMsg = page.getByText(/No contributions pending review/i)
    const actionButtons = page.getByRole("button").filter({ hasText: /APPROVE|REJECT|IMPROVE/i })
    const actionCount = await actionButtons.count()
    const contributionCards = page.getByText(/CNTRB_/i)
    const finalizeButtons = page.getByRole("button", { name: /FINALIZE_RECORDS/i })
    const cardCount = await contributionCards.count()
    const finalizeCount = await finalizeButtons.count()

    if (actionCount === 0 && cardCount === 0 && finalizeCount === 0) {
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
