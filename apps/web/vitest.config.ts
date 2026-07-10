import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  cacheDir: process.env.VITE_CACHE_DIR ?? "node_modules/.vite",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Next's `server-only` guard has no runtime in vitest — stub it so
      // server-only modules (e.g. lib/ai/checkpoint) can be unit-tested.
      "server-only": fileURLToPath(new URL("./lib/qa/__stubs__/server-only.ts", import.meta.url)),
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
