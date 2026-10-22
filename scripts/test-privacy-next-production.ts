/** Full Next/PostgreSQL mode; --analytics-only uses a browser fixture without migrations. */
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { NextRequest } from "next/server";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { privacyNextEnvironment, availablePort } from "./helpers/privacy-next-environment";
import { PRIVACY_COOKIE, PRIVACY_PROOF_PREFIX, PRIVACY_STORAGE_KEY, MAX_PRIVACY_PROOFS } from "../src/features/privacy/domain";
import { analyticsConsentText, analyticsConsentVersion } from "../src/features/privacy/consent-content";

const ackOnly = process.argv.includes("--ack-only");
const output = "artifacts/privacy-next-production" + (ackOnly ? "/ack-confirmation" : "");
const operationPrefix = "autozap.privacy-operation.v2.";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Event = { receipt_hash: string; operation_id: string; kind: string; document_version: string | null; expires_at: Date | null };
type Choice = { receiptId: string; pending?: string; decision: string; expiresAt: number };
type Ack = { receiptId: string; operationId: string; eventKind: string; documentVersion: string | null; expiresAt: number | null };
const results: { test: string; passed: boolean }[] = [];
const evidence: Record<string, unknown> = {};
const failures: string[] = [], consoleErrors: string[] = [], expectedNetworkErrors: string[] = [], externalRequests: string[] = [];
const responses: { action: string; status: number; ack?: Ack }[] = [];
const pendingResponses = new Set<Promise<void>>();
async function check(test: string, work: () => Promise<void>) {
  if (ackOnly && !/^[234] /.test(test)) return;
  try { await work(); results.push({ test, passed: true }); console.log(`PASS ${test}`); }
  catch (error) { results.push({ test, passed: false }); throw new Error(`${test}: ${error instanceof Error ? error.message : "failed"}`); }
}
async function choice(page: Page) { return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null") as Choice | null, PRIVACY_STORAGE_KEY); }
async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200);
}
const banner = (page: Page) => page.locator("[data-privacy-banner]");
const dialog = (page: Page) => page.getByRole("dialog");
const notice = (page: Page) => page.locator("[data-privacy-saved-notice]");
async function openSettings(page: Page) {
  if (await banner(page).isVisible()) await banner(page).getByRole("button", { name: "Настроить", exact: true }).click();
  else await page.locator('footer a[href="#privacy-settings"]').click();
  await dialog(page).waitFor();
}
async function settingsSave(page: Page, grant: boolean) {
  if (!(await dialog(page).isVisible())) await openSettings(page);
  await dialog(page).getByRole("switch").setChecked(grant);
  await dialog(page).getByRole("button", { name: "Сохранить настройки", exact: true }).click();
}
async function saved(page: Page) {
  await notice(page).waitFor({ timeout: 12_000 });
  assert.equal(await notice(page).textContent(), "Настройки сохранены");
  assert.equal(await dialog(page).count(), 0);
}
async function noPending(page: Page) {
  await page.waitForFunction(({ key, prefix }) => {
    const local = JSON.parse(localStorage.getItem(key) ?? "null");
    return !local?.pending && !Object.keys(localStorage).some((name) => name.startsWith(prefix));
  }, { key: PRIVACY_STORAGE_KEY, prefix: operationPrefix }, { timeout: 15_000 });
}
async function analyticsOff(page: Page) {
  assert.equal(await page.locator('script[data-autozap-analytics="true"]').count(), 0);
  assert.notEqual(await page.evaluate(() => (window as unknown as { disableYaCounter1?: boolean }).disableYaCounter1), false);
}
async function main() {
  await mkdir(output, { recursive: true });
  const environment = await privacyNextEnvironment(output, ackOnly); Object.assign(evidence, environment.evidence);
  evidence.scope = ackOnly ? "Focused actual UI grant/decline/revoke: all ACK fields versus real SQL; previously verified build reused" : "All 15 actual production UI scenarios, regression and visual matrix";
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const contexts: BrowserContext[] = [];
  const events = (id?: string) => id
    ? environment.admin<Event[]>`SELECT receipt_hash,operation_id,kind,document_version,expires_at FROM privacy_consent_events WHERE receipt_hash=${id} ORDER BY occurred_at,kind`
    : environment.admin<Event[]>`SELECT receipt_hash,operation_id,kind,document_version,expires_at FROM privacy_consent_events ORDER BY id`;
  const total = async () => (await events()).length;
  async function newContext(noLocks = false) {
    const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }); contexts.push(context);
    await context.addInitScript(({ noLocks }) => {
      if (noLocks) Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
      (window as unknown as { __savedNotices: number }).__savedNotices = 0;
      new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node instanceof Element && (node.matches("[data-privacy-saved-notice]") || node.querySelector("[data-privacy-saved-notice]"))) {
            (window as unknown as { __savedNotices: number }).__savedNotices++;
          }
        }
      }).observe(document, { childList: true, subtree: true });
    }, { noLocks });
    // Only the external analytics SDK and maps are isolated. Local Next pages and every privacy API request run unchanged.
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === environment.base) { await route.continue(); return; }
      externalRequests.push(url.origin + url.pathname);
      if (url.hostname === "mc.yandex.ru" && url.pathname === "/metrika/tag.js") {
        await route.fulfill({ contentType: "application/javascript", body: `(()=>{const q=window.ym?.a||[];window.__ymCalls=window.__ymCalls||[];window.ym=(...args)=>window.__ymCalls.push(args.slice(0,2));for(const args of q)window.ym(...args)})()` });
      } else if (url.hostname.endsWith("yandex.ru") && url.pathname.startsWith("/map-widget/")) {
        await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>External map isolated for local test</title>" });
      } else { await route.abort(); }
    });
    context.on("page", (page) => {
      page.on("pageerror", (error) => failures.push(error.message));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        if (/Failed to load resource:.*(503|409|net::ERR_FAILED)/.test(text)) expectedNetworkErrors.push(text);
        else consoleErrors.push(text);
      });
      page.on("response", (response) => {
        if (new URL(response.url()).pathname !== "/api/privacy-consent") return;
        const work = (async () => {
          const request = response.request(), input = request.method() === "POST" ? request.postDataJSON() as { action: string } : null;
          const value = await response.json().catch(() => null);
          responses.push({ action: input?.action ?? "GET", status: response.status(),
            ...(response.ok() && input && input.action !== "prepare" && value ? { ack: value as Ack } : {}) });
        })();
        pendingResponses.add(work); void work.finally(() => pendingResponses.delete(work));
      });
    });
    return context;
  }
  async function visit(context: BrowserContext, path = "/") {
    const page = await context.newPage(); const response = await page.goto(environment.base + path, { waitUntil: "domcontentloaded" });
    assert.equal(response?.status(), 200, `page ${path}`); await settled(page); return page;
  }
  async function grant(context: BrowserContext) {
    const page = await visit(context); await banner(page).waitFor(); await openSettings(page); await settingsSave(page, true); await saved(page);
    const local = await choice(page); assert.ok(local?.receiptId); const stored = await events(local.receiptId);
    assert.equal(stored.length, 1); assert.equal(stored[0].kind, "grant"); return { page, id: local.receiptId };
  }
  try {
    browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
    evidence.chromium = browser.version();
    const manifest = JSON.parse(await readFile(".next/server/app-paths-manifest.json", "utf8"));
    const required = ["/page", "/catalog/page", "/catalog/[categorySlug]/page", "/catalog/[categorySlug]/[subcategorySlug]/page",
      "/privacy/page", "/privacy/analytics-consent/page", "/api/privacy-consent/route", "/search/page", "/spisok-pokupok/page"];
    for (const route of required) assert.ok(manifest[route], `built route ${route}`);
    evidence.builtRoutes = Object.keys(manifest);

    await check("1 first visit: real banner/buttons/text; no analytics or JS errors", async () => {
      const context = await newContext(), page = await visit(context); await banner(page).waitFor();
      assert.deepEqual(await banner(page).getByRole("button").allTextContents(), ["Принять", "Только необходимые", "Настроить"]);
      assert.equal(await banner(page).getByRole("link").getAttribute("href"), "/privacy");
      assert.ok((await banner(page).textContent())!.includes("включается только с вашего согласия"));
      assert.equal(await banner(page).getByRole("button", { name: "Принять", exact: true }).isEnabled(), true);
      await analyticsOff(page); assert.equal(externalRequests.filter((url) => url.includes("/metrika/")).length, 0);
      assert.equal(failures.length, 0); await context.close();
    });
    await check("2 explicit acceptance: real grant, UI update and actual saved notice", async () => {
      const context = await newContext(), { page, id } = await grant(context), stored = await events(id);
      assert.equal(stored[0].document_version, analyticsConsentVersion); assert.ok(stored[0].expires_at!.getTime() > Date.now());
      const proof = (await context.cookies()).find((cookie) => cookie.name === PRIVACY_PROOF_PREFIX + id);
      assert.ok(proof?.httpOnly); assert.equal(proof.secure, true);
      assert.equal(createHash("sha256").update(proof.value).digest("hex"), id);
      await openSettings(page); assert.equal(await dialog(page).getByRole("switch").isChecked(), true);
      await context.close();
      // The approved banner action closes the banner without a toast; only explicit settings saves show it.
      const direct = await newContext(), p = await visit(direct); await banner(p).getByRole("button", { name: "Принять", exact: true }).click();
      await banner(p).waitFor({ state: "detached" }); await noPending(p); assert.equal(await notice(p).count(), 0);
      assert.equal((await events((await choice(p))!.receiptId))[0].kind, "grant"); await direct.close();
    });
    await check("3 initial refusal: actual decline, closed banner, correct notice policy", async () => {
      const context = await newContext(), page = await visit(context); await banner(page).getByRole("button", { name: "Только необходимые", exact: true }).click();
      await noPending(page); await banner(page).waitFor({ state: "detached" });
      assert.equal(await notice(page).count(), 0); await analyticsOff(page);
      const stored = await events((await choice(page))!.receiptId); assert.deepEqual(stored.map((row) => row.kind), ["decline"]);
      await context.close();
      const settings = await newContext(), p = await visit(settings); await openSettings(p); await settingsSave(p, false); await saved(p);
      assert.deepEqual((await events((await choice(p))!.receiptId)).map((row) => row.kind), ["decline"]); await settings.close();
    });
    await check("4 withdrawal: real dialog/switch, revoke original A, correct saved notice", async () => {
      const context = await newContext(), { page, id } = await grant(context), before = JSON.stringify((await events(id))[0]);
      await settingsSave(page, false); await saved(page); await analyticsOff(page);
      const stored = await events(id); assert.deepEqual(stored.map((row) => row.kind).sort(), ["grant", "revoke"]);
      assert.equal(JSON.stringify(stored.find((row) => row.kind === "grant")), before); await context.close();
    });
    await check("5 reacceptance: a separate new grant, original remains revoked", async () => {
      const context = await newContext(), { page, id } = await grant(context); await settingsSave(page, false); await saved(page);
      await settingsSave(page, true); await saved(page); const next = (await choice(page))!.receiptId; assert.notEqual(next, id);
      assert.deepEqual((await events(id)).map((row) => row.kind).sort(), ["grant", "revoke"]);
      assert.deepEqual((await events(next)).map((row) => row.kind), ["grant"]); await context.close();
    });
    await check("6 two actual Next tabs: shared credentials, prepare B, revoke A, no reactivation", async () => {
      const context = await newContext(), { page: a, id } = await grant(context), b = await visit(context);
      await openSettings(b); assert.equal(await dialog(b).getByRole("switch").isChecked(), true);
      const prepared = await b.evaluate(() => fetch("/api/privacy-consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }) }).then((r) => r.json())) as { receiptId: string };
      await settingsSave(b, false); await saved(b); assert.equal((await events(id)).filter((row) => row.kind === "revoke").length, 1);
      assert.equal((await events(prepared.receiptId)).length, 0);
      await a.bringToFront(); await a.evaluate(() => dispatchEvent(new Event("pageshow"))); await settled(a); await analyticsOff(a);
      await openSettings(a); assert.equal(await dialog(a).getByRole("switch").isChecked(), false);
      assert.equal(await notice(a).count(), 0); await context.close();
    });
    await check("7 real GET SQL lock error retains A; subsequent UI withdrawal is revoke A", async () => {
      const context = await newContext(), { page, id } = await grant(context), release = await environment.lockJournal();
      try {
        const failed = page.waitForResponse((r) => r.url().endsWith("/api/privacy-consent") && r.request().method() === "GET" && r.status() === 503);
        await page.evaluate(() => dispatchEvent(new Event("pageshow"))); await failed;
        assert.equal((await choice(page))!.receiptId, id); await analyticsOff(page);
      } finally { await release(); }
      await settingsSave(page, false); await saved(page);
      assert.deepEqual((await events(id)).map((row) => row.kind).sort(), ["grant", "revoke"]); await context.close();
    });
    await check("8 actual PostgreSQL outage: no false notice, safe banner, pending retry recovers", async () => {
      const context = await newContext(), page = await visit(context); await banner(page).waitFor();
      await environment.outage(true);
      try {
        await banner(page).getByRole("button", { name: "Только необходимые", exact: true }).click();
        await banner(page).getByRole("alert").waitFor({ timeout: 12_000 });
        assert.equal(await notice(page).count(), 0); assert.ok((await choice(page))?.pending); await analyticsOff(page);
      } finally { await environment.outage(false); }
      for (let attempt = 0; (await choice(page))?.pending && attempt < 6; attempt++) {
        await page.evaluate(() => dispatchEvent(new Event("online"))); await delay(1200);
      }
      await noPending(page); assert.equal(await notice(page).count(), 0);
      assert.deepEqual((await events((await choice(page))!.receiptId)).map((row) => row.kind), ["decline"]); await context.close();
    });
    await check("9 reload recovers a real committed withdrawal with lost HTTP response, without duplicate or notice", async () => {
      const context = await newContext(), { page, id } = await grant(context); await notice(page).waitFor({ state: "detached" });
      let drop = true;
      await context.route(environment.base + "/api/privacy-consent", async (route) => {
        if (drop && route.request().method() === "POST" && route.request().postDataJSON().action === "revoke") {
          drop = false; const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort();
        } else await route.fallback();
      });
      await settingsSave(page, false); await dialog(page).getByRole("alert").waitFor();
      assert.equal(await notice(page).count(), 0); assert.ok((await choice(page))?.pending);
      assert.deepEqual((await events(id)).map((row) => row.kind).sort(), ["grant", "revoke"]);
      const before = JSON.stringify(await events(id)); await page.reload({ waitUntil: "domcontentloaded" }); await settled(page); await noPending(page);
      assert.equal(JSON.stringify(await events(id)), before); assert.equal(await notice(page).count(), 0); await analyticsOff(page); await context.close();
    });
    await check("10 invalid signed confirmation: real UI error, no success, no substitute decline", async () => {
      const context = await newContext(), { page, id } = await grant(context); await notice(page).waitFor({ state: "detached" });
      const cookies = await context.cookies();
      await context.addCookies(cookies.filter((cookie) => cookie.name === PRIVACY_COOKIE || cookie.name === PRIVACY_PROOF_PREFIX + id).map((cookie) => ({ ...cookie, value: "invalid-test-proof" })));
      await page.reload({ waitUntil: "domcontentloaded" }); await settled(page); await analyticsOff(page);
      await settingsSave(page, false); await dialog(page).getByRole("alert").waitFor(); assert.equal(await notice(page).count(), 0);
      assert.deepEqual((await events(id)).map((row) => row.kind), ["grant"]); await context.close();
    });
    await check("11 reopen settings: actual state/switch, original policy and full-consent links", async () => {
      const context = await newContext(), { page } = await grant(context); await openSettings(page);
      assert.equal(await dialog(page).getByRole("switch").isChecked(), true);
      const link = dialog(page).getByRole("link", { name: "Прочитать полное согласие", exact: true });
      assert.equal(await link.getAttribute("href"), "/privacy/analytics-consent"); assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
      const opened = context.waitForEvent("page"); await link.click(); const document = await opened;
      await document.waitForURL(environment.base + "/privacy/analytics-consent");
      await document.waitForLoadState("domcontentloaded"); assert.equal(new URL(document.url()).pathname, "/privacy/analytics-consent");
      assert.equal(await document.locator("[data-consent-text]").innerText().then((text) => text.replace(/\s+/g, " ").trim()), analyticsConsentText.replace(/\s+/g, " ").trim());
      await document.close(); await page.bringToFront(); assert.equal(await dialog(page).getByRole("switch").isChecked(), true);
      await settingsSave(page, false); await saved(page); await context.close();
    });
    await check("12 repeat visit: confirmed choice and cookie restored, no banner or repeated grant", async () => {
      const context = await newContext(), { page, id } = await grant(context), before = JSON.stringify(await events(id));
      await page.close(); const next = await visit(context); await openSettings(next);
      assert.equal(await dialog(next).getByRole("switch").isChecked(), true); assert.equal(await banner(next).count(), 0);
      assert.equal(JSON.stringify(await events(id)), before); assert.equal(await notice(next).count(), 0); await context.close();
    });
    await check("13 expired historical grant/proof: no automatic grant, expired proof rejected", async () => {
      const context = await newContext(), page = await visit(context), now = Date.now(), expires = now - 86400000;
      const payload = `v1.${randomBytes(32).toString("base64url")}.${expires}`;
      const token = payload + "." + createHmac("sha256", environment.secret).update(payload).digest("base64url");
      const id = createHash("sha256").update(token).digest("hex"), operation = randomUUID();
      await environment.app`INSERT INTO privacy_consent_events(receipt_hash,operation_id,kind,document_version,occurred_at,expires_at)
        VALUES(${id},${operation},'grant',${analyticsConsentVersion},${new Date(now - 366 * 86400000)},${new Date(expires)})`;
      await context.addCookies([{ name: PRIVACY_COOKIE, value: token, domain: "127.0.0.1", path: "/api/privacy-consent", httpOnly: true, secure: true, sameSite: "Strict", expires: (now + 86400000) / 1000 }]);
      await page.evaluate(({ key, id, expires, version }) => localStorage.setItem(key, JSON.stringify({ version: 1, decision: "granted", receiptId: id, documentVersion: version, expiresAt: expires })),
        { key: PRIVACY_STORAGE_KEY, id, expires, version: analyticsConsentVersion });
      const before = await total(); await page.reload({ waitUntil: "domcontentloaded" }); await banner(page).waitFor(); await settled(page);
      await analyticsOff(page); assert.equal(await notice(page).count(), 0); assert.equal(await total(), before);
      const response = await page.evaluate(({ id, version }) => fetch("/api/privacy-consent", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grant", receiptId: id, operationId: crypto.randomUUID(), documentVersion: version }) }).then(async (r) => ({ status: r.status, value: await r.json() })), { id, version: analyticsConsentVersion });
      assert.equal(response.status, 409); assert.equal(response.value.code, "receipt_expired"); assert.equal(await total(), before); await context.close();
    });
    await check("14 Web Locks unavailable: no grant; real necessary-only refusal still works", async () => {
      const context = await newContext(true), page = await visit(context), before = await total();
      await banner(page).getByRole("button", { name: "Принять", exact: true }).click(); await banner(page).getByRole("alert").waitFor();
      assert.equal(await total(), before); assert.equal(await notice(page).count(), 0); await analyticsOff(page);
      await banner(page).getByRole("button", { name: "Только необходимые", exact: true }).click(); await noPending(page);
      assert.deepEqual((await events((await choice(page))!.receiptId)).map((row) => row.kind), ["decline"]); await context.close();
    });
    await check("15 proof limit: bounded cookies, no false success, active A can still be revoked", async () => {
      const context = await newContext(), page = await visit(context);
      const prepare = () => page.evaluate(() => fetch("/api/privacy-consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }) }).then((r) => r.status));
      for (let i = 0; i < MAX_PRIVACY_PROOFS; i++) assert.equal(await prepare(), 200);
      assert.equal(await prepare(), 409); const before = await total();
      await banner(page).getByRole("button", { name: "Принять", exact: true }).click(); await banner(page).getByRole("alert").waitFor();
      assert.equal(await notice(page).count(), 0); assert.equal(await total(), before);
      assert.equal((await context.cookies()).filter((cookie) => cookie.name.startsWith(PRIVACY_PROOF_PREFIX)).length, MAX_PRIVACY_PROOFS); await context.close();
      const active = await newContext(), { page: a, id } = await grant(active);
      for (let i = 1; i < MAX_PRIVACY_PROOFS; i++) assert.equal(await a.evaluate(() => fetch("/api/privacy-consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }) }).then((r) => r.status)), 200);
      assert.equal(await a.evaluate(() => fetch("/api/privacy-consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }) }).then((r) => r.status)), 409);
      assert.ok((await active.cookies()).some((cookie) => cookie.name === PRIVACY_PROOF_PREFIX + id));
      await settingsSave(a, false); await saved(a); assert.deepEqual((await events(id)).map((row) => row.kind).sort(), ["grant", "revoke"]); await active.close();
    });

    await check("actual built route availability and limited catalog/search/purchase-list regression", async () => {
      const context = await newContext(), page = await visit(context);
      await banner(page).getByRole("button", { name: "Только необходимые", exact: true }).click(); await noPending(page);
      const statuses: { path: string; status: number }[] = [];
      for (const path of ["/", "/catalog", "/catalog/podveska", environment.subcategoryPath, environment.productPath, "/privacy", "/privacy/analytics-consent", "/search?q=UI-TEST-001", "/spisok-pokupok", "/robots.txt", "/sitemap.xml", "/admin/login"]) {
        const response = await page.goto(environment.base + path, { waitUntil: "domcontentloaded" });
        statuses.push({ path, status: response!.status() }); assert.equal(response!.status(), 200, path);
      }
      await page.goto(environment.base + environment.productPath, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Добавить в список покупок", exact: true }).click();
      await page.goto(environment.base + "/spisok-pokupok", { waitUntil: "domcontentloaded" });
      await page.getByText(environment.productName, { exact: true }).waitFor();
      await page.goto(environment.base + "/search?q=UI-TEST-001", { waitUntil: "domcontentloaded" });
      await page.getByText(environment.productName, { exact: true }).waitFor();
      evidence.routes = statuses; evidence.search = "real PostgreSQL fallback; Meilisearch intentionally absent"; await context.close();
    });

    await Promise.allSettled([...pendingResponses]);
    for (const response of responses.filter((r) => r.ack)) {
      const ack = response.ack!, stored = await events(ack.receiptId);
      const row = stored.find((event) => event.operation_id === ack.operationId && event.kind === ack.eventKind);
      assert.ok(row, "Every successful event ACK must match a real SQL row");
      assert.equal(row.expires_at?.getTime() ?? null, ack.expiresAt);
      if (ack.eventKind === "grant") assert.equal(row.document_version, ack.documentVersion);
      else {
        assert.equal(row.document_version, null);
        assert.equal(ack.documentVersion, stored.find((event) => event.kind === "grant")?.document_version ?? null);
      }
    }
    const duplicates = await environment.app`SELECT receipt_hash,kind FROM privacy_consent_events GROUP BY receipt_hash,kind HAVING count(*)>1`;
    assert.equal(duplicates.length, 0); assert.equal(failures.length, 0, "No JavaScript/hydration errors"); assert.deepEqual(consoleErrors, [], "No unexpected console errors");
    evidence.eventCounts = await environment.app`SELECT kind,count(*)::int AS count FROM privacy_consent_events GROUP BY kind ORDER BY kind`;
    evidence.responses = responses; evidence.expectedNetworkErrors = expectedNetworkErrors;
    evidence.externalIsolation = { requests: externalRequests, realCounterEnabled: false, sdk: "inert test stub; application analytics module unchanged" };
    await visualChecks(browser, newContext, environment.base, environment.subcategoryPath);
    assert.equal(failures.length, 0, "No JavaScript errors during visual checks"); assert.deepEqual(consoleErrors, []);
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close())); await browser?.close(); await environment.cleanup();
    evidence.cleanedUp = true;
    await writeFile(join(output, "report.json"), environment.sanitize(JSON.stringify({ timestamp: new Date().toISOString(), evidence, results, failures, consoleErrors }, null, 2)) + "\n");
  }
}

async function visualChecks(browser: Awaited<ReturnType<typeof chromium.launch>>, newContext: () => Promise<BrowserContext>, base: string, subcategoryPath: string) {
  void browser;
  const measurements: unknown[] = [], old = JSON.parse(await readFile("artifacts/privacy-analytics-consent-page/report.json", "utf8"));
  await check("visual matrix 1440/1280/390/375: real pages, banner/settings and Cyrillic fonts", async () => {
    const context = await newContext(), page = await context.newPage();
    for (const [width, height] of [[1440, 900], [1280, 800], [390, 844], [375, 812]]) {
      await page.setViewportSize({ width, height });
      await page.goto(base, { waitUntil: "domcontentloaded" }); await banner(page).waitFor(); await settled(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const bounds = await banner(page).boundingBox(); assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.y + bounds.height <= height + 1);
      await page.screenshot({ path: join(output, `banner-${width}.png`) });
      await openSettings(page); await settled(page); const box = await dialog(page).boundingBox(); assert.ok(box && box.x >= 0 && box.y >= 0 && box.y + box.height <= height + 1);
      await page.screenshot({ path: join(output, `settings-${width}.png`) });
      await page.keyboard.press("Escape");
      await banner(page).getByRole("button", { name: "Только необходимые", exact: true }).click(); await noPending(page);
      for (const [name, path] of [["home", "/"], ["catalog", "/catalog"], ["category", "/catalog/podveska"], ["subcategory", subcategoryPath], ["privacy", "/privacy"], ["consent", "/privacy/analytics-consent"]]) {
        await page.goto(base + path, { waitUntil: "domcontentloaded" }); await settled(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} at ${width}`);
        await page.screenshot({ path: join(output, `${name}-${width}.png`), fullPage: true });
        if (name === "consent") {
          const data = await page.locator("[data-consent-text]").evaluate((element) => {
            const style = getComputedStyle(element), rect = element.getBoundingClientRect();
            return { width: rect.width, height: rect.height, font: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight,
              h1: getComputedStyle(element.querySelector("h1")!).fontSize, h2: getComputedStyle(element.querySelector("h2")!).fontSize };
          });
          const reference = old.widths.find((item: { width: number }) => item.width === width);
          assert.equal(data.fontSize, reference.fontSize); assert.equal(data.lineHeight, reference.lineHeight);
          assert.equal(data.h1, reference.h1); assert.equal(data.h2, reference.h2); assert.ok(Math.abs(data.width - reference.bounds.width) < 1);
          measurements.push({ viewport: width, ...data, referenceHeight: reference.bounds.height, heightDifference: data.height - reference.bounds.height });
        }
      }
      // A fresh visitor for the next viewport, without altering the previous real journal.
      await context.clearCookies(); await page.evaluate(() => localStorage.clear());
    }
    await page.goto(base + "/privacy/analytics-consent", { waitUntil: "domcontentloaded" }); await settled(page);
    evidence.visual = { measurements, reference: "artifacts/privacy-analytics-consent-page/report.json", screenshotDirectory: output };
    const fonts = await platformFonts(context, page);
    Object.assign(evidence.visual as object, { fonts });
    await context.close();
  });
}

async function platformFonts(context: BrowserContext, page: Page) {
    const session = await context.newCDPSession(page); await session.send("DOM.enable"); await session.send("CSS.enable");
    const fonts: unknown[] = [];
    for (const family of ["golos-text", "rubik", "unbounded"]) {
      await page.evaluate(async (name) => {
        const span = document.createElement("span"); span.dataset.fontProbe = name; span.textContent = "Кириллица: Согласие Ёжик Талдом";
        const family = getComputedStyle(document.documentElement).getPropertyValue("--font-" + name);
        span.style.cssText = `position:fixed;left:0;top:0;z-index:999999;pointer-events:none;font-family:${family};font-size:16px;font-weight:500`;
        document.body.appendChild(span); await document.fonts.load(`500 16px ${family.split(",")[0]}`, span.textContent);
        span.getBoundingClientRect();
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }, family);
      const tree = await session.send("DOM.getDocument");
      const node = await session.send("DOM.querySelector", { nodeId: tree.root.nodeId, selector: `[data-font-probe="${family}"]` });
      const actual = await session.send("CSS.getPlatformFontsForNode", { nodeId: node.nodeId });
      assert.ok(actual.fonts.some((font) => font.isCustomFont && font.glyphCount > 0 &&
        font.familyName.toLowerCase().replace(/[^a-z]/g, "").startsWith(family.replace(/-/g, ""))), `original custom font ${family}: ${JSON.stringify(actual.fonts)}`);
      fonts.push({ variable: "--font-" + family, fonts: actual.fonts });
    }
    await page.evaluate(() => document.querySelectorAll("[data-font-probe]").forEach((node) => node.remove()));
    return fonts;
}

// Focused confirmation on the already built static legal page. No PostgreSQL/container, no repeat of the 15 scenarios.
async function fontsOnly() {
  const port = await availablePort(), base = `http://127.0.0.1:${port}`;
  const url = new URL("postgresql://127.0.0.1:1/privacy_font_readonly_test"); url.username = "privacy_font_test"; url.password = randomBytes(24).toString("hex");
  const server = spawn(process.execPath, [".next/standalone/server.js"], { stdio: "ignore", env: { ...process.env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port), APP_URL: base,
    DATABASE_URL: url.href, YANDEX_METRIKA_COUNTER_ID: "", YANDEX_METRIKA_CONFIGURATION_VERIFIED: "false", YANDEX_MAPS_API_KEY: "", MEILI_HOST: "http://127.0.0.1:1", MEILI_MASTER_KEY: randomBytes(24).toString("hex"), PRIVACY_CONSENT_SECRET: randomBytes(32).toString("hex"), NEXT_TELEMETRY_DISABLED: "1" } });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    let ready = false;
    for (let i = 0; !ready && i < 60; i++) {
      try { ready = (await fetch(base + "/privacy/analytics-consent")).ok; } catch { /* Startup. */ }
      if (!ready) await delay(200);
    }
    assert.equal(ready, true);
    browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
    const context = await browser.newContext();
    await context.route("**/*", (route) => route.request().url().startsWith(base + "/") ? route.continue() : route.abort());
    const page = await context.newPage(); await page.goto(base + "/privacy/analytics-consent", { waitUntil: "domcontentloaded" }); await settled(page);
    const fonts = await platformFonts(context, page);
    const reference = JSON.parse(await readFile("artifacts/privacy-analytics-consent-page/report.json", "utf8"));
    const measurements = [], modalScroll = [];
    for (const [width, height] of [[1440, 900], [1280, 800], [390, 844], [375, 812]]) {
      await page.setViewportSize({ width, height });
      const actual = await page.locator("[data-consent-text]").evaluate((element) => {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height, font: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight,
          h1: getComputedStyle(element.querySelector("h1")!).fontSize, h2: getComputedStyle(element.querySelector("h2")!).fontSize };
      });
      const old = reference.widths.find((row: { width: number }) => row.width === width);
      assert.equal(actual.fontSize, old.fontSize); assert.equal(actual.lineHeight, old.lineHeight); assert.equal(actual.h1, old.h1); assert.equal(actual.h2, old.h2);
      assert.ok(Math.abs(actual.width - old.bounds.width) < 1);
      measurements.push({ viewport: width, ...actual, referenceHeight: old.bounds.height, heightDifference: actual.height - old.bounds.height });
      await openSettings(page);
      const maps = dialog(page).locator("section").filter({ has: page.getByRole("heading", { name: "Яндекс-Карты", exact: true }) }).locator("p");
      await maps.scrollIntoViewIfNeeded();
      const visible = await maps.evaluate((element) => {
        const rect = element.getBoundingClientRect(); let parent = element.parentElement;
        while (parent && !/auto|scroll/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement;
        const clip = parent?.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, clipTop: clip?.top, clipBottom: clip?.bottom,
          fullyVisible: Boolean(clip && rect.top >= clip.top - 1 && rect.bottom <= clip.bottom + 1) };
      });
      assert.equal(visible.fullyVisible, true, `settings content can scroll to the final section at ${width}`);
      assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "hidden");
      const button = await dialog(page).getByRole("button", { name: "Сохранить настройки", exact: true }).boundingBox();
      assert.ok(button && button.y >= 0 && button.y + button.height <= height + 1);
      modalScroll.push({ viewport: width, ...visible, saveVisible: true });
      await page.keyboard.press("Escape"); await banner(page).waitFor();
    }
    await writeFile(join(output, "font-confirmation.json"), JSON.stringify({ fonts, measurements, modalScroll, databaseAccess: false, correctedProbeWaitsForLayout: true }, null, 2) + "\n");
    console.log("PASS original Golos Text, Rubik and Unbounded render Cyrillic; platform fonts and reference metrics confirmed");
  } finally {
    await browser?.close();
    const exited = new Promise<void>((resolve) => server.once("exit", () => resolve())); server.kill("SIGTERM"); await Promise.race([exited, delay(5000)]);
    if (server.exitCode === null) { server.kill("SIGKILL"); await exited; }
  }
}
/** No migrations: real browser + actual coordinator/loader, in-memory journal and isolated vendor transport. */
async function analyticsOnly() {
  const realSdk = process.argv.includes("--real-sdk");
  if (realSdk) throw new Error("Legacy --real-sdk is blocked: Playwright interception alone is not network isolation. Use scripts/test-privacy-real-sdk.ts with the OS sandbox and a separately downloaded local SDK.");
  const { fixture } = await import("./test-privacy-lifecycle");
  const journal = fixture(), counter = 113668070;
  const modules: string[] = [];
  for (const name of ["domain", "analytics", "coordinator"]) {
    const source = await readFile(`src/features/privacy/${name}.ts`, "utf8");
    const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
    modules.push(`{const module={exports:{}};(function(require,module,exports){${code}})(name=>modules[name],module,module.exports);modules['./${name}']=module.exports;}`);
  }
  const html = `<!doctype html><html><head><title>Isolated analytics test</title></head><body>
  <main data-autozap-analytics-page="true">Synthetic test fixture</main><script>
  const modules={};${modules.join("\n")}
  window.analytics=modules['./analytics'];window.paused=false;window.ready=false;
  const {PrivacyCoordinator,PrivacyRequestError,PRIVACY_LOCK}=modules['./coordinator'];
  window.reconcile=()=>analytics.updateAnalytics(${counter},true,()=>!paused&&controller.isAuthorized(),controller.snapshot.registered.receiptId??'');
  window.controller=new PrivacyCoordinator({storage:localStorage,now:Date.now,id:()=>crypto.randomUUID(),stop:analytics.stopAnalytics,
    changed:s=>{if(s.choice?.decision==='declined')analytics.withdrawAnalytics(${counter});void reconcile();},
    lock:work=>navigator.locks.request(PRIVACY_LOCK,work),request:async(body,id)=>{
      const r=await fetch('/api/privacy-consent',{method:body?'POST':'GET',credentials:'same-origin',
        ...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:id?{headers:{'X-Privacy-Receipt':id}}:{})});
      const value=await r.json();if(!r.ok)throw new PrivacyRequestError(r.status,value.code);return value;
    }},${JSON.stringify(analyticsConsentVersion)},true);
  window.save=grant=>{if(!grant)analytics.withdrawAnalytics(${counter});return controller.save(grant);};
  addEventListener('storage',e=>{if(e.key===null||e.key.startsWith('autozap.privacy-'))void controller.synchronize();});
  controller.synchronize().then(()=>window.ready=true);
  </script></body></html>`;
  let base = "";
  const server = createServer(async (incoming, response) => {
    try {
      if (incoming.url?.startsWith("/api/privacy-consent")) {
        const chunks: Buffer[] = []; for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
        const request = new NextRequest(base + incoming.url, { method: incoming.method,
          headers: incoming.headers as Record<string, string>, ...(incoming.method === "POST" ? { body: Buffer.concat(chunks) } : {}) });
        const result = await (incoming.method === "POST" ? journal.handlers.POST(request) : journal.handlers.GET(request));
        response.writeHead(result.status, { "Content-Type": "application/json", "Set-Cookie": result.headers.getSetCookie() });
        response.end(await result.text());
      } else { response.writeHead(200, { "Content-Type": "text/html" }); response.end(html); }
    } catch { if (!response.destroyed) response.writeHead(500).end(); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`; process.env.APP_URL = base;
  const directory = `artifacts/metrika-${realSdk ? "real-sdk" : "stub"}`;
  await mkdir(directory, { recursive: true });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const checks: string[] = [], network: { path: string; mainFrame: boolean; privateMarker: boolean }[] = [], errors: string[] = [];
  let sdkRequests = 0, sdkHash: string | null = null;
  const sdkLatch: { hold: boolean; releases: (() => void)[]; entered?: () => void } = { hold: false, releases: [] };
  let completed = false;
  const check = (name: string) => { checks.push(name); console.log(`PASS ${name}`); };
  const watchCount = () => network.filter((item) => item.path.endsWith(`/watch/${counter}`)).length;
  async function newPageview(previous: number) {
    if (!realSdk) return;
    for (let attempt = 0; attempt < 100 && watchCount() <= previous; attempt++) await delay(50);
    assert.ok(watchCount() > previous, "The actual SDK must produce a new pageview through isolated transport");
  }
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
    const context = await browser.newContext();
    await context.addInitScript({ content: `{
      const calls=[];window.__ymCalls=calls;let current;
      Object.defineProperty(window,'ym',{configurable:true,get:()=>current,set:value=>{
        current=typeof value==='function'?new Proxy(value,{apply(fn,receiver,args){
          calls.push(args.slice(0,4));return Reflect.apply(fn,receiver,args);
        }}):value;
      }});
    }` });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "sub.metrika-fixture.test") {
        await route.fulfill({ contentType: "text/html", body: `<!doctype html><script>const modules={};${modules.join("\n")}window.analytics=modules['./analytics'];</script>` });
        return;
      }
      if (url.origin === base) { await route.continue(); return; }
      if (url.hostname === "mc.yandex.ru" && url.pathname === "/metrika/tag.js") {
        sdkRequests++;
        if (sdkLatch.hold) await new Promise<void>((resolve) => { sdkLatch.releases.push(resolve); sdkLatch.entered?.(); });
        if (realSdk) {
          const response = await route.fetch({ timeout: 20_000 }); assert.equal(response.ok(), true, "Real SDK must download");
          const body = await response.body(); sdkHash = createHash("sha256").update(body).digest("hex");
          await route.fulfill({ response, body });
        } else {
          await route.fulfill({ contentType: "application/javascript", body: "window.ym=(...args)=>{};" });
        }
        return;
      }
      const payload = decodeURIComponent(url.search + (route.request().postData() ?? ""));
      network.push({ path: url.origin + url.pathname, mainFrame: route.request().frame() === route.request().frame().page().mainFrame(), privateMarker: payload.includes("qa-private-marker") });
      // Never send synthetic visits or credentials to the real counter. The SDK itself is unmodified.
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/"); await page.waitForFunction("window.ready");
    await delay(200); assert.equal(sdkRequests, 0); assert.equal(network.length, 0); check("first visit has no SDK or analytics requests");
    const held = journal.holdGrant();
    await page.evaluate("window.pending=save(true);void 0");
    await Promise.race([held.entered, delay(5000).then(async () => { throw new Error("Grant did not reach the journal: " + await page.evaluate("controller.snapshot.message")); })]);
    assert.equal(sdkRequests, 0); held.release(); assert.equal(await page.evaluate("pending"), true);
    await page.waitForFunction("__ymCalls.some(c=>c[1]==='hit')");
    if (realSdk) await page.waitForFunction(`Boolean(window.Ya?.Metrika2 && window['yaCounter${counter}'])`, null, { timeout: 20_000 });
    await delay(1000);
    assert.equal(await page.evaluate("__ymCalls.filter(c=>c[1]==='init').length"), 1); check("confirmed grant initializes the selected counter once");
    const viewsBeforePause = await page.evaluate("__ymCalls.filter(c=>c[1]==='hit').length");
    await page.evaluate("document.cookie='_ym_uid=fixture; Path=/';localStorage.setItem('_ym_retryReqs','old-events');sessionStorage.setItem('_ym_debugger_state','old');localStorage.setItem('shopping-fixture','keep');document.cookie='session-fixture=keep; Path=/';paused=true;analytics.stopAnalytics()");
    assert.ok((await context.cookies()).some((cookie) => cookie.name === "_ym_uid"));
    assert.equal(await page.evaluate("localStorage.getItem('_ym_retryReqs')"), "old-events"); check("temporary pause preserves analytics cookies and retry storage");
    await page.evaluate("paused=false;reconcile()");
    await page.waitForFunction("__ymCalls.filter(c=>c[1]==='init').length===2");
    await delay(500);
    assert.equal(await page.evaluate("__ymCalls.filter(c=>c[1]==='hit').length"), viewsBeforePause);
    check("settings/visibility pause can reinitialize without repeating the current pageview");
    const other = await context.newPage(); await other.goto(base + "/"); await other.waitForFunction("window.ready");
    await other.waitForFunction("__ymCalls.some(c=>c[1]==='hit')");
    assert.equal(await page.evaluate("save(false)"), true);
    await other.waitForFunction(`window.disableYaCounter${counter}===true && !controller.isAuthorized()`);
    assert.equal((await context.cookies()).some((cookie) => cookie.name === "_ym_uid"), false);
    assert.equal(await page.evaluate("localStorage.getItem('_ym_retryReqs')"), null);
    assert.equal(await page.evaluate("sessionStorage.getItem('_ym_debugger_state')"), null);
    assert.equal(await page.evaluate("localStorage.getItem('shopping-fixture')"), "keep");
    assert.ok((await context.cookies()).some((cookie) => cookie.name === "session-fixture"));
    assert.ok((await context.cookies()).some((cookie) => cookie.name === PRIVACY_COOKIE && cookie.httpOnly));
    await delay(300); const stoppedCount = network.length;
    await page.evaluate(`ym(${counter},'hit',location.origin+'/catalog');reconcile()`); await delay(1500);
    assert.equal(network.length, stoppedCount, "No new requests from a withdrawn SDK"); check("withdrawal clears vendor data, preserves application data and stops both tabs");
    await other.close();
    const previous = await page.evaluate("__ymCalls.filter(c=>c[1]==='init').length"), watchesBeforeRenewal = watchCount();
    assert.equal(await page.evaluate("save(true)"), true);
    await page.waitForFunction(`__ymCalls.filter(c=>c[1]==='init').length===${previous}+1`);
    await delay(500); assert.equal(await page.evaluate(`window.disableYaCounter${counter}`), false);
    await newPageview(watchesBeforeRenewal);
    assert.equal(await page.evaluate("localStorage.getItem('_ym_retryReqs')?.includes('old-events')??false"), false); check("renewed grant restarts once without the old queue");
    const watchesBeforeNavigation = watchCount();
    await page.evaluate("history.pushState({},'', '/catalog');reconcile()");
    await newPageview(watchesBeforeNavigation);
    await delay(200); const beforeSensitive = network.length;
    await page.evaluate("history.pushState({},'', '/search?q=qa-private-marker');reconcile()"); await delay(500);
    assert.equal(network.length, beforeSensitive); assert.equal(network.some((item) => item.privateMarker), false); check("allowed navigation sends clean hits; excluded search sends no private marker");
    await page.goto(base + "/"); await page.waitForFunction("window.ready");
    await page.waitForFunction("__ymCalls.some(c=>c[1]==='hit')"); check("reload restores only a server-confirmed grant");
    journal.getFailure(true); await page.evaluate("controller.synchronize()");
    assert.equal(await page.evaluate("controller.isAuthorized()"), false);
    assert.equal(await page.evaluate("save(false)"), false);
    assert.equal(await page.evaluate(`window.disableYaCounter${counter}`), true);
    journal.getFailure(false); await page.evaluate("controller.retry(true)");
    journal.outage(true); assert.equal(await page.evaluate("save(true)"), false);
    assert.equal(await page.evaluate("controller.isAuthorized()"), false);
    journal.outage(false); check("API and simulated journal failures remain fail-closed");
    await page.goto(base + "/"); await page.waitForFunction("window.ready");
    sdkLatch.hold = true;
    const entered = new Promise<void>((resolve) => { sdkLatch.entered = resolve; });
    await page.evaluate("window.pending=save(true);void 0");
    await Promise.race([entered, delay(5000).then(() => { throw new Error("SDK request did not enter the loading race"); })]);
    await page.evaluate("save(false)"); sdkLatch.releases.splice(0).forEach((release) => release()); sdkLatch.hold = false;
    await delay(realSdk ? 2500 : 500);
    assert.equal(await page.evaluate("__ymCalls.some(c=>c[1]==='init')"), false); check("withdrawal during SDK loading prevents late initialization");
    await page.goto(base + "/"); await page.waitForFunction("window.ready");
    sdkLatch.hold = true;
    const rapidEntered = new Promise<void>((resolve) => { sdkLatch.entered = resolve; });
    const requestsBeforeRapid = sdkRequests;
    await page.evaluate("window.pending=save(true);void 0");
    await Promise.race([rapidEntered, delay(5000).then(() => { throw new Error("Rapid regrant SDK load did not start"); })]);
    assert.equal(await page.evaluate("save(false)"), true);
    assert.equal(await page.evaluate("save(true)"), true);
    await delay(100); assert.equal(sdkRequests, requestsBeforeRapid + 1, "A renewed grant shares the still-loading SDK");
    const watchesBeforeRapid = watchCount();
    sdkLatch.releases.splice(0).forEach((release) => release()); sdkLatch.hold = false;
    await page.waitForFunction("__ymCalls.some(c=>c[1]==='hit')");
    await newPageview(watchesBeforeRapid);
    assert.equal(await page.evaluate("__ymCalls.filter(c=>c[1]==='init').length"), 1);
    check("rapid withdraw/regrant shares one SDK request and initializes once");
    await context.addCookies([
      { name: "_ym_uid", value: "fixture", domain: ".metrika-fixture.test", path: "/" },
      { name: "_ym_d", value: "fixture", domain: "sub.metrika-fixture.test", path: "/catalog" },
      { name: "_ym_isad", value: "fixture", domain: ".metrika-fixture.test", path: "/catalog/" },
      { name: "_ym_fa", value: "inaccessible", domain: "sub.metrika-fixture.test", path: "/", httpOnly: true },
      { name: "autozap_privacy_receipt", value: "preserve", domain: "sub.metrika-fixture.test", path: "/", httpOnly: true },
      { name: "_ym_uid", value: "other-domain", domain: "other-fixture.test", path: "/" }
    ]);
    const cookiePage = await context.newPage(); await cookiePage.goto("http://sub.metrika-fixture.test/catalog/category/");
    await cookiePage.evaluate(`analytics.withdrawAnalytics(${counter})`);
    const scopedCookies = await context.cookies();
    assert.equal(scopedCookies.some((cookie) => cookie.domain.endsWith("metrika-fixture.test") && ["_ym_uid", "_ym_d", "_ym_isad"].includes(cookie.name)), false);
    assert.ok(scopedCookies.some((cookie) => cookie.name === "_ym_fa" && cookie.httpOnly));
    assert.ok(scopedCookies.some((cookie) => cookie.name === "_ym_uid" && cookie.domain === "other-fixture.test"));
    assert.ok(scopedCookies.some((cookie) => cookie.name === PRIVACY_COOKIE && cookie.value === "preserve"));
    await cookiePage.close(); check("host/parent-domain and ancestor-path cookies clear; HttpOnly, foreign cookies and consent remain");
    assert.equal(errors.length, 0, errors.join("; "));
    if (realSdk) { assert.ok(sdkHash); assert.ok(network.some((item) => item.path.includes(`/watch/${counter}`)), "Real SDK must attempt a pageview through isolated transport"); }
    completed = true;
    await context.close();
  } finally {
    sdkLatch.releases.splice(0).forEach((release) => release()); await browser?.close();
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    await writeFile(join(directory, "report.json"), JSON.stringify({ completed, realSdk, sdkHash, sdkRequests, checks, network, errors,
      journal: "in-memory fixture; not PostgreSQL", transport: "all vendor collection intercepted; no visits sent to Yandex", nextUI: false }, null, 2) + "\n");
  }
}
const onlyFonts = process.argv.includes("--fonts-only"), onlyAnalytics = process.argv.includes("--analytics-only");
(onlyAnalytics ? analyticsOnly() : onlyFonts ? fontsOnly() : main()).then(() => { console.log(onlyAnalytics ? "Isolated analytics browser checks completed; no database or migrations." : onlyFonts ? "Focused font confirmation completed; local server stopped." : ackOnly ? "Focused UI/SQL ACK check passed; local server and PostgreSQL removed." : "Actual production Next.js UI checks passed; local server and PostgreSQL removed."); process.exit(0); })
  .catch((error: unknown) => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]") : "UI check failed"); process.exit(1); });
