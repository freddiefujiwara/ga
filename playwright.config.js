import { defineConfig } from "@playwright/test";

// Verification for the LIVE freddiefujiwara.com site (production + staging).
// Read-only: no login, no submissions. APP optionally limits the run to a
// single app (used by the per-repository staging gate).
export default defineConfig({
  testDir: "./e2e",
  // Named *.check.js so Vitest (default include: *.test.* / *.spec.*)
  // never picks these up.
  testMatch: /.*\.check\.js$/,
  timeout: 90 * 1000,
  expect: { timeout: 15 * 1000 },
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "https://freddiefujiwara.com",
    trace: "retain-on-failure",
  },
});
