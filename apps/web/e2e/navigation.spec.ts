import { expect, test } from "@playwright/test"
import { waitForPageReady } from "./helpers"

/**
 * Navigation & static page tests — no wallet required.
 * These run fast and verify core routing + rendering.
 */

test.describe("Navigation", () => {
  test("home page loads with title and hero CTA", async ({ page }) => {
    await page.goto("/")
    await waitForPageReady(page)

    await expect(page).toHaveTitle(/Quorum/i)
    // Hero headline should mention dataset or DAO
    const hero = page.locator("h1, h2").first()
    await expect(hero).toBeVisible()
  })

  test("header shows all nav links", async ({ page }) => {
    await page.goto("/")
    await waitForPageReady(page)

    const nav = page.locator("nav")
    await expect(nav.getByRole("link", { name: /DAOs/i })).toBeVisible()
    await expect(nav.getByRole("link", { name: /Datasets/i })).toBeVisible()
    await expect(nav.getByRole("link", { name: /Vote/i })).toBeVisible()
    await expect(nav.getByRole("link", { name: /Governance/i })).toBeVisible()
  })

  test("navigates to /daos page", async ({ page }) => {
    await page.goto("/daos")
    await waitForPageReady(page)

    // Should show "Explore DAOs" heading or similar
    await expect(page.locator("h1")).toContainText(/DAO/i)
  })

  test("navigates to /datasets page", async ({ page }) => {
    await page.goto("/datasets")
    await waitForPageReady(page)

    await expect(page.locator("h1, h2").first()).toBeVisible()
  })

  test("navigates to /vote page", async ({ page }) => {
    await page.goto("/vote")
    await waitForPageReady(page)

    // Vote page has a sidebar with NEURAL_DAO branding
    await expect(page.getByText(/REVIEW/i)).toBeVisible()
  })

  test("navigates to /governance page", async ({ page }) => {
    await page.goto("/governance")
    await waitForPageReady(page)

    await expect(page.locator("h1, h2").first()).toBeVisible()
  })

  test("navigates to /contribute page", async ({ page }) => {
    await page.goto("/contribute")
    await waitForPageReady(page)

    await expect(page.locator("h1")).toContainText(/Contribution/i)
  })

  test("unknown route shows 404 or redirects to home", async ({ page }) => {
    const response = await page.goto("/this-does-not-exist-xyz")
    // Either a 404 status or a redirect to home
    const status = response?.status() ?? 200
    const url = page.url()
    const is404 = status === 404
    const isRedirect = url.includes("localhost:3001/") && !url.includes("xyz")
    expect(is404 || isRedirect).toBe(true)
  })
})
