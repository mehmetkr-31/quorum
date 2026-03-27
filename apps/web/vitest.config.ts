import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // biome-ignore lint/suspicious/noExplicitAny: Vite plugin types mismatch with vitest's defineConfig
  plugins: [react() as any, tsconfigPaths() as any],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/test/**/*.test.{ts,tsx}"],
  },
})
