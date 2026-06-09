import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  // Unit tests don't exercise CSS; an inline empty PostCSS config stops Vite
  // from loading the app's Tailwind/PostCSS pipeline during test runs.
  css: { postcss: {} },
  test: {
    environment: "node",
    include: ["lib/qa/**/*.test.ts", "lib/nav/**/*.test.ts"],
  },
});
