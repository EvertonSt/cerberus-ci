import { chromium } from "@playwright/test";

/**
 * Capture the README screenshots from the running site.
 *
 * The kit flags a README with no image as the cheapest avoidable conversion
 * loss: a reviewer has to run the project before they can see it. These are
 * real screenshots of the real build, not mock-ups.
 *
 * Run with the dev server already listening on the port below.
 */
const BASE = process.env.SHOT_BASE ?? "http://127.0.0.1:4310";
const OUT = "docs/screenshots";

const PAGES = [
  { path: "/", name: "home", full: true },
  { path: "/features", name: "features", full: false },
  { path: "/docs", name: "docs", full: false },
];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

for (const { path, name, full } of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  // Let entry animations settle so the capture is not a half-faded frame.
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log(`captured ${OUT}/${name}.png`);
}

await browser.close();
