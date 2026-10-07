import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
// Not Vite's default preview port (4173), so a `npm run preview` left running
// for something else can't be mistaken for this suite's server.
const PORT = 4317;
const BASE_URL = `http://localhost:${PORT}`;

// End-to-end tests run against the production build, served by
// `vite preview`. Puter and Google Fonts are stubbed in every test
// (e2e/helpers/), so no test reaches the network.
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.js",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    // Always build and serve fresh: reusing a server already on the port
    // would test whatever build it happens to be serving. Playwright fails
    // with an error when the port is taken.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
