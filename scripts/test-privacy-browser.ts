import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright-core";

const base = process.env.PRIVACY_TEST_BASE_URL || "http://127.0.0.1:3105";
const output = path.resolve("artifacts/privacy-consent");
const key = "autozap.privacy-choice.v1";
async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
}
async function main() {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const report: { widths: unknown[]; scenarios: string[]; errors: string[]; ownMetrikaRequests: string[]; map: unknown } = {
    widths: [], scenarios: [], errors: [], ownMetrikaRequests: [], map: null
  };
  page.on("pageerror", (error) => { report.errors.push(`${page.url()}: ${error.message}`); console.error("Browser error", page.url(), error.stack); });
  page.on("request", (request) => {
    if (/mc\.yandex\.[^/]+\/metrika\/tag\.js/.test(request.url()) && request.frame() === page.mainFrame()) report.ownMetrikaRequests.push(request.url());
  });
  try {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.getByRole("dialog").waitFor();
    await ready(page);
    if (process.env.PRIVACY_REVIEW_FIX_ONLY === "1") {
      await page.setViewportSize({ width: 320, height: 844 });
      await page.getByRole("link", { name: "Настроить", exact: true }).click();
      const lines = await page.locator("#privacy-dialog-title").evaluate((element) => {
        const text = element.firstChild!;
        const start = text.textContent!.indexOf("конфиденциальности");
        const range = document.createRange(); range.setStart(text, start); range.setEnd(text, text.textContent!.length);
        return range.getClientRects().length;
      });
      assert.equal(lines, 1, "The word конфиденциальности must not split");
      await page.screenshot({ path: path.join(output, "settings-320.png") });
      await page.setViewportSize({ width: 320, height: 360 });
      await page.screenshot({ path: path.join(output, "short-height-320.png") });
      console.log("Reviewer fix verified at 320px: intact heading, narrow/short captures replaced.");
      return;
    }
    for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
      const dialog = page.getByRole("dialog");
      const bounds = await dialog.evaluate((element) => {
        const r = element.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, viewportWidth: innerWidth, viewportHeight: innerHeight, overflow: element.scrollWidth > element.clientWidth };
      });
      assert.equal(bounds.overflow, false);
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      if (width >= 640) assert.ok(Math.abs(bounds.y + bounds.height / 2 - bounds.viewportHeight / 2) < 1, "Desktop modal must be centered");
      else assert.ok(Math.abs(bounds.y + bounds.height - (bounds.viewportHeight - 14)) < 1, "Mobile banner must float above bottom");
      assert.equal(await page.getByRole("button", { name: "Принять", exact: true }).isDisabled(), true);
      await page.screenshot({ path: path.join(output, `banner-${width}.png`) });
      await page.getByRole("link", { name: "Настроить", exact: true }).click();
      assert.equal(await dialog.locator("section").count(), 3);
      assert.equal(await page.getByRole("switch").count(), 1);
      await page.screenshot({ path: path.join(output, `settings-${width}.png`) });
      await page.getByRole("button", { name: "Закрыть настройки без сохранения" }).click();
      assert.equal(await page.getByRole("link", { name: "Настроить", exact: true }).count(), 1);
      report.widths.push({ width, banner: bounds, sections: 3, switches: 1 });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 1);
    report.scenarios.push("Banner Escape does not imply a decision");
    await page.getByRole("link", { name: "Настроить", exact: true }).click();
    await page.getByRole("switch").check();
    await page.waitForTimeout(220);
    assert.equal(await page.getByText("Сейчас аналитика отключена", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Сохранить настройки", exact: true }).isDisabled(), true);
    await page.screenshot({ path: path.join(output, "settings-switch-on-390.png") });
    await page.getByRole("button", { name: "Закрыть настройки без сохранения" }).click();
    await page.getByRole("link", { name: "Настроить", exact: true }).click();
    assert.equal(await page.getByRole("switch").isChecked(), false);
    report.scenarios.push("Draft toggle does not change saved state; X resets it; missing document blocks acceptance");
    await page.getByRole("button", { name: "Без аналитики", exact: true }).click();
    await page.getByRole("alert").waitFor();
    await page.getByRole("alert").scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(output, "save-error-390.png") });
    assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).decision, key), "declined");
    report.scenarios.push("Actual unavailable PostgreSQL: UI remains open, error visible, local analytics off");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: path.join(output, "save-error-1440.png") });
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    assert.equal(await page.getByRole("dialog").count(), 0);
    report.scenarios.push("A locally saved refusal survives reload without analytics");
    await page.locator('footer a[href="#privacy-settings"]').click();
    await page.getByRole("switch").check();
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(output, "settings-switch-on-1440.png") });
    await page.getByRole("switch").uncheck();
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(output, "settings-switch-off-1440.png") });
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("href")), "#privacy-settings");
    report.scenarios.push("Footer opens settings and restores keyboard focus");
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 360 });
      await page.locator('footer a[href="#privacy-settings"]').click();
      const dialog = page.getByRole("dialog");
      assert.equal(await dialog.evaluate((e) => e.scrollWidth > e.clientWidth), false);
      await page.getByRole("button", { name: "Сохранить настройки", exact: true }).scrollIntoViewIfNeeded();
      assert.equal(await page.getByRole("button", { name: "Сохранить настройки", exact: true }).isVisible(), true);
      await page.screenshot({ path: path.join(output, `short-height-${width}.png`) });
      await page.keyboard.press("Escape");
    }
    report.scenarios.push("Short 360px viewport: dialog scrolls and buttons remain accessible");

    // UI success/idempotency/multi-tab checks use an explicitly mocked journal, not a real PostgreSQL claim.
    const operations: string[] = [];
    await context.route("**/api/privacy-consent", async (route) => {
      const request = route.request();
      if (request.method() === "GET") { await route.fulfill({ json: { state: "unknown", receiptId: null, documentVersion: null, expiresAt: null, receipts: [] } }); return; }
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        if (["decline", "revoke"].includes(body.action)) {
          operations.push(body.operationId);
          await route.fulfill({ json: { state: body.action === "revoke" ? "revoked" : "declined", receiptId: body.receiptId, operationId: body.operationId, eventKind: body.action,
            documentVersion: null, expiresAt: Date.now() + 31_536_000_000 } });
          return;
        }
      }
      await route.continue();
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('footer a[href="#privacy-settings"]').click();
    await page.getByRole("button", { name: "Без аналитики", exact: true }).dblclick();
    await page.getByText("Настройки сохранены", { exact: true }).waitFor();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(operations.length, 1);
    const other = await context.newPage();
    await other.goto(base, { waitUntil: "domcontentloaded" });
    await ready(other);
    assert.equal(await other.getByRole("dialog").count(), 0);
    await page.evaluate((key) => localStorage.setItem(key, "{damaged"), key);
    await other.getByRole("dialog").waitFor();
    report.scenarios.push("Mock journal: duplicate click suppressed, success closes, second tab sees damaged/unknown state");
    await other.getByRole("link", { name: "Настроить", exact: true }).click();
    await other.getByRole("button", { name: "Без аналитики", exact: true }).click();
    await other.getByRole("dialog").waitFor({ state: "detached" });
    await other.close();
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    // Real external iframe: no interception/mocking of Yandex resources.
    const frameElement = page.locator('iframe[title="Карта проезда к магазину автозапчастей"]');
    await page.locator(".home-about-media").scrollIntoViewIfNeeded();
    await page.waitForTimeout(5000);
    const mapFrames = page.frames().filter((frame) => /yandex\.[^/]+\/map-widget/.test(frame.url()));
    report.map = {
      iframeCount: await frameElement.count(), frames: mapFrames.map((frame) => frame.url()),
      body: await Promise.all(mapFrames.map(async (frame) => ({ text: (await frame.locator("body").innerText().catch(() => "unavailable")).slice(0, 800),
        tiles: await frame.locator("ymaps").count().catch(() => 0) })))
    };
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
      if (await frameElement.count()) await frameElement.locator("..").evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
      else await page.locator(".home-about-media").scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(output, `map-${width}.png`) });
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
      await page.locator("footer").scrollIntoViewIfNeeded();
      await ready(page);
      await page.screenshot({ path: path.join(output, `footer-${width}.png`) });
      await page.locator("footer").screenshot({ path: path.join(output, `footer-crop-${width}.png`) });
      if (width === 1440) {
        const baseline = "/private/tmp/autozap-footer-arrows-baseline/footer-1440.png";
        const before = await readFile(baseline).catch(() => null);
        if (before) assert.equal(before.equals(await readFile(path.join(output, `footer-crop-${width}.png`))), true, "Frozen desktop footer pixels");
      }
    }
    const scroll = await page.evaluate(() => scrollY);
    await page.locator('footer a[href="/privacy"]').click();
    await page.waitForURL("**/privacy");
    await page.getByRole("link", { name: "Назад", exact: true }).click();
    await page.waitForURL(base + "/");
    await page.waitForTimeout(400);
    assert.ok(Math.abs((await page.evaluate(() => scrollY)) - scroll) < 2);
    report.scenarios.push("Policy return preserves original footer scroll position");
    // Model the one-use document transition without loading or enabling the real analytics SDK.
    const bridgeToken = await page.evaluate(() => {
      const token = crypto.randomUUID();
      sessionStorage.setItem("autozap:privacy-return:v1", JSON.stringify({
        token, href: location.pathname + location.search + location.hash, scrollY
      }));
      sessionStorage.setItem("autozap:privacy-document-transition:v1", token);
      history.replaceState({ ...history.state, privacySourceToken: token }, "");
      return token;
    });
    await page.evaluate(() => location.assign("/privacy"));
    await page.waitForURL("**/privacy");
    await page.waitForFunction((token) => history.state?.privacyReturnToken === token, bridgeToken);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("autozap:privacy-document-transition:v1")), null);
    await page.getByRole("link", { name: "Назад", exact: true }).click();
    await page.waitForURL(base + "/");
    await page.waitForTimeout(400);
    assert.ok(Math.abs((await page.evaluate(() => scrollY)) - scroll) < 2);
    report.scenarios.push("Synthetic SDK document-transition fixture: real full-document policy return preserves scroll; one-use bridge consumed");
    const externalEntry = await context.newPage();
    await externalEntry.addInitScript(() => {
      sessionStorage.setItem("autozap:privacy-return:v1", JSON.stringify({ token: "unrelated", href: "/", scrollY: 500 }));
      sessionStorage.setItem("autozap:privacy-document-transition:v1", "unrelated");
    });
    await externalEntry.goto(base + "/privacy", { waitUntil: "domcontentloaded" });
    await ready(externalEntry);
    assert.equal(await externalEntry.evaluate(() => history.state?.privacyReturnToken), undefined);
    await externalEntry.close();
    report.scenarios.push("Document bridge without same-origin source referrer does not authorize unrelated Back history");
    await page.goto(base + "/search?q=test", { waitUntil: "domcontentloaded" });
    await page.goto(base + "/catalog", { waitUntil: "domcontentloaded" });
    await page.goto(base + "/spisok-pokupok", { waitUntil: "domcontentloaded" });
    await page.goto(base + "/admin/login", { waitUntil: "domcontentloaded" });
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(report.ownMetrikaRequests.length, 0);
    await writeFile(path.join(output, "checks.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    assert.deepEqual(report.errors, []);
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
