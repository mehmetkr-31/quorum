import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart(),
  ],
  resolve: {
    alias: {
      "@orpc/zod": path.resolve(__dirname, "../../node_modules/.pnpm/@orpc+zod@1.13.9_@opentelemetry+api@1.9.0_@orpc+contract@1.13.9_@opentelemetry+api@1.9.0__@or_6u4mcio4dpoxr4d5kj2mmdpjti/node_modules/@orpc/zod/dist/index.mjs"),
    },
  },
  server: {
    port: 3001,
  },
});
