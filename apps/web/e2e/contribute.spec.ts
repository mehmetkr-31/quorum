import { expect, test } from "@playwright/test"
import { waitForPageReady } from "./helpers"

/**
 * Contribute page E2E tests.
 * Wallet interactions are skipped — we only test the UI state
 * without a connected wallet (guard states) and form validation.
 */

test.describe("Contribute page — unauthenticated state", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/contribute")
    await waitForPageReady(page)
  })

  test("renders Submit Contribution heading", async ({ page }) => {
    await expect(page.locator("h1")).toContainText(/Contribution/i)
  })

  test("shows protocol selector with 4 options", async ({ page }) => {
    const protocols = page.locator("button").filter({ hasText: /Text|Image|Audio|Structured/i })
    await expect(protocols).toHaveCount(4)
  })

  test("DAO selector is present and has a default empty option", async ({ page }) => {
    const daoSelect = page.locator("select#daoId")
    await expect(daoSelect).toBeVisible()
    const defaultOpt = daoSelect.locator("option[value='']")
    await expect(defaultOpt).toBeVisible()
  })

  test("dataset selector is disabled until DAO is selected", async ({ page }) => {
    const datasetSelect = page.locator("select#datasetId")
    await expect(datasetSelect).toBeDisabled()
  })

  test("SUBMIT button is disabled without wallet connection", async ({ page }) => {
    const submitBtn = page.getByRole("button", { name: /SUBMIT/i })
    await expect(submitBtn).toBeDisabled()
  })

  test("file browse button is disabled without DAO membership", async ({ page }) => {
    const browseBtn = page.getByRole("button", { name: /Browse Files/i })
    await expect(browseBtn).toBeDisabled()
  })

  test("selecting image protocol keeps it active", async ({ page }) => {
    const imageBtn = page.getByRole("button", { name: /Image/i })
    await imageBtn.click()
    await expect(imageBtn.locator("span").filter({ hasText: /Active/i })).toBeVisible()
  })

  test("selecting a DAO enables dataset selector", async ({ page }) => {
    const daoSelect = page.locator("select#daoId")
    const options = await daoSelect.locator("option").allTextContents()

    // If there's a real DAO option (not just the empty one)
    const realOptions = options.filter((o) => o.trim() && o !== "Select a DAO...")
    if (realOptions.length > 0) {
      await daoSelect.selectOption({ index: 1 })
      const datasetSelect = page.locator("select#datasetId")
      await expect(datasetSelect).not.toBeDisabled()
    }
  })
})
