/** Real standalone UI; disposable synthetic catalog, read-only app role, no migrations. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Page } from "playwright-core";
import postgres from "postgres";
import { availablePort } from "./helpers/privacy-next-environment";

const output = "artifacts/desktop-six-fixes";
const selected = process.argv.find(value => value.startsWith("--case="))?.slice(7);
const docker = (...args: string[]) => execFileSync("docker", ["--context", "desktop-linux", ...args], { encoding: "utf8" }).trim();
const container = `autozap-desktop-ui-${randomUUID()}`;
const identity = "11111111-1111-4111-8111-111111111111";
const secondIdentity = "22222222-2222-4222-8222-222222222222";
const productPath = "/catalog/podveska/stoyki/testovaya-stoyka-ui";
const results: { name: string; passed: boolean; detail?: string }[] = [];
const errors: string[] = [];
let webkit = "Not attempted";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
await mkdir(output, { recursive: true });
const image = docker("image", "inspect", "postgres:16-alpine", "--format", "{{.Id}}");
assert.match(image, /^sha256:[a-f0-9]{64}$/);
docker("run", "--detach", "--pull=never", "--name", container, "--label", "codex.desktop-ui=disposable",
  "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--env", "POSTGRES_DB=desktop_ui_test",
  "--publish", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,size=128m", image);
const info = JSON.parse(docker("inspect", container))[0];
assert.equal(info.Config.Labels["codex.desktop-ui"], "disposable");
assert.ok(info.Mounts.every((mount: { Type: string }) => mount.Type === "tmpfs"));
const binding = info.NetworkSettings.Ports["5432/tcp"][0];
assert.equal(binding.HostIp, "127.0.0.1");
const url = `postgresql://postgres@127.0.0.1:${binding.HostPort}/desktop_ui_test`;
const sql = postgres(url, { max: 1, connect_timeout: 2 });
let app: ReturnType<typeof spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let log = "";
async function check(name: string, work: () => Promise<void>) {
  if (selected && !name.includes(selected)) return;
  try { await work(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, detail: String(error) }); console.error(`FAIL ${name}: ${String(error)}`); }
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${output}/${name}.png` });
}
async function noOverflow(page: Page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal page overflow");
}
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await sql`SELECT 1`; break; } catch { await pause(200); }
  }
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, "desktop_ui_test");
  // Minimal fixtures are created only inside this new tmpfs container. No project migrations/imports.
  await sql.unsafe(`
    CREATE TABLE categories(id uuid PRIMARY KEY, slug text, name text, sort_order int DEFAULT 0, is_active bool DEFAULT true);
    CREATE TABLE subcategories(id uuid PRIMARY KEY, category_id uuid, slug text, name text, is_hidden bool DEFAULT false, is_active bool DEFAULT true);
    CREATE TABLE catalog_versions(id uuid PRIMARY KEY, status text, published_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now());
    CREATE TABLE products(id uuid PRIMARY KEY, product_identity_id uuid, catalog_version_id uuid, shop_code text, name text, slug text, price numeric,
      category_id uuid, subcategory_id uuid, status text DEFAULT 'active', raw_name text DEFAULT 'Тестовая стойка');
    INSERT INTO categories VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','podveska','Подвеска',0,true);
    INSERT INTO subcategories VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','stoyki','Стойки',false,true);
    INSERT INTO catalog_versions(id,status) VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','active');
    INSERT INTO products(id,product_identity_id,catalog_version_id,shop_code,name,slug,price,category_id,subcategory_id,status) VALUES
      ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','${identity}','cccccccc-cccc-4ccc-8ccc-cccccccccccc','UI-1','Тестовая стойка стабилизатора','testovaya-stoyka-ui',1234.50,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','active'),
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','${secondIdentity}','cccccccc-cccc-4ccc-8ccc-cccccccccccc','UI-2','Тестовая стойка вторая','testovaya-stoyka-vtoraya-ui',2345,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','active');
    CREATE ROLE desktop_reader LOGIN;
    GRANT USAGE ON SCHEMA public TO desktop_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO desktop_reader;
  `);
  const port = await availablePort(), base = `http://127.0.0.1:${port}`;
  const readerUrl = url.replace("postgres@", "desktop_reader@");
  app = spawn(process.execPath, [".next/standalone/server.js"], { env: { ...process.env,
    NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port), APP_URL: base,
    DATABASE_URL: readerUrl, MEILI_HOST: "http://127.0.0.1:1", MEILI_MASTER_KEY: "synthetic-local-test-key-12345678",
    YANDEX_METRIKA_COUNTER_ID: "", YANDEX_METRIKA_CONFIGURATION_VERIFIED: "false",
    BACKGROUND_JOBS_ENABLED: "false", IMPORT_WORKER_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1"
  }, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout!.on("data", chunk => { log += chunk; }); app.stderr!.on("data", chunk => { log += chunk; });
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(base + "/api/privacy-consent")).ok) break; } catch { /* Startup. */ }
    await pause(250);
  }
  browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  // Only loopback is reachable from the tested pages. Analytics is disabled at runtime too.
  await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await context.addInitScript(() => {
    // Cross-origin map frames are denied storage and are outside this UI test.
    try { localStorage.setItem("autozap.privacy-choice.v1", JSON.stringify({ version: 1, decision: "declined", expiresAt: Date.now() + 86400000, receiptId: null, documentVersion: null })); } catch { /* Denied frame. */ }
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(10000);
  for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768], [1340, 800], [1280, 800], [1024, 768], [768, 1024], [390, 844], [375, 812]]) {
    await page.setViewportSize({ width, height });
    await check(`${width} empty list, footer and home geometry`, async () => {
      await page.goto(base + "/spisok-pokupok");
      await page.getByText("Ваш список пока пуст", { exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (width >= 1024) {
        const heading = await page.locator("h1").boundingBox(), title = await page.getByText("Ваш список пока пуст", { exact: true }).boundingBox();
        assert.ok(heading && title && title.y - heading.y - heading.height >= 48, "empty-state title gap");
        assert.ok(Math.abs(title!.x + title!.width / 2 - width / 2) < 5, "empty state centered");
      }
      await noOverflow(page); await shot(page, `${width}-empty-list`);
      const footer = await page.locator("footer").boundingBox(); assert.ok(footer && footer.y > 0);
      await page.goto(base);
      await page.evaluate(() => document.fonts.ready); await pause(800);
      await noOverflow(page); await shot(page, `${width}-hero`);
      if (width >= 1024) {
        const geometry = await page.locator(".home-hero-proof").evaluate(panel => {
          const p = panel.getBoundingClientRect();
          return { width: p.width, scroll: panel.scrollWidth, items: [...panel.children].map(item => {
            const r = item.getBoundingClientRect(), icon = item.children[0].getBoundingClientRect(), text = item.children[1].getBoundingClientRect();
            return { left: icon.left - r.left, right: r.right - text.right, textHeight: text.height, height: getComputedStyle(item).lineHeight };
          }) };
        });
        assert.ok(geometry.scroll <= geometry.width + 1, JSON.stringify(geometry));
        assert.ok(geometry.items.every(item => item.left >= 8 && item.right >= 8 && item.textHeight <= parseFloat(item.height) + 1), JSON.stringify(geometry));
        assert.ok(Math.abs(geometry.items[0].left - geometry.items[3].right) < 3, JSON.stringify(geometry));
      }
      await page.locator("#catalog").scrollIntoViewIfNeeded(); await pause(350); await shot(page, `${width}-catalog`);
      await page.locator("#vacancies").scrollIntoViewIfNeeded(); await pause(350); await shot(page, `${width}-vacancies`);
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await check("home / category / subcategory / product / back / anchored home, refresh and browser history", async () => {
    await page.goto(base);
    await page.locator('#catalog .catalog-category-grid-desktop [data-category-slug="podveska"]').click();
    await page.waitForURL("**/catalog/podveska?from=home-catalog");
    assert.equal(await page.locator(".catalog-page-back").getAttribute("href"), "/#catalog");
    await page.locator('a[href*="/podveska/stoyki"]').first().click();
    await page.waitForURL("**/stoyki?from=home-catalog");
    await page.locator('a[href*="testovaya-stoyka-ui"]').click();
    await page.waitForURL("**/testovaya-stoyka-ui?from=home-catalog");
    await page.reload();
    await page.locator(".catalog-page-back").click(); await page.waitForURL("**/stoyki?from=home-catalog");
    await page.locator(".catalog-page-back").click(); await page.waitForURL("**/podveska?from=home-catalog");
    await page.locator(".catalog-page-back").click(); await page.waitForURL(base + "/#catalog"); await pause(700);
    const header = await page.locator(".catalog-desktop-heading").boundingBox();
    assert.ok(header && header.y >= 90 && header.y < 400, JSON.stringify(header));
    await shot(page, "navigation-return-to-catalog");
    await page.goto(base);
    await page.locator('#catalog [data-category-slug="podveska"]').click();
    await page.waitForURL("**/podveska?from=home-catalog");
    await page.goBack(); await pause(400);
    assert.equal(new URL(page.url()).pathname, "/");
    assert.ok(await page.locator(".catalog-desktop-heading").isVisible());
  });
  await check("direct catalog, category, subcategory and product use safe hierarchy without history", async () => {
    await page.goto(base + "/catalog");
    await page.locator('[data-category-slug="podveska"]').click();
    await page.waitForURL("**/catalog/podveska");
    assert.equal(await page.locator(".catalog-page-back").getAttribute("href"), "/catalog");
    for (const [path, expected] of [["/catalog/podveska", "/catalog"], ["/catalog/podveska/stoyki", "/catalog/podveska"], [productPath, "/catalog/podveska/stoyki"], [productPath + "?from=purchase-list-direct", "/spisok-pokupok"]]) {
      await page.goto(base + path); assert.equal(await page.locator(".catalog-page-back").getAttribute("href"), expected);
    }
  });
  await check("product button matches reviews: normal, hover, focus, active; add, one and multiple items", async () => {
    await page.goto(base); const review = page.locator(".customer-reviews-action-primary").first();
    const style = (selector: string) => page.locator(selector).first().evaluate(el => {
      const s = getComputedStyle(el); return [s.backgroundImage, s.borderColor, s.borderRadius, s.boxShadow, s.transition, s.color, s.fontFamily, s.fontWeight, s.fontSize, s.lineHeight];
    });
    const normal = await style(".customer-reviews-action-primary");
    await review.hover(); await pause(220); const hover = await style(".customer-reviews-action-primary");
    await page.goto(base + productPath); const button = page.getByRole("button", { name: "Добавить в список покупок", exact: true });
    await button.waitFor(); await page.mouse.move(0, 0); await pause(220);
    assert.deepEqual(await style(".purchase-list-add-action"), normal);
    await shot(page, "product-button");
    await button.hover(); await pause(220); assert.deepEqual(await style(".purchase-list-add-action"), hover);
    await button.focus(); assert.equal(await button.evaluate(el => getComputedStyle(el).outlineStyle), "solid");
    await page.mouse.down(); assert.equal(await button.evaluate(el => getComputedStyle(el).transform), "none"); await page.mouse.up();
    await page.getByText("✓ В списке").waitFor();
    await page.goto(base + "/spisok-pokupok"); await page.getByRole("heading", { name: "Тестовая стойка стабилизатора", exact: true }).waitFor();
    await noOverflow(page); await shot(page, "list-one-item");
    await page.evaluate(id => localStorage.setItem("autozap.purchase-list.v2", JSON.stringify(["11111111-1111-4111-8111-111111111111", id])), secondIdentity);
    await page.reload(); await page.getByRole("heading", { name: "Тестовая стойка вторая", exact: true }).waitFor();
    await noOverflow(page); await shot(page, "list-multiple-items");
  });
  await check("vacancy remains static through slow, fast and reverse scrolling; phone hover works", async () => {
    await page.goto(base); await page.evaluate(() => document.fonts.ready);
    await page.locator("#vacancies").scrollIntoViewIfNeeded(); await pause(800);
    const initial = await page.locator(".home-vacancy-title").evaluate(el => el.getBoundingClientRect().top - el.closest(".home-vacancies-panel")!.getBoundingClientRect().top);
    const top = await page.evaluate(() => scrollY);
    for (const [index, offset] of [0, 15, 45, 110, 500, -200, 0, 600, 0].entries()) {
      await page.evaluate(y => scrollTo({ top: y, behavior: "instant" }), top + offset); await pause(index < 4 ? 90 : 20);
      const state = await page.locator(".home-vacancy-title").evaluate(el => ({ top: el.getBoundingClientRect().top - el.closest(".home-vacancies-panel")!.getBoundingClientRect().top,
        moving: el.closest("#vacancies")!.getAnimations({ subtree: true }).filter(animation => animation.playState === "running").length }));
      assert.ok(Math.abs(state.top - initial) < 1, JSON.stringify({ ...state, initial, offset, index })); assert.equal(state.moving, 0);
      await shot(page, `vacancy-frame-${index}`);
    }
    const phone = page.locator(".home-vacancy-phone"); const before = await phone.evaluate(el => getComputedStyle(el).backgroundImage);
    await phone.hover(); await pause(200); assert.notEqual(await phone.evaluate(el => getComputedStyle(el).backgroundImage), before);
  });
  await check("gallery all photos, reverse, rapid switching, aspect ratios, Escape, reopen and focus", async () => {
    await page.goto(base); const trigger = page.locator(".shop-gallery-grid button").first(); await trigger.click();
    const dialog = page.locator(".store-lightbox"); await dialog.waitFor(); await pause(300);
    const current = () => page.locator(".store-lightbox-photo--current");
    for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768], [1280, 800], [390, 844], [375, 812]]) {
      await page.setViewportSize({ width, height }); await pause(100);
      const box = await current().boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height < height);
      await shot(page, `${width}-gallery`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    for (let index = 0; index < 6; index++) {
      await current().evaluate(async image => { if (image instanceof HTMLImageElement) await image.decode(); });
      const box = await current().boundingBox(); assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1441 && box.y + box.height < 900);
      await shot(page, `gallery-photo-${index}`);
      await dialog.getByRole("button", { name: "Следующее фото", exact: true }).click(); await pause(230);
    }
    await dialog.getByRole("button", { name: "Предыдущее фото", exact: true }).click(); await pause(230);
    assert.match(await dialog.getAttribute("aria-label") ?? "", /^Фото 6 из 6/);
    for (let index = 0; index < 12; index++) {
      await page.keyboard.press(index % 3 ? "ArrowRight" : "ArrowLeft"); await pause(35);
      assert.equal(await dialog.locator("img").count(), 1);
      assert.ok(await current().evaluate(el => el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0 && Number(getComputedStyle(el).opacity) >= 0.85));
      await shot(page, `gallery-transition-${index}`);
    }
    await pause(250); assert.equal(await dialog.locator("img").count(), 1);
    await page.keyboard.press("Escape"); await dialog.waitFor({ state: "detached" });
    await trigger.click(); await dialog.waitFor(); await dialog.getByRole("button", { name: "Закрыть", exact: true }).click(); await dialog.waitFor({ state: "detached" });
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
  });
  await check("delayed gallery image keeps the old photo; stale decode cannot replace a newer selection", async () => {
    const delayedContext = await browser!.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    await delayedContext.route("**/*", async route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin !== base) return route.abort();
      if (requestUrl.pathname.endsWith("gallery-masla.webp")) await waiting;
      return route.continue();
    });
    const delayedPage = await delayedContext.newPage();
    try {
      await delayedPage.goto(base, { waitUntil: "domcontentloaded" });
      await delayedPage.locator(".shop-gallery-grid button").first().click();
      const modal = delayedPage.locator(".store-lightbox");
      const next = modal.getByRole("button", { name: "Следующее фото", exact: true });
      const photo = delayedPage.locator(".store-lightbox-photo--current");
      await next.click(); await delayedPage.waitForFunction(() => document.querySelector(".store-lightbox-photo--current")?.getAttribute("src")?.endsWith("gallery-akkumulyatory.webp"));
      await next.click(); await pause(250);
      assert.match(await photo.getAttribute("src") ?? "", /gallery-akkumulyatory.webp$/);
      assert.ok(await photo.evaluate(el => el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0));
      await next.click(); await delayedPage.waitForFunction(() => document.querySelector(".store-lightbox-photo--current")?.getAttribute("src")?.endsWith("gallery-aksessuary.webp"));
      release(); await pause(350);
      assert.match(await photo.getAttribute("src") ?? "", /gallery-aksessuary.webp$/);
      assert.equal(await modal.locator("img").count(), 1);
    } finally { release(); await delayedContext.close(); }
  });
  await check("mobile product and gallery controls preserve layout and touch navigation", async () => {
    for (const [width, height] of [[390, 844], [375, 812]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => localStorage.removeItem("autozap.purchase-list.v2"));
      await page.goto(base + productPath); await page.getByRole("button", { name: "Добавить в список покупок", exact: true }).waitFor();
      await noOverflow(page); await shot(page, `${width}-product`);
      await page.goto(base); await page.locator(".photo-snap-scroll button").first().click();
      const modal = page.locator(".store-lightbox");
      await modal.getByRole("button", { name: "Следующее фото", exact: true }).click(); await pause(250);
      assert.match(await modal.getAttribute("aria-label") ?? "", /^Фото 2 из 6/);
      await page.keyboard.press("Escape"); await modal.waitFor({ state: "detached" });
    }
  });
  await context.close();
  const safariPort = await availablePort();
  const safari = spawn("/usr/bin/safaridriver", ["--port", String(safariPort)], { stdio: "ignore" });
  let safariSession: string | undefined;
  const webdriver = async (path: string, body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${safariPort}${path}`, {
      method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.value?.message ?? `WebDriver ${response.status}`);
    return result.value;
  };
  try {
    await pause(500);
    const session = await webdriver("/session", { capabilities: { alwaysMatch: { browserName: "safari" } } });
    safariSession = session.sessionId;
    webkit = `Safari ${session.capabilities.browserVersion}`;
    await check("Safari actual WebKit: empty list, Hero, context navigation, vacancy and gallery", async () => {
      const root = `/session/${safariSession}`;
      const execute = (script: string) => webdriver(root + "/execute/sync", { script, args: [] });
      await webdriver(root + "/window/rect", { width: 1440, height: 900 });
      await webdriver(root + "/url", { url: base + "/spisok-pokupok" }); await pause(800);
      assert.ok(await execute("return document.body.textContent.includes('Ваш список пока пуст')"));
      await webdriver(root + "/url", { url: base }); await pause(800);
      assert.ok(await execute("const p=document.querySelector('.home-hero-proof');return p.scrollWidth<=p.clientWidth+1"));
      await execute("document.querySelector('#catalog [data-category-slug=podveska]').click()"); await pause(800);
      assert.equal(await execute("return document.querySelector('.catalog-page-back').getAttribute('href')"), "/#catalog");
      await webdriver(root + "/url", { url: base + productPath }); await pause(600);
      assert.ok(await execute("return getComputedStyle(document.querySelector('.purchase-list-add-action')).backgroundImage.includes('gradient')"));
      await webdriver(root + "/url", { url: base }); await pause(600);
      assert.equal(await execute("return getComputedStyle(document.querySelector('.home-vacancy')).animationName"), "none");
      await execute("document.querySelector('.shop-gallery-grid button').click()"); await pause(400);
      for (let index = 0; index < 6; index++) {
        await execute("document.querySelector('.store-lightbox-next').click()"); await pause(230);
        assert.equal(await execute("return document.querySelectorAll('.store-lightbox img').length"), 1);
      }
      const screenshot = await webdriver(root + "/screenshot");
      await writeFile(`${output}/safari-gallery.png`, Buffer.from(screenshot, "base64"));
    });
  } catch (error) { webkit = `Unavailable: ${String(error)}`; console.log(webkit); }
  finally {
    if (safariSession) await fetch(`http://127.0.0.1:${safariPort}/session/${safariSession}`, { method: "DELETE" }).catch(() => {});
    safari.kill("SIGTERM");
  }
} finally {
  await browser?.close(); app?.kill("SIGTERM"); await sql.end({ timeout: 1 });
  assert.equal(JSON.parse(docker("inspect", container))[0].Config.Labels["codex.desktop-ui"], "disposable");
  docker("rm", "--force", container);
  await writeFile(`${output}/browser-server.log`, log);
  await writeFile(`${output}/browser-report${selected ? "-focused" : ""}.json`, JSON.stringify({ results, errors, fixture: "new loopback-only tmpfs PostgreSQL; synthetic catalog; read-only app role; no migrations", webkit }, null, 2));
}
assert.ok(results.every(result => result.passed), "See browser-report.json");
assert.deepEqual(errors, []);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
