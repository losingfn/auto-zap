import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright-core";
import { analyticsConsentText } from "../src/features/privacy/consent-content";

const base = process.env.PRIVACY_TEST_BASE_URL || "http://127.0.0.1:3107";
const output = path.resolve("artifacts/privacy-banner-consent");
const key = "autozap.privacy-choice.v1";
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
async function ready(page: Page) { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1200); }
async function main() {
  await mkdir(output, { recursive: true });
  const source = process.env.APPROVED_CONSENT_SOURCE ? await readFile(process.env.APPROVED_CONSENT_SOURCE, "utf8") : analyticsConsentText;
  assert.equal(analyticsConsentText, source, "Stored source equals the supplied approved file byte for byte");
  const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors: string[] = [], consoleErrors: string[] = [], ownSdk: string[] = [], posts: string[] = [];
  const report: Record<string, unknown> = { desktop: [], mobile: [], scenarios: [], errors, consoleErrors, ownSdk, publication: "blocked: existing counter ID/settings and real PostgreSQL unverified" };
  function monitor(page: Page) {
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("request", request => {
      if (request.frame() === page.mainFrame() && /mc\.yandex\.[^/]+\/metrika\/tag\.js/.test(request.url())) ownSdk.push(request.url());
      if (request.url().endsWith("/api/privacy-consent") && request.method() === "POST") posts.push(request.postDataJSON().action);
    });
  }
  const page = await context.newPage(); monitor(page);
  const banner = page.locator("[data-privacy-banner]");
  const scenarios = report.scenarios as string[];
  try {
    await page.goto(base, { waitUntil: "domcontentloaded" }); await banner.waitFor(); await ready(page);
    if (process.env.PRIVACY_SKIP_WIDTH_CAPTURES === "1") report.desktop = JSON.parse(await readFile(path.join(output, "desktop-widths.json"), "utf8"));
    else for (const [width, height] of [[1024, 768], [1280, 720], [1366, 768], [1440, 900], [1600, 900], [1920, 1080], [2560, 1440]]) {
      await page.setViewportSize({ width, height });
      const bounds = await banner.boundingBox(); assert.ok(bounds);
      assert.ok(Math.abs(bounds.x + bounds.width / 2 - width / 2) < 1);
      assert.ok(Math.abs(height - bounds.y - bounds.height - 24) < 1);
      assert.ok(bounds.width <= 1000 && bounds.height < 280);
      assert.equal(await page.locator(":modal").count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await banner.getByRole("button").count(), 4, "Three actions plus the close control");
      assert.equal(await banner.getByRole("button", { name: "Принять", exact: true }).isDisabled(), true);
      const boxes = await Promise.all(["Принять", "Только необходимые", "Настроить"].map(name => banner.getByRole("button", { name, exact: true }).boundingBox()));
      assert.ok(boxes.every(box => box && Math.abs(box.y - boxes[0]!.y) < 1));
      await page.screenshot({ path: path.join(output, `banner-${width}x${height}.png`) });
      (report.desktop as unknown[]).push({ width, height, bounds, modal: false });
    }
    await writeFile(path.join(output, "desktop-widths.json"), JSON.stringify(report.desktop, null, 2));
    await page.setViewportSize({ width: 1440, height: 900 });
    const buttonStyle = await page.evaluate(() => {
      const properties = ["borderRadius", "fontFamily", "fontSize", "fontWeight", "padding", "minHeight", "backgroundImage", "borderColor", "color", "transition"] as const;
      const values = ["[data-privacy-banner] .customer-reviews-action-primary", ".customer-reviews-actions .customer-reviews-action-primary"].map(selector => {
        const s = getComputedStyle(document.querySelector(selector)!);
        return Object.fromEntries(properties.map(p => [p, p === "fontFamily" ? s[p].split(",").slice(0, 2).join(",") : s[p]]));
      });
      return { banner: values[0], reviews: values[1] };
    });
    assert.deepEqual(buttonStyle.banner, buttonStyle.reviews, "Reuse the actual review-button design"); report.buttonStyles = buttonStyle;
    for (const [name, suffix] of [["Принять", "accept"], ["Только необходимые", "necessary"], ["Настроить", "settings"]]) {
      await banner.getByRole("button", { name, exact: true }).hover(); await page.waitForTimeout(220);
      await page.screenshot({ path: path.join(output, `hover-${suffix}.png`) });
    }
    await page.mouse.move(10, 10);
    await page.locator('input[placeholder="Введите название товара или бренда"]').fill("проверка");
    await page.mouse.wheel(0, 500); await page.waitForTimeout(250);
    assert.ok(await page.evaluate(() => scrollY) > 100); assert.equal(await banner.isVisible(), true);
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    scenarios.push("Desktop page remains interactive and scrollable beneath the fixed nonmodal notice");
    const beforeReading = posts.length;
    await page.getByRole("link", { name: "Прочитать согласие", exact: true }).click();
    const doc = page.locator("[data-consent-text]"); await doc.waitFor();
    assert.equal(await page.locator(":modal").count(), 1); assert.equal(await banner.count(), 0);
    assert.equal(await doc.locator("h3").count(), 10); assert.equal(normalize(await doc.innerText()), normalize(source));
    const dialog = page.getByRole("dialog"), scroller = doc.locator("..");
    const docBounds = await dialog.boundingBox(); assert.ok(docBounds && docBounds.width === 850 && docBounds.height <= 765);
    assert.equal(page.url(), base + "/");
    const optOut = doc.getByRole("link", { name: "https://yandex.ru/support/metrica/ru/general/opt-out", exact: true });
    assert.equal(await optOut.getAttribute("href"), "https://yandex.ru/support/metrica/ru/general/opt-out");
    assert.equal(await optOut.getAttribute("rel"), "noopener noreferrer");
    await page.screenshot({ path: path.join(output, "consent-desktop.png") });
    await scroller.evaluate(e => { e.scrollTop = e.scrollHeight / 2; });
    await page.screenshot({ path: path.join(output, "consent-middle.png") });
    await scroller.evaluate(e => { e.scrollTop = e.scrollHeight; });
    await page.screenshot({ path: path.join(output, "consent-end.png") });
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    assert.equal(await banner.isVisible(), true); assert.equal(posts.length, beforeReading);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Прочитать согласие");
    await page.getByRole("link", { name: "Прочитать согласие", exact: true }).click(); await page.keyboard.press("Escape");
    assert.equal(await banner.isVisible(), true);
    await banner.getByRole("button", { name: "Настроить", exact: true }).click();
    assert.equal(await page.getByRole("dialog").locator("section").count(), 3); assert.equal(await page.getByRole("switch").count(), 1);
    await page.getByRole("switch").check();
    await page.getByRole("link", { name: "Прочитать полное согласие", exact: true }).click();
    await page.screenshot({ path: path.join(output, "consent-from-settings.png") });
    await page.keyboard.press("Escape"); assert.equal(await page.getByRole("switch").isChecked(), true);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Прочитать полное согласие");
    await page.screenshot({ path: path.join(output, "settings-draft-return.png") });
    await page.getByRole("button", { name: "Закрыть настройки без сохранения" }).click(); assert.equal(await banner.isVisible(), true);
    assert.equal(posts.length, beforeReading); assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
    scenarios.push("All ten sections match the approved source; one modal, URL unchanged, Back/Escape restore source and focus; draft survives reading");
    await banner.getByRole("button", { name: "Закрыть уведомление" }).click(); await page.reload({ waitUntil: "domcontentloaded" }); await ready(page);
    assert.equal(await banner.count(), 0); assert.equal(posts.length, beforeReading);
    await page.goto(base + "/catalog", { waitUntil: "domcontentloaded" }); assert.equal(await banner.count(), 0);
    await page.goto(base, { waitUntil: "domcontentloaded" }); await ready(page); assert.equal(await banner.count(), 0);
    const independent = await context.newPage(); monitor(independent); await independent.goto(base, { waitUntil: "domcontentloaded" });
    await independent.locator("[data-privacy-banner]").waitFor(); await independent.close();
    scenarios.push("Close does not register a choice; remains hidden through reload/navigation; independent tab shows notice");
    await page.locator('footer a[href="#privacy-settings"]').click();
    await page.getByRole("button", { name: "Закрыть настройки без сохранения" }).click();
    assert.equal(await banner.count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("href")), "#privacy-settings");
    scenarios.push("Footer source remains distinct: closing unsaved settings does not resurrect a previously hidden notice");
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.locator("footer").screenshot({ path: path.join(output, "footer-control.png") });
    const footerBefore = await readFile("artifacts/privacy-consent/footer-crop-1440.png");
    assert.equal(footerBefore.equals(await readFile(path.join(output, "footer-control.png"))), true, "Frozen desktop footer pixels");

    for (const width of [320, 360, 375, 390, 430, 768, 820]) {
      const mobile = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
      const p = await mobile.newPage(); monitor(p); await p.goto(base, { waitUntil: "domcontentloaded" }); await p.getByRole("dialog").waitFor(); await ready(p);
      assert.equal(await p.getByRole("button", { name: "Закрыть уведомление" }).count(), 0);
      assert.equal(await p.getByRole("button", { name: "Принять", exact: true }).isDisabled(), true);
      const mobileBounds = await p.getByRole("dialog").boundingBox(); assert.ok(mobileBounds);
      if (width < 640) { assert.equal(mobileBounds.width, width - 28); assert.ok(Math.abs(mobileBounds.y + mobileBounds.height - 830) < 1); }
      await p.screenshot({ path: path.join(output, `banner-control-${width}.png`) });
      await p.getByRole("link", { name: "Прочитать согласие", exact: true }).click();
      assert.equal(normalize(await p.locator("[data-consent-text]").innerText()), normalize(source));
      assert.equal(await p.getByRole("dialog").evaluate(e => e.scrollWidth > e.clientWidth), false);
      await p.screenshot({ path: path.join(output, `consent-${width}.png`) });
      await p.locator("[data-consent-text]").locator("..").evaluate(e => { e.scrollTop = e.scrollHeight; });
      await p.getByRole("button", { name: "Назад", exact: true }).click();
      await p.getByRole("link", { name: "Настроить", exact: true }).click(); await p.getByRole("switch").check();
      await p.getByRole("link", { name: "Прочитать полное согласие", exact: true }).click(); await p.getByRole("button", { name: "Назад", exact: true }).click();
      assert.equal(await p.getByRole("switch").isChecked(), true);
      await p.setViewportSize({ width, height: 360 }); await p.getByRole("link", { name: "Прочитать полное согласие", exact: true }).click();
      assert.equal(await p.getByRole("button", { name: "Назад", exact: true }).isVisible(), true);
      await p.screenshot({ path: path.join(output, `consent-short-${width}.png`) });
      (report.mobile as unknown[]).push({ width, bounds: mobileBounds, modalBannerPreserved: true, documentExact: true, draftPreserved: true });
      await mobile.close();
    }
    // Actual database outage, without fulfilling/intercepting the API.
    const failureContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const failurePage = await failureContext.newPage(); monitor(failurePage); await failurePage.goto(base);
    await failurePage.locator("[data-privacy-banner]").getByRole("button", { name: "Только необходимые", exact: true }).click();
    // Scope the failure to our error dialog, not Next.js's route-announcer live region.
    await failurePage.getByRole("dialog").getByText("Аналитика отключена. Не удалось записать выбор на сервере. Повторите попытку.", { exact: true }).waitFor();
    assert.equal(await failurePage.getByRole("button", { name: "Сохраняем…", exact: true }).count(), 0);
    assert.equal(await failurePage.getByText("Настройки сохранены", { exact: true }).count(), 0);
    assert.equal(await failurePage.evaluate(key => JSON.parse(localStorage.getItem(key)!).decision, key), "declined");
    await failurePage.screenshot({ path: path.join(output, "actual-server-error.png") }); await failureContext.close();
    scenarios.push("Actual unavailable PostgreSQL: visible error, no false success, local analytics remains off");
    // Explicit mock tests only the existing UI acknowledgement, not PostgreSQL persistence.
    await context.route("**/api/privacy-consent", async route => {
      if (route.request().method() === "GET") { await route.fulfill({ json: { state: "unknown", receiptId: null, documentVersion: null, expiresAt: null, receipts: [] } }); return; }
      if (route.request().method() === "POST" && route.request().postDataJSON().action === "decline") {
        const body = route.request().postDataJSON(); await route.fulfill({ json: { state: "declined", receiptId: body.receiptId, operationId: body.operationId, eventKind: body.action, documentVersion: null, expiresAt: Date.now() + 31536000000 } });
      } else await route.continue();
    });
    await page.locator('footer a[href="#privacy-settings"]').click(); await page.getByRole("button", { name: "Без аналитики", exact: true }).click();
    await page.getByText("Настройки сохранены", { exact: true }).waitFor(); await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.reload({ waitUntil: "domcontentloaded" }); await ready(page); assert.equal(await banner.count(), 0);
    scenarios.push("Mock journal acknowledgement: saved refusal survives reload; positive consent stays blocked by real publication gates");
    assert.deepEqual(errors, []); assert.deepEqual(ownSdk, []);
    assert.ok(consoleErrors.every(message => /Failed to load resource.*503/.test(message)), "Only the intentionally unavailable API may log an expected 503");
    await writeFile(path.join(output, "checks.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
