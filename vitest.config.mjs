import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests are *.test.js; Playwright e2e specs (*.spec.js in e2e/) are run
// by `npm run test:e2e` and must not be picked up here.
export default defineConfig({
  resolve: {
    // Mirror the "@/*" path alias from jsconfig.json — Next.js resolves it
    // at build time, but Vitest needs it declared here.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: ["**/*.test.js"],
    exclude: ["node_modules/**", "e2e/**", ".next/**", "lib/generated/**"],
  },
});
