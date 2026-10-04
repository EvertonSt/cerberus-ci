import { defineConfig, devices } from "@playwright/test";

/*
 * The end-to-end suite starts the real app and drives it in a real browser.
 * Port 4310 sits inside the workshop's 4000-4699 application range rather than
 * Next's 3000 default, which belongs to the flagship projects.
 */
const PORT = 4310;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: BASE_URL,
    /*
     * The suite writes to its own dist dir so a running dev server, and the
     * `.next` a production build just produced, are both left alone. Setting
     * it here rather than in the command keeps it working on Windows, where a
     * `VAR=value cmd` prefix is not a thing.
     */
    env: { NEXT_DIST_DIR: ".next-e2e" },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
