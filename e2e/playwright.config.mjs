import { defineConfig } from "@playwright/test";

const adminBaseUrl = "http://localhost:3100";
const publicBaseUrl = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL: adminBaseUrl,
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command:
      "cd .. && rm -f /tmp/pagevault-e2e.sqlite && rm -rf /tmp/pagevault-e2e-objects && node apps/worker/dist/node-server.js",
    url: adminBaseUrl,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ...process.env,
      ADMIN_EMAIL: "e2e@example.com",
      ADMIN_PASSWORD_HASH:
        "pbkdf2_sha256$100000$00112233445566778899aabbccddeeff$047ea8ea77c5c3da26301faab69eb90ff6797a797980fda356a6375c0e61ecaa",
      SESSION_SECRET:
        "pagevault-e2e-session-secret-only-for-local-playwright-tests",
      APP_ENV: "production",
      ADMIN_BASE_URL: adminBaseUrl,
      PUBLIC_BASE_URL: publicBaseUrl,
      DEFAULT_URL_EXPIRE_DAYS: "15",
      DEFAULT_FILE_EXPIRE_DAYS: "30",
      MAX_UPLOAD_SIZE_MB: "10",
      SQLITE_PATH: "/tmp/pagevault-e2e.sqlite",
      LOCAL_STORAGE_DIR: "/tmp/pagevault-e2e-objects",
      PORT: "3100",
    },
  },
});
