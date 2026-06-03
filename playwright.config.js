import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e for Vector.
 *
 * - `globalSetup` seeds tagged AI-draft fixtures into the dev DB (additive,
 *   self-cleaning); `globalTeardown` removes them again.
 * - The `setup` project logs in once via the real Supabase login form and
 *   saves the session to e2e/.auth/user.json; all specs reuse it.
 * - `webServer` boots `npm run dev` (reused if already running).
 *
 * Runs serially (workers: 1) because the specs share the seeded fixtures
 * and some of them mutate state (approve / reject).
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.js",
  globalTeardown: "./e2e/global-teardown.js",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    // Caroline's dev server runs on 3001 (3000 is her separate portfolio app).
    // Override with E2E_BASE_URL if yours differs.
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.js/ },
    {
      name: "chromium",
      testMatch: /.*\.spec\.js/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
    },
  ],
  // Reuse the already-running dev server. Only spawns one if nothing is
  // listening on the base URL (e.g. CI). Avoids the .next/dev lock conflict
  // with Caroline's running `next dev`.
  webServer: {
    command: "npm run dev",
    url: (process.env.E2E_BASE_URL || "http://localhost:3001") + "/login",
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
