import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: isCi ? 2 : undefined,
  reporter: isCi ? "github" : "list",
  use: {
    baseURL: "http://localhost:8081",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node ./node_modules/expo/bin/cli start --web --port 8081",
    url: "http://localhost:8081",
    reuseExistingServer: !isCi,
    timeout: 120_000,
    env: {
      CI: "1",
      EXPO_PUBLIC_SUPABASE_URL: "https://e2e.supabase.co",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_only",
      EXPO_PUBLIC_SPENDWISE_API_URL: "http://127.0.0.1:4010",
    },
  },
});
