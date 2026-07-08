import { defineConfig } from "vitest/config";

// Unit tests are *.test.js; Playwright e2e specs (*.spec.js in e2e/) are run
// by `npm run test:e2e` and must not be picked up here.
export default defineConfig({
  test: {
    include: ["**/*.test.js"],
    exclude: ["node_modules/**", "e2e/**", ".next/**", "lib/generated/**"],
  },
});
