import { defineConfig, devices } from "@playwright/test";
import baseConfig from "./playwright.config";

// This gate runs in its own CI job. Locally, run it after the Chromium suite:
// both suites intentionally use the same disposable .wrangler/test-state DB.
export default defineConfig({
  ...baseConfig,
  testDir: "./tests/compatibility",
  outputDir: "test-results/compatibility",
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: "playwright-report/compatibility" },
    ],
  ],
  use: {
    baseURL: baseConfig.use?.baseURL,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Do not inherit a local Chromium executable override or its user agent.
  projects: [
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
