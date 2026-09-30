import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT || "4173");
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid E2E_PORT.");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1, // The development-only sign-in intentionally has one synthetic user.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [{ name: "chromium" }],
  webServer: {
    command: "node scripts/test-server.mjs",
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
