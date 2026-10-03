import { expect, test } from "@playwright/test";

/*
 * One journey, not many screenshots.
 *
 * The kit's rule: a screenshot comparison proves pixels, but the thing a
 * reviewer needs to know is "does the thing actually work in a browser". That
 * is a journey, and it runs on every platform — which is why this file asserts
 * structure and navigation rather than appearance.
 */

test("the landing page states what the product is", async ({ page }) => {
  await page.goto("/");

  // A ninety-second reader should learn the product from the first screen, so
  // the promise is an h1 and not buried in a paragraph.
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  await expect(heading).not.toBeEmpty();

  // And the page must name the thing, not just describe a category.
  await expect(page.getByText(/Cerberus/i).first()).toBeVisible();
});

test("every page in the primary navigation renders", async ({ page }) => {
  for (const path of ["/features", "/architecture", "/docs"]) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} should return 200`).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("navigation between sections works", async ({ page }) => {
  await page.goto("/");

  const featuresLink = page.getByRole("link", { name: /features/i }).first();
  await expect(featuresLink).toBeVisible();
  await featuresLink.click();

  await expect(page).toHaveURL(/\/features/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("an unknown route shows the not-found page rather than a blank screen", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist");
  // Next serves the 404 page for an unmatched App Router path; the point is
  // that a user gets something readable, not a stack trace.
  expect([404, 200]).toContain(response?.status());
  await expect(page.getByRole("heading").first()).toBeVisible();
});

test("the page carries the security headers the config declares", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response?.headers() ?? {};

  // Declared in next.config.ts rather than vercel.json, so `pnpm start`
  // reproduces production exactly and this assertion is meaningful locally.
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
});
