import { test, expect } from "@playwright/test";
import { GAS, APPS, execUrl, stagingPath } from "./apps.js";

// Staging gate: run by other repositories' pull requests (via the reusable
// workflow) after their staging preview is deployed. Set APP to limit the
// run to one app; without APP every app is checked.
const TARGET = process.env.APP || null;
const targets = APPS.filter((a) => !TARGET || a.name === TARGET);

for (const app of targets) {
  test(`${app.name} staging page loads and uses the staging backend`, async ({
    page,
  }) => {
    const calledIds = [];
    page.on("request", (req) => {
      const m = req
        .url()
        .match(/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)/);
      if (m) calledIds.push(m[1]);
    });
    const resp = await page.goto(stagingPath(app));
    expect(resp.status()).toBe(200);
    await expect(page.getByText("STAGING")).toBeVisible();
    if (app.gas) {
      const ids = GAS[app.gas];
      if (app.dataOnLoad) {
        await page
          .waitForRequest((r) => r.url().includes("script.google.com/macros"), {
            timeout: 30 * 1000,
          })
          .catch(() => null);
        expect(calledIds).toContain(ids.staging);
      } else {
        await page.waitForTimeout(5000);
      }
      expect(calledIds).not.toContain(ids.prod);
    }
  });

  if (app.gas) {
    test(`${app.name} staging backend responds as expected`, async ({
      request,
    }) => {
      const r = await request.get(execUrl(GAS[app.gas].staging));
      const data = await r.json();
      if (app.gas === "blog") {
        expect(data.ids.length).toBeGreaterThanOrEqual(1);
      } else if (app.gas === "list") {
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThanOrEqual(1);
        expect(data.length).toBeLessThanOrEqual(5);
      } else if (app.gas === "tweet") {
        expect(data.ok).toBe(true);
      } else if (app.gas === "alarm") {
        // A bare GET is rejected by design; the JSON error proves the
        // staging backend is alive and reachable.
        expect(data.ok).toBe(false);
        expect(typeof data.error).toBe("string");
      } else if (app.gas === "bucket") {
        // bucket-list is auth-gated even in staging; its error shape
        // is { error: { code, message } }.
        expect(data.error.code).toBe(401);
      } else {
        // health / asset are auth-gated even in staging.
        expect(data.status).toBe(401);
      }
    });
  }
}
