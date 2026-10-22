import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const base = process.env.PRIVACY_TEST_BASE_URL || "http://127.0.0.1:3105";
  const output = path.resolve("artifacts/privacy-consent");
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const results: unknown[] = [];
  try {
    for (const width of [1440, 768, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 },
        deviceScaleFactor: 1, isMobile: width === 390, hasTouch: width !== 1440,
        ...(width === 390 ? { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36" } : {}) });
      await context.addInitScript(() => localStorage.setItem("autozap.privacy-choice.v1", JSON.stringify({
        version: 1, decision: "declined", receiptId: null, documentVersion: null, expiresAt: Date.now() + 31_536_000_000
      })));
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      await page.locator(".home-about-media").scrollIntoViewIfNeeded();
      const iframe = page.locator('iframe[title="Карта проезда к магазину автозапчастей"]');
      await iframe.waitFor();
      await iframe.evaluate((element) => window.scrollTo({
        top: scrollY + element.getBoundingClientRect().top - innerHeight / 2 + element.getBoundingClientRect().height / 2,
        behavior: "instant"
      }));
      const frame = await iframe.elementHandle().then((element) => element!.contentFrame());
      assert.ok(frame);
      await frame.locator("ymaps").first().waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      const controls = await frame.locator("[title], [aria-label], button").evaluateAll((elements) => elements.map((element) => ({
        tag: element.tagName, title: element.getAttribute("title"), label: element.getAttribute("aria-label"),
        text: element.textContent?.trim().slice(0, 60), class: element.className
      })).filter((element) => element.title || element.label));
      console.log(JSON.stringify({ width, controls }));
      await page.screenshot({ path: path.join(output, `map-${width}.png`) });
      const zoom = frame.getByRole("button", { name: "Приблизить", exact: true });
      let zoomChecked = false;
      if (await zoom.count()) {
        const before = await iframe.screenshot();
        await zoom.first().click();
        await page.waitForTimeout(700);
        const after = await iframe.screenshot();
        assert.equal(before.equals(after), false, "Real map responds to zoom");
        await frame.getByText(/^50\s*м$/).waitFor({ timeout: 5000 });
        zoomChecked = true;
      }
      assert.deepEqual(errors, []);
      assert.equal(zoomChecked, true, "Real zoom control must be exercised");
      const box = await iframe.boundingBox();
      assert.ok(box);
      const beforePan = await iframe.screenshot();
      await page.mouse.move(box.x + 80, box.y + 80); await page.mouse.down();
      await page.mouse.move(box.x + 150, box.y + 115, { steps: 12 }); await page.mouse.up();
      await page.waitForTimeout(400);
      assert.equal(beforePan.equals(await iframe.screenshot()), false, "Real map responds to dragging");
      let singleFingerScroll: boolean | null = null;
      if (width === 390) {
        const start = await page.evaluate(() => scrollY);
        const session = await context.newCDPSession(page);
        const point = { x: box.x + 100, y: box.y + 140 };
        await session.send("Input.synthesizeScrollGesture", {
          x: point.x, y: point.y, yDistance: 120, speed: 300, gestureSourceType: "touch"
        });
        await page.waitForTimeout(400);
        singleFingerScroll = Math.abs((await page.evaluate(() => scrollY)) - start) > 10;
        // A positive control distinguishes a captured map gesture from broken touch emulation.
        const outsideStart = await page.evaluate(() => scrollY);
        await session.send("Input.synthesizeScrollGesture", {
          x: 10, y: point.y, yDistance: 120, speed: 300, gestureSourceType: "touch"
        });
        await page.waitForTimeout(400);
        assert.ok(Math.abs((await page.evaluate(() => scrollY)) - outsideStart) > 10, "Touch control outside the map scrolls the page");
        await session.detach();
      }
      results.push({ width, engine: "Chromium", touchEmulation: width !== 1440, realMapTiles: await frame.locator("ymaps").count(), zoomChecked, panChecked: true, singleFingerScroll, errors });
      await context.close();
    }
    // Delay the actual external iframe request: bounded fallback retains the route link.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => localStorage.setItem("autozap.privacy-choice.v1", JSON.stringify({
      version: 1, decision: "declined", receiptId: null, documentVersion: null, expiresAt: Date.now() + 31_536_000_000
    })));
    await context.route("https://yandex.ru/map-widget/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 17_000));
      await route.abort().catch(() => {});
    });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator(".home-about-media").scrollIntoViewIfNeeded();
    await page.getByText("Карта временно недоступна.", { exact: true }).waitFor({ timeout: 20_000 });
    assert.ok(await page.getByRole("link", { name: "Открыть в Яндекс Картах", exact: true }).count());
    results.push({ scenario: "Delayed external map", boundedFallback: true, independentOfRefusal: true });
    await writeFile(path.join(output, "map-checks.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    assert.equal(results.some((result) => (result as { singleFingerScroll?: boolean }).singleFingerScroll === false),
      false, "Release blocker: external map iframe intercepts a single-finger page scroll");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
