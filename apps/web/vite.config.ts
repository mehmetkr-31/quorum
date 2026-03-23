import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: [
        path.resolve(__dirname, "tsconfig.json"),
        path.resolve(__dirname, "../../packages/api/tsconfig.json"),
        path.resolve(__dirname, "../../packages/ui/tsconfig.json"),
        path.resolve(__dirname, "../../packages/db/tsconfig.json"),
        path.resolve(__dirname, "../../packages/env/tsconfig.json"),
      ],
    }),
    tailwindcss(),
    tanstackStart(),
  ],
  server: {
    port: 3001,
  },
});
