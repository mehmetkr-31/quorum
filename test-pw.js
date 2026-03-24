import { chromium } from "playwright"

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  page.on("console", (msg) => console.log("BROWSER LOG:", msg.type(), msg.text()))
  page.on("pageerror", (err) => console.log("BROWSER ERROR:", err.toString()))
  page.on("requestfailed", (req) => console.log("REQ FAILED:", req.url()))

  console.log("Navigating to http://localhost:3001/ ...")
  await page.goto("http://localhost:3001/", { waitUntil: "networkidle" })
  await new Promise((resolve) => setTimeout(resolve, 2000))

  await browser.close()
})()
