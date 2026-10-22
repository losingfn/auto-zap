/** Real Next/App Router + disposable PostgreSQL + authentic local SDK bytes.
 * Run only through the OS network sandbox. No vendor response/config is fetched.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Browser, BrowserContext, Page, Request } from "playwright-core";
import { privacyNextEnvironment } from "./helpers/privacy-next-environment";
import { PRIVACY_STORAGE_KEY } from "../src/features/privacy/domain";
import { analyticsConsentVersion } from "../src/features/privacy/consent-content";

const { launchIsolatedBrowser, probe } = createRequire(import.meta.url)("./test-privacy-network-isolation.cjs") as {
  launchIsolatedBrowser: (port: number, output: string, options?: { headless: boolean }) => Promise<{ browser: Browser; profile: string; cleanup: () => Promise<void> }>;
  probe: (browser: Browser, base: string) => Promise<unknown>;
};
const rootOutput = resolve("artifacts/metrika-sdk-isolated");
const supplement = process.argv.includes("--supplement");
const selectedCase = process.argv.find(arg => arg.startsWith("--case="))?.slice(7);
const runLabel = process.argv.find(arg => arg.startsWith("--run-label="))?.slice(12);
if (runLabel) assert.match(runLabel, /^[a-z0-9-]+$/);
const output = runLabel ? join(rootOutput, runLabel) : supplement ? join(rootOutput, "supplement") : rootOutput, counter = 113668070;
const sdkExpectedHash = "68061292988624f0c4a26b4d72588ce6e1dcb0d19576519a572f6dab5b9c1922";
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
type Attempt = { at: number; phase: string; url: string; method: string; type: string; headers: Record<string, string>; body: string | null; bodyBase64: string | null; end?: number; result?: string };
const attempts: Attempt[] = [], api: { at: number; phase: string; action: string; status: number }[] = [];
const results: { name: string; passed: boolean; detail?: string }[] = [], errors: string[] = [];
const receipts = new Set<string>();
const privateNeedles = new Set(["qa-private-marker", "70001234567", "+7 (000) 123-45-67"]);
const evidence: Record<string, unknown> = { counter, sdkExpectedHash, productionCodeChanged: false };
let phase = "setup", holdSdk = false, releases: (() => void)[] = [], sdkEntered: (() => void) | undefined;
let holdGrant = false, grantRelease: (() => void) | undefined, grantEntered: (() => void) | undefined;
let base = "";
let holdInitAck = false, initAckEntered: (() => void) | undefined, initAckReleases: (() => void)[] = [];
async function check(name: string, work: () => Promise<void>) {
  if (selectedCase && !name.includes(selectedCase)) return;
  if (supplement !== name.startsWith("supplement:")) return;
  phase = name;
  try { await work(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { const detail = String(error); results.push({ name, passed: false, detail }); console.error(`FAIL ${name}: ${detail}`); }
}
async function calls(page: Page, method: string) {
  return page.evaluate(method => ((window as unknown as { __ymCalls?: unknown[][] }).__ymCalls ?? []).filter(c => c[1] === method), method);
}
async function readChoice(page: Page) {
  const value = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), PRIVACY_STORAGE_KEY);
  if (value?.receiptId) receipts.add(value.receiptId); return value;
}
async function settle(page: Page) { await page.waitForTimeout(700); }
async function hit(page: Page, count = 1) {
  await page.waitForFunction(count => ((window as unknown as { __ymCalls?: unknown[][] }).__ymCalls ?? []).filter(c => c[1] === "hit").length >= count, count, { timeout: 12000 });
  await settle(page);
}
function viewsSince(index: number) {
  return attempts.slice(index).filter(a => { const url = new URL(a.url); return url.pathname === `/watch/${counter}` && !url.searchParams.has("nohit"); });
}
async function networkView(index: number, count = 1) {
  for (let i = 0; i < 60 && viewsSince(index).length < count; i++) await delay(50);
  assert(viewsSince(index).length >= count, "The actual SDK must attempt manual pageviews, not only nohit initialization");
}
async function settings(page: Page) {
  const banner = page.locator("[data-privacy-banner]");
  if (await banner.isVisible()) await banner.getByRole("button", { name: "Настроить", exact: true }).click();
  else await page.locator('footer a[href="#privacy-settings"]').click();
  await page.getByRole("dialog").waitFor();
}
async function save(page: Page, grant: boolean) {
  await settings(page);
  await page.getByRole("switch").setChecked(grant);
  if (!grant) await page.getByRole("button", { name: "Сохранить настройки", exact: true }).evaluate(button => {
    button.addEventListener("click", () => { Object.assign(window, { __withdrawAt: Date.now() }); }, { capture: true, once: true });
  });
  await page.getByRole("button", { name: "Сохранить настройки", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 12000 });
  await readChoice(page); await settle(page);
}
async function main() {
  await mkdir(output, { recursive: true });
  const sdk = await readFile(join(rootOutput, "tag.js"));
  assert.equal(createHash("sha256").update(sdk).digest("hex"), sdkExpectedHash);
  const previousProbe = JSON.parse(await readFile(join(rootOutput, "isolation-probe.json"), "utf8"));
  assert.equal(previousProbe.probe.passed, true, "SDK execution requires the separate successful OS probe");
  const env = await privacyNextEnvironment(output, false, { existingBuild: true, counterId: counter });
  Object.assign(evidence, env.evidence); base = env.base;
  evidence.buildId = (await readFile(".next/BUILD_ID", "utf8")).trim();
  let isolated: Awaited<ReturnType<typeof launchIsolatedBrowser>> | undefined;
  const contexts: BrowserContext[] = [];
  const rows = async (id: string) => env.app`SELECT kind,document_version FROM privacy_consent_events WHERE receipt_hash=${id} ORDER BY occurred_at`;
  async function context() {
    const ctx = await isolated!.browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } }); contexts.push(ctx);
    ctx.setDefaultTimeout(8000);
    await ctx.addInitScript({ content: `{
      const target = window;
      target.__ymCalls = []; target.__documentToken = String(Math.random()) + Date.now();
      target.__ymThrows = [];
      const proxies = new WeakSet();
      function wrap(value) {
        if (typeof value !== "function" || proxies.has(value)) return value;
        const proxy = new Proxy(value, { apply(fn, receiver, args) {
          target.__ymCalls.push([...args]);
          try { return Reflect.apply(fn, receiver, args); }
          catch (error) { target.__ymThrows.push({ method: args[1], error: String(error), stack: error instanceof Error ? error.stack : "" }); throw error; }
        } });
        proxies.add(proxy); return proxy;
      }
      let current;
      Object.defineProperty(window, "ym", { configurable: true, get: () => current, set: value => {
        current = wrap(value);
      } });
      document.addEventListener("load", event => {
        if (event.target instanceof HTMLScriptElement && event.target.hasAttribute("data-autozap-analytics")) {
          Object.defineProperty(window, "ym", { configurable: true, writable: true, value: wrap(window.ym) });
        }
      }, true);
    }` });
    const requestRecords = new WeakMap<Request, Attempt>();
    ctx.on("request", request => {
      if (new URL(request.url()).origin === base) return;
      const body = request.postDataBuffer();
      const record: Attempt = { at: Date.now(), phase, url: request.url(), method: request.method(), type: request.resourceType(),
        headers: request.headers(), body: request.postData(), bodyBase64: body?.toString("base64") ?? null };
      attempts.push(record); requestRecords.set(request, record);
    });
    ctx.on("requestfinished", r => { const row = requestRecords.get(r); if (row) { row.end = Date.now(); row.result = "locally fulfilled"; } });
    ctx.on("requestfailed", r => { const row = requestRecords.get(r); if (row) { row.end = Date.now(); row.result = r.failure()?.errorText; } });
    ctx.on("page", page => {
      page.on("pageerror", error => errors.push(`${phase}: ${error.message}`));
      page.on("websocket", socket => attempts.push({ at: Date.now(), phase, url: socket.url(), method: "WEBSOCKET", type: "websocket", headers: {}, body: null, bodyBase64: null }));
    });
    // This is observation/local substitution in addition to, never instead of, the OS sandbox.
    await ctx.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === base) {
        if (url.pathname === "/api/privacy-consent" && request.method() === "POST") {
          const input = request.postDataJSON();
          if (holdGrant && input.action === "grant") {
            grantEntered?.(); await new Promise<void>(resolve => { grantRelease = resolve; });
          }
        }
        await route.continue(); return;
      }
      if (url.href === "https://mc.yandex.ru/metrika/tag.js") {
        if (holdSdk) { sdkEntered?.(); await new Promise<void>(resolve => releases.push(resolve)); }
        await route.fulfill({ contentType: "application/javascript", body: sdk }); return;
      }
      // Minimal synthetic transport ACK, with no account features. Never fetch
      // real account configuration. JSONP must call its callback; otherwise the
      // SDK's settings gate never releases queued manual views.
      const callback = url.searchParams.get("callback");
      if (holdInitAck && url.pathname === `/watch/${counter}` && url.searchParams.get("nohit") === "1") {
        initAckEntered?.(); await new Promise<void>(resolve => initAckReleases.push(resolve));
      }
      const jsonp = callback && /^_ymjsp\d+$/.test(callback);
      const body = JSON.stringify({ settings: {} });
      await route.fulfill({ status: 200, contentType: jsonp ? "application/javascript" : "application/json",
        body: jsonp ? `${callback}(${body});` : body,
        headers: { "Access-Control-Allow-Origin": base, "Access-Control-Allow-Credentials": "true" } });
    });
    ctx.on("response", response => {
      if (response.url() !== base + "/api/privacy-consent") return;
      const request = response.request(); api.push({ at: Date.now(), phase, status: response.status(),
        action: request.method() === "POST" ? request.postDataJSON().action : "GET" });
    });
    return ctx;
  }
  async function visit(ctx: BrowserContext, path = "/") {
    const page = await ctx.newPage(); const response = await page.goto(base + path, { waitUntil: "domcontentloaded" });
    await page.bringToFront(); assert.equal(response?.status(), 200, path); await settle(page); return page;
  }
  async function granted() {
    const ctx = await context(), page = await visit(ctx);
    await page.locator("[data-privacy-banner]").getByRole("button", { name: "Принять", exact: true }).click();
    await hit(page); const local = await readChoice(page); assert.equal(local.decision, "granted");
    assert.equal((await rows(local.receiptId))[0].kind, "grant"); return { ctx, page };
  }
  try {
    isolated = await launchIsolatedBrowser(Number(new URL(base).port), output, { headless: !process.argv.includes("--headed") });
    evidence.headed = process.argv.includes("--headed");
    evidence.osProfile = isolated.profile;
    evidence.chrome = isolated.browser.version();
    // Fresh check for this exact browser process and permitted application port, before SDK bytes can execute.
    evidence.browserProbe = await probe(isolated.browser, base);
    evidence.sdk = { source: "https://mc.yandex.ru/metrika/tag.js", localFile: "artifacts/metrika-sdk-isolated/tag.js", sha256: sdkExpectedHash, bytes: sdk.length };
    await check("supplement: actual visibility with focus emulation disabled", async () => {
      const { ctx, page } = await granted(); const before = attempts.length;
      await (await ctx.newCDPSession(page)).send("Emulation.setFocusEmulationEnabled", { enabled: false });
      const other = await ctx.newPage(); await other.goto("about:blank");
      await (await ctx.newCDPSession(other)).send("Emulation.setFocusEmulationEnabled", { enabled: false });
      await other.bringToFront(); await page.waitForFunction(() => document.visibilityState === "hidden");
      await delay(400); const hidden = await page.evaluate(() => document.visibilityState);
      await page.bringToFront(); await page.waitForFunction(() => document.visibilityState === "visible"); await delay(1000);
      evidence.realVisibility = { hidden, resumed: await page.evaluate(() => document.visibilityState), calls: await page.evaluate("window.__ymCalls") };
      assert.equal((await calls(page, "hit")).length, 1); assert.equal(viewsSince(before).length, 0); await ctx.close();
    });
    await check("supplement: real shopping list and realistic synthetic form values", async () => {
      const ctx = await context(), page = await visit(ctx, env.productPath);
      await page.getByRole("button", { name: "Добавить в список покупок", exact: true }).click();
      const list = await page.evaluate(() => JSON.parse(localStorage.getItem("autozap.purchase-list.v2") ?? "[]"));
      assert.equal(list.length, 1); for (const id of list) privateNeedles.add(id);
      privateNeedles.add(env.productName); privateNeedles.add("testovaya-stoyka-ui");
      await page.goto(base); await page.locator("[data-privacy-banner]").getByRole("button", { name: "Принять", exact: true }).click(); await hit(page);
      await page.evaluate(() => {
        const form = document.createElement("form"); form.id = "qa-sensitive-form";
        form.innerHTML = '<input id="qa-email" type="email" name="email"><input id="qa-phone" type="tel" name="phone"><textarea id="qa-message"></textarea><button type="submit">Test submit</button>';
        form.addEventListener("submit", event => event.preventDefault()); document.body.appendChild(form);
      });
      await page.locator("#qa-email").fill("qa-private-marker@example.invalid"); await page.locator("#qa-phone").fill("+7 (000) 123-45-67");
      await page.locator("#qa-message").fill("qa-private-marker form body"); await page.locator("#qa-sensitive-form button").click();
      await page.locator('a[href="/catalog/podveska"]:visible').first().click(); await page.waitForURL(base + "/catalog/podveska"); await hit(page, 2);
      evidence.actualShoppingList = { count: list.length, synthetic: true }; await ctx.close();
    });
    await check("supplement: SDK command after withdrawal must not replay on regrant", async () => {
      const { ctx, page } = await granted(); await save(page, false);
      const before = attempts.length;
      await page.evaluate(`window.ym(${counter},'hit',location.origin+'/catalog/queued-after-withdrawal')`); await delay(1200);
      assert.equal(attempts.length, before, "No immediate request while withdrawn");
      await save(page, true); await delay(1500);
      const replay = viewsSince(before).map(a => new URL(a.url).searchParams.get("page-url"));
      evidence.postWithdrawalReplay = replay;
      await ctx.close();
      assert.equal(replay.includes(base + "/catalog/queued-after-withdrawal"), false, "Withdrawn SDK command replayed under a later grant");
    });
    await check("supplement: pending pre-withdrawal view; late response; regrant", async () => {
      const ctx = await context(), page = await visit(ctx); holdInitAck = true;
      const entered = new Promise<void>(resolve => { initAckEntered = resolve; });
      await page.locator("[data-privacy-banner]").getByRole("button", { name: "Принять", exact: true }).click();
      await Promise.race([entered, delay(7000).then(() => { throw new Error("No held initialization ACK"); })]);
      await hit(page); await save(page, false);
      const withdrawnAt = await page.evaluate<number>("window.__withdrawAt"), before = attempts.length;
      holdInitAck = false; initAckReleases.splice(0).forEach(resolve => resolve()); await delay(1800);
      evidence.lateResponseAfterWithdrawal = { withdrawnAt, attempts: attempts.slice(before) };
      // Keep every external attempt, including independent map requests, in the
      // journal. Do not classify only manual views: transport fallback nohit=1
      // requests initiated after withdrawal are also a failure of SDK stopping.
      const allAfterWithdrawal = attempts.filter(a => a.phase === phase && a.at >= withdrawnAt);
      evidence.allAttemptsAfterWithdrawal = allAfterWithdrawal;
      assert.equal(viewsSince(before).length, 0, "Previously queued view must not escape after late init response");
      assert(allAfterWithdrawal.every(a => a.url.startsWith("https://yandex.ru/map-widget/v1/")), "No SDK request of any kind after withdrawal; independent map remains in the full log");
      const beforeRenewal = attempts.length; await save(page, true); await delay(1500);
      evidence.pendingViewRegrant = viewsSince(beforeRenewal);
      assert.equal(viewsSince(beforeRenewal).length, 1, "Only fresh view on regrant, no older pending view"); await ctx.close();
    });
    await check("A first visit", async () => {
      const ctx = await context(), page = await visit(ctx);
      await page.locator("[data-privacy-banner]").waitFor();
      assert.equal((await calls(page, "init")).length, 0);
      assert.equal(attempts.filter(r => r.url.includes("metrika") || r.url.includes(`/watch/${counter}`)).length, 0);
      assert.equal((await ctx.cookies()).some(c => c.name.startsWith("_ym")), false); await ctx.close();
    });
    await check("B explicit refusal", async () => {
      const ctx = await context(), page = await visit(ctx); const before = attempts.length;
      await page.locator("[data-privacy-banner]").getByRole("button", { name: "Только необходимые", exact: true }).click();
      await settle(page); const local = await readChoice(page); assert.equal(local.decision, "declined");
      assert.equal((await rows(local.receiptId))[0].kind, "decline");
      assert.equal(attempts.length, before); assert.equal((await calls(page, "init")).length, 0); await ctx.close();
    });
    await check("C server ACK before SDK; one init and view", async () => {
      const ctx = await context(), page = await visit(ctx); holdGrant = true; const before = attempts.length;
      const entered = new Promise<void>(resolve => { grantEntered = resolve; });
      await page.locator("[data-privacy-banner]").getByRole("button", { name: "Принять", exact: true }).click();
      await Promise.race([entered, delay(7000).then(() => { throw new Error("grant not reached"); })]);
      assert.equal((await calls(page, "init")).length, 0); assert.equal(await page.locator('script[data-autozap-analytics]').count(), 0);
      grantRelease?.(); holdGrant = false;
      await hit(page); const local = await readChoice(page);
      assert.equal((await rows(local.receiptId))[0].document_version, analyticsConsentVersion);
      assert.equal((await calls(page, "init")).length, 1); assert.equal((await calls(page, "hit")).length, 1);
      assert(await page.evaluate(`Boolean(window.Ya?.Metrika2 && window.yaCounter${counter})`), "Actual SDK must construct its counter");
      await networkView(before); assert.equal(viewsSince(before).length, 1, "One actual manual view");
      evidence.initialCalls = await page.evaluate("window.__ymCalls");
      await ctx.close();
    });
    await check("settings pause; visibility attempt; real client routes and A-B-A", async () => {
      const { ctx, page } = await granted();
      await settings(page); await page.getByRole("button", { name: "Закрыть настройки без сохранения" }).click(); await settle(page);
      assert.equal((await calls(page, "hit")).length, 1, "Settings must not repeat hit");
      const beforeVisibility = attempts.length;
      const other = await ctx.newPage(); await other.goto("about:blank"); await other.bringToFront();
      const hidden = await page.evaluate(() => document.visibilityState);
      await page.bringToFront(); await settle(page);
      evidence.realVisibilitySupported = hidden === "hidden" && await page.evaluate(() => document.visibilityState) === "visible";
      await other.close();
      assert.equal((await calls(page, "hit")).length, 1, "Actual visibility resume must not repeat hit");
      assert.equal(viewsSince(beforeVisibility).length, 0, "Actual visibility resume must not repeat network view");
      const token = await page.evaluate("window.__documentToken");
      await page.locator('a[href="/catalog/podveska"]:visible').first().click(); await page.waitForURL(base + "/catalog/podveska"); await hit(page, 2);
      assert.equal(await page.evaluate("window.__documentToken"), token, "Real client navigation retains the document");
      await page.goBack(); await page.waitForURL(base + "/"); await hit(page, 3);
      await page.goForward(); await page.waitForURL(base + "/catalog/podveska"); await hit(page, 4);
      await page.locator('a[href="/catalog"]:visible').first().click(); await page.waitForURL(base + "/catalog"); await hit(page, 5);
      await page.locator('a[href="/catalog/podveska"]:visible').first().click(); await page.waitForURL(base + "/catalog/podveska"); await hit(page, 6);
      await page.locator(`a[href="${env.subcategoryPath}"]:visible`).first().click(); await page.waitForURL(base + env.subcategoryPath); await hit(page, 7);
      evidence.navigationCalls = await calls(page, "hit");
      await ctx.close();
    });
    await check("rapid real client navigation", async () => {
      const { ctx, page } = await granted();
      for (let i = 0; i < 3; i++) {
        await page.locator('a[href="/catalog/podveska"]:visible').first().click(); await page.waitForURL(base + "/catalog/podveska");
        await page.goBack({ waitUntil: "commit" }); await page.waitForURL(base + "/");
      }
      await settle(page); const urls = (await calls(page, "hit")).map(c => c[2]);
      assert(urls.length <= 7); assert.equal(urls.at(-1), base + "/");
      assert(urls.every((url, i) => i === 0 || url !== urls[i - 1]), "No consecutive duplicate view during rapid navigation");
      evidence.rapidNavigationCalls = urls; await ctx.close();
    });
    await check("D withdrawal; queued commands; cookies; E fresh grant", async () => {
      const { ctx, page } = await granted(); const original = (await readChoice(page)).receiptId;
      const beforeClick = attempts.length;
      await save(page, false); const revokedAt = await page.evaluate<number>("window.__withdrawAt"); evidence.revokedAt = revokedAt;
      assert.equal((await rows(original)).some(r => r.kind === "revoke"), true);
      assert.equal(await page.evaluate(`window.disableYaCounter${counter}`), true);
      assert.equal((await ctx.cookies()).some(c => c.name.startsWith("_ym")), false);
      const before = attempts.length;
      await page.evaluate(`window.ym(${counter},'hit',location.origin+'/catalog')`);
      await delay(3500);
      evidence.afterWithdrawalAttempts = attempts.slice(beforeClick).filter(a => a.at >= revokedAt);
      evidence.preWithdrawalRequestsCompletedLater = attempts.filter(a => a.at < revokedAt && (a.end ?? 0) >= revokedAt).length;
      assert.equal((evidence.afterWithdrawalAttempts as Attempt[]).length, 0, "No request initiated from the withdrawal click onward");
      assert.equal(attempts.length, before, "No new request after confirmed withdrawal");
      assert.equal((await ctx.cookies()).some(c => c.name.startsWith("_ym")), false);
      await save(page, true); await hit(page, 3); // includes the deliberate blocked SDK call above
      const renewed = (await readChoice(page)).receiptId; assert.notEqual(renewed, original);
      assert.equal((await rows(renewed))[0].kind, "grant");
      assert.equal((await calls(page, "init")).length, 2); evidence.renewalCalls = await calls(page, "hit"); await ctx.close();
    });
    await check("F obsolete consent", async () => {
      const { ctx, page } = await granted();
      await page.evaluate(key => { const value = JSON.parse(localStorage.getItem(key)!); value.documentVersion = "sha256:" + "0".repeat(64); localStorage.setItem(key, JSON.stringify(value)); }, PRIVACY_STORAGE_KEY);
      const before = attempts.length; await page.reload(); await settle(page);
      assert.equal((await calls(page, "init")).length, 0);
      assert.equal(attempts.slice(before).some(a => a.url.includes("metrika") || a.url.includes(`/watch/${counter}`)), false); await ctx.close();
    });
    await check("direct excluded routes, query strings, reload, history", async () => {
      const { ctx, page } = await granted(); const records: unknown[] = [];
      for (const path of ["/search?q=qa-private-marker", env.productPath, "/spisok-pokupok", "/privacy", "/privacy/analytics-consent", "/admin/login", "/?q=qa-private-marker", "/?utm_source=qa-private-marker", "/?yclid=qa-private-marker"]) {
        const before = attempts.length; await page.goto(base + path); await settle(page);
        assert.equal((await calls(page, "init")).length, 0, path);
        const own = attempts.slice(before).filter(a => a.url.includes("metrika") || a.url.includes(`/watch/${counter}`));
        assert.equal(own.length, 0, path); records.push({ path, init: 0, sdkAttempts: 0 });
      }
      evidence.excludedRoutes = records;
      await page.goto(base + "/catalog"); await hit(page);
      await page.reload(); await hit(page); assert.equal((await calls(page, "hit")).length, 1);
      await ctx.close();
    });
    await check("actual search submit leaves SDK document; history return", async () => {
      const { ctx, page } = await granted(); const token = await page.evaluate("window.__documentToken");
      const before = attempts.length;
      await page.locator("#home-search").fill("qa-private-marker"); await page.locator("#home-search").press("Enter");
      await page.waitForURL(url => url.pathname === "/search"); await settle(page);
      assert.notEqual(await page.evaluate("window.__documentToken"), token); assert.equal((await calls(page, "init")).length, 0);
      assert.equal(attempts.slice(before).some(a => a.url.includes("qa-private-marker") || a.body?.includes("qa-private-marker")), false);
      await page.goBack(); await page.waitForURL(base + "/"); await settle(page);
      evidence.returnFromSearchHits = (await calls(page, "hit")).length; await ctx.close();
    });
    await check("two tabs: withdrawal blocks resident SDK in both", async () => {
      const { ctx, page } = await granted(); const second = await visit(ctx); await hit(second);
      await page.bringToFront(); await save(page, false);
      await second.waitForFunction(`window.disableYaCounter${counter}===true`);
      const before = attempts.length;
      await second.evaluate(`window.ym(${counter},'hit',location.origin+'/catalog')`); await delay(1800);
      assert.equal(attempts.length, before); assert.equal((await readChoice(second)).decision, "declined"); await ctx.close();
    });
    await check("client excluded product link leaves SDK document", async () => {
      const { ctx, page } = await granted();
      await page.goto(base + env.subcategoryPath); await hit(page); const token = await page.evaluate("window.__documentToken");
      await page.locator(`a[href="${env.productPath}"]`).first().click(); await page.waitForURL(base + env.productPath); await settle(page);
      assert.notEqual(await page.evaluate("window.__documentToken"), token);
      assert.equal((await calls(page, "init")).length, 0);
      await page.goBack(); await page.waitForURL(base + env.subcategoryPath); await settle(page);
      evidence.returnFromProductHits = (await calls(page, "hit")).length; await ctx.close();
    });
    for (const mode of ["withdraw", "navigate", "regrant"] as const) await check(`SDK loading race: ${mode}`, async () => {
      const ctx = await context(), page = await visit(ctx); holdSdk = true;
      const entered = new Promise<void>(resolve => { sdkEntered = resolve; });
      await page.locator("[data-privacy-banner]").getByRole("button", { name: "Принять", exact: true }).click();
      await Promise.race([entered, delay(7000).then(() => { throw new Error("SDK latch not reached"); })]);
      if (mode === "withdraw" || mode === "regrant") { await save(page, false); if (mode === "regrant") await save(page, true); }
      else { await page.locator('a[href="/catalog/podveska"]:visible').first().click(); await page.waitForURL(base + "/catalog/podveska"); }
      holdSdk = false; releases.splice(0).forEach(resolve => resolve()); await delay(1800);
      if (mode === "withdraw") assert.equal((await calls(page, "init")).length, 0);
      else { await hit(page); assert.equal((await calls(page, "hit")).length, 1); assert.equal((await calls(page, "hit"))[0][2], base + (mode === "navigate" ? "/catalog/podveska" : "/")); }
      await ctx.close();
    });
    await check("sensitive synthetic DOM, cookies and storage are absent from SDK payloads", async () => {
      const { ctx, page } = await granted(); const before = attempts.length;
      await page.evaluate(() => {
        const form = document.createElement("form"); form.innerHTML = '<input name="email" value="qa-private-marker@example.invalid"><input name="phone" value="qa-private-marker-phone"><textarea>qa-private-marker-user-text</textarea>';
        document.body.appendChild(form); document.cookie = "qa_app_id=qa-private-marker-cookie; Path=/";
        localStorage.setItem("qa_app_id", "qa-private-marker-storage"); localStorage.setItem("qa_shopping", "qa-private-marker-product");
      });
      await page.locator('a[href="/catalog/podveska"]:visible').first().click(); await page.waitForURL(base + "/catalog/podveska"); await hit(page, 2); await delay(1800);
      evidence.sensitiveDomAttemptCount = attempts.length - before; await ctx.close();
    });
  } finally {
    holdSdk = false; releases.splice(0).forEach(resolve => resolve()); grantRelease?.();
    holdInitAck = false; initAckReleases.splice(0).forEach(resolve => resolve());
    evidence.failedPageSnapshots = await Promise.all(contexts.flatMap(ctx => ctx.pages()).map(async page => {
      try { return { url: page.url(), state: await page.evaluate(`({calls:window.__ymCalls,throws:window.__ymThrows,visibility:document.visibilityState,counter:!!window.yaCounter${counter},choice:JSON.parse(localStorage.getItem('${PRIVACY_STORAGE_KEY}')??'null'),text:document.querySelector('[role=alert]')?.textContent})`) }; }
      catch { return { url: page.url(), closed: true }; }
    }));
    phase = "unload and cleanup";
    await Promise.allSettled(contexts.map(ctx => ctx.close()));
    if (isolated) await isolated.cleanup(); await env.cleanup(); evidence.cleanedUp = true;
    const decoded = attempts.map(a => {
      let value = a.url + "\n" + a.body + "\n" + JSON.stringify(a.headers);
      for (let i = 0; i < 3; i++) { try { const next = decodeURIComponent(value.replaceAll("+", " ")); if (next === value) break; value = next; } catch { break; } }
      return value;
    });
    const forbiddenMarker = decoded.some(s => [...privateNeedles].some(needle => s.includes(needle)));
    const receiptLeaks = [...receipts].filter(id => decoded.some(s => s.includes(id))).length;
    results.push({ name: "actual wire payload: no synthetic sensitive marker or consent receipt", passed: !forbiddenMarker && receiptLeaks === 0 });
    evidence.payloadAnalysis = { attemptedRequests: attempts.length,
      watchRequests: attempts.filter(a => new URL(a.url).pathname === `/watch/${counter}`).length,
      manualViewAttempts: viewsSince(0).length,
      forbiddenMarker, receiptLeaks,
      wireViews: viewsSince(0).map(a => ({ at: a.at, end: a.end, phase: a.phase, pageUrl: new URL(a.url).searchParams.get("page-url"), referrer: new URL(a.url).searchParams.get("page-ref"), result: a.result })),
      endpoints: [...new Set(attempts.map(a => new URL(a.url).origin + new URL(a.url).pathname))],
      limitation: "Raw URL/headers/body captured. Minimal synthetic settings ACK does not reproduce real account settings. All observed SDK requests in this run use inspectable GET query fields." };
    await writeFile(join(output, "requests.json"), JSON.stringify(attempts, null, 2) + "\n");
    await writeFile(join(output, "real-next-report.json"), JSON.stringify({ timestamp: new Date().toISOString(), evidence, results, errors, api }, null, 2) + "\n");
  }
  if (results.some(r => !r.passed) || errors.length) process.exitCode = 1;
}
main().catch(async error => { console.error(error); process.exitCode = 1; await writeFile(join(output, "fatal.txt"), String(error) + "\n"); });
