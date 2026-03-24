// app.config.ts

import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "@tanstack/start/config"
import tsConfigPaths from "vite-tsconfig-paths"

var app_config_default = defineConfig({
  vite: {
    plugins: [tailwindcss(), tsConfigPaths()],
  },
})

export { app_config_default as default }
