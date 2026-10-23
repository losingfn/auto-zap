/** Actual Next UI + disposable PostgreSQL. External network denied by OS; SDK is an inert stub. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { privacyNextEnvironment } from "./helpers/privacy-next-environment";
import { PRIVACY_STORAGE_KEY } from "../src/features/privacy/domain";

const { launchIsolatedBrowser, probe } = createRequire(import.meta.url)("./test-privacy-network-isolation.cjs") as {
  launchIsolatedBrowser: (port: number, output: string) => Promise<{ browser: Browser; cleanup: () => Promise<void> }>;
  probe: (browser: Browser, base: string) => Promise<unknown>;
};
const label = process.argv.find(value => value.startsWith("--run-label="))?.slice(12) ?? "final";
assert.match(label, /^[a-z0-9-]+$/);
const selected = process.argv.find(value => value.startsWith("--case="))?.slice(7);
const output = join("artifacts/privacy-consent-save", label);
const results: { name: string; passed: boolean; detail?: string }[] = [];
const api: { phase: string; method: string; action: string | null; status: number }[] = [];
const errors: string[] = [], external: string[] = [];
let phase = "setup", stubLoads = 0;
const banner = (page: Page) => page.locator("[data-privacy-banner]");
const notice = (page: Page) => page.locator("[data-privacy-saved-notice]");
const choice = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null") as {
  decision: string; receiptId: string | null; operationId?: string; pending?: string
} | null, PRIVACY_STORAGE_KEY);
async function settled(page: Page) { await page.waitForTimeout(350); }
async function registered(page: Page) {
  await page.waitForFunction(key => {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    return value && !value.pending && !Object.keys(localStorage).some(key => key.startsWith("autozap.privacy-operation.v2."));
  }, PRIVACY_STORAGE_KEY, { timeout: 15000 });
  await banner(page).waitFor({ state: "detached" });
}
async function off(page: Page) {
  assert.equal(await page.locator("script[data-autozap-analytics]").count(), 0);
  assert.equal(await page.evaluate("typeof window.ym"), "undefined");
}
async function main() {
  await mkdir(output, { recursive: true });
  const env = await privacyNextEnvironment(output, false, { existingBuild: true, counterId: 1 });
  let isolated: Awaited<ReturnType<typeof launchIsolatedBrowser>> | undefined;
  const contexts: BrowserContext[] = [];
  const evidence: Record<string, unknown> = { ...env.evidence, realSdkExecuted: false, realCounterEnabled: false };
  const rows = (id: string) => env.app`SELECT operation_id,kind,document_version FROM privacy_consent_events WHERE receipt_hash=${id} ORDER BY occurred_at`;
  const count = async () => Number((await env.app`SELECT count(*)::int AS n FROM privacy_consent_events`)[0].n);
  async function context() {
    const ctx = await isolated!.browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 800 } });
    contexts.push(ctx); ctx.setDefaultTimeout(10000);
    await ctx.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin === env.base) { await route.continue(); return; }
      external.push(url.origin + url.pathname);
      if (url.href === "https://mc.yandex.ru/metrika/tag.js") {
        stubLoads++;
        await route.fulfill({ contentType: "application/javascript", body: "window.ym=function(){};" });
      } else if (url.hostname === "yandex.ru" && url.pathname.startsWith("/map-widget/")) {
        await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Isolated map stub</title>" });
      } else await route.abort();
    });
    ctx.on("page", page => page.on("pageerror", error => errors.push(error.message)));
    ctx.on("response", response => {
      if (response.url() !== env.base + "/api/privacy-consent") return;
      const request = response.request();
      api.push({ phase, method: request.method(), action: request.method() === "POST" ? request.postDataJSON().action : null, status: response.status() });
    });
    return ctx;
  }
  async function visit(ctx: BrowserContext) {
    const page = await ctx.newPage();
    assert.equal((await page.goto(env.base, { waitUntil: "domcontentloaded" }))?.status(), 200);
    await settled(page); return page;
  }
  async function settingsSave(page: Page, grant: boolean) {
    if (await banner(page).isVisible()) await banner(page).getByRole("button", { name: "Настроить", exact: true }).click();
    else await page.locator('footer a[href="#privacy-settings"]').click();
    const dialog = page.getByRole("dialog"); await dialog.waitFor();
    await dialog.getByRole("switch").setChecked(grant);
    await dialog.getByRole("button", { name: "Сохранить настройки", exact: true }).click();
  }
  async function check(name: string, work: () => Promise<void>) {
    if (selected && !name.includes(selected)) return;
    phase = name;
    try { await work(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, passed: false, detail: String(error) }); console.error(`FAIL ${name}: ${String(error)}`); }
  }
  try {
    isolated = await launchIsolatedBrowser(Number(new URL(env.base).port), output);
    evidence.browserProbe = await probe(isolated.browser, env.base);
    await check("A first visit has banner and no analytics", async () => {
      const ctx = await context(), page = await visit(ctx), before = stubLoads;
      await banner(page).waitFor(); assert.equal(await choice(page), null); await off(page);
      await page.reload(); await banner(page).waitFor(); assert.equal(stubLoads, before); await ctx.close();
    });
    await check("B banner stays until server confirmation, then refusal survives reload", async () => {
      const ctx = await context(), page = await visit(ctx), before = await count();
      let release: (() => void) | undefined;
      let entered!: () => void;
      const waiting = new Promise<void>(resolve => { entered = resolve; });
      await ctx.route(env.base + "/api/privacy-consent", async route => {
        if (route.request().method() === "POST" && route.request().postDataJSON().action === "prepare") {
          entered(); await new Promise<void>(resolve => { release = resolve; });
        }
        await route.fallback();
      });
      try {
        await banner(page).getByRole("button", { name: "Только необходимые", exact: true }).click();
        await waiting; await settled(page);
        assert.equal(await banner(page).isVisible(), true, "Unconfirmed local refusal must not silently hide the banner");
        assert.equal(await notice(page).count(), 0); assert.equal(await count(), before); await off(page);
      } finally { release?.(); }
      await registered(page);
      const local = (await choice(page))!; assert.equal(local.decision, "declined");
      assert.deepEqual((await rows(local.receiptId!)).map(row => row.kind), ["decline"]);
      await page.reload(); await settled(page); assert.equal(await banner(page).count(), 0);
      assert.equal((await choice(page))!.decision, "declined"); await off(page); await ctx.close();
    });
    await check("D 403 banner error survives synchronization and reload; explicit retry succeeds", async () => {
      const ctx = await context(), page = await visit(ctx), before = await count(); let deny = true;
      await ctx.route(env.base + "/api/privacy-consent", async route => {
        if (deny && route.request().method() === "POST" && route.request().postDataJSON().action === "decline") {
          // Chromium may preserve its own Origin on route.continue. Send to
          // this exact local API through the test transport and return its
          // real rejection; never follow redirects to an external endpoint.
          const response = await route.fetch({ maxRedirects: 0,
            headers: { ...route.request().headers(), origin: "http://127.0.0.1:3100" } });
          assert.equal(response.status(), 403); await route.fulfill({ response });
        } else await route.fallback();
      });
      await banner(page).getByRole("button", { name: "Только необходимые", exact: true }).click();
      await banner(page).getByRole("alert").waitFor(); assert.equal(await count(), before);
      assert.equal((await choice(page))?.pending, "decline"); assert.equal(await notice(page).count(), 0); await off(page);
      // For a first refusal the pointer is published before prepare and may
      // still have receiptId:null. The durable outbox owns the prepared proof.
      const pending = await page.evaluate(() => {
        const key = Object.keys(localStorage).find(key => key.startsWith("autozap.privacy-operation.v2.") && key.endsWith(".withdraw"));
        return key ? JSON.parse(localStorage.getItem(key)!) as { receiptId: string; id: string } : null;
      });
      assert.ok(pending);
      assert(api.some(row => row.phase === phase && row.action === "decline" && row.status === 403));
      await page.evaluate(() => dispatchEvent(new Event("pageshow"))); await settled(page);
      assert.equal(await banner(page).isVisible(), true, "A local pending choice is not a server acknowledgement");
      await page.reload(); await banner(page).waitFor(); await settled(page);
      assert.equal(await notice(page).count(), 0); assert.equal(await count(), before); await off(page);
      deny = false;
      await banner(page).getByRole("button", { name: "Только необходимые", exact: true }).click(); await registered(page);
      assert.equal((await choice(page))!.receiptId, pending.receiptId);
      const stored = await rows(pending.receiptId!);
      assert.deepEqual(stored.map(row => row.kind), ["decline"]); assert.equal(stored[0].operation_id, pending.id);
      assert.equal(await notice(page).count(), 0); await ctx.close();
    });
    await check("D SQL failure shows error without success; retry writes one refusal", async () => {
      const ctx = await context(), page = await visit(ctx), before = await count();
      const release = await env.lockJournal();
      try {
        await banner(page).getByRole("button", { name: "Только необходимые", exact: true }).click();
        await banner(page).getByRole("alert").waitFor();
        assert.equal(await notice(page).count(), 0); assert.equal((await choice(page))?.pending, "decline"); await off(page);
      } finally { await release(); }
      assert.equal(await count(), before);
      await banner(page).getByRole("button", { name: "Только необходимые", exact: true }).click(); await registered(page);
      assert.deepEqual((await rows((await choice(page))!.receiptId!)).map(row => row.kind), ["decline"]); await ctx.close();
    });
    await check("C/E/F stub grant, return visit, revoke, duplicate retry and new receipt", async () => {
      const ctx = await context(), page = await visit(ctx);
      await banner(page).getByRole("button", { name: "Принять", exact: true }).click(); await registered(page);
      const id = (await choice(page))!.receiptId!;
      assert.deepEqual((await rows(id)).map(row => row.kind), ["grant"]);
      assert(stubLoads > 0, "Only an inert stub is served");
      await page.reload(); await settled(page); assert.equal(await banner(page).count(), 0);
      assert.equal((await choice(page))!.decision, "granted"); assert.equal((await rows(id)).length, 1);
      await settingsSave(page, false); await notice(page).waitFor();
      const history = await rows(id); assert.deepEqual(history.map(row => row.kind), ["grant", "revoke"]);
      const revoke = history.find(row => row.kind === "revoke")!;
      const duplicate = await page.evaluate(async input => {
        const response = await fetch("/api/privacy-consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
        return response.status;
      }, { action: "revoke", receiptId: id, operationId: revoke.operation_id, documentVersion: null });
      assert.equal(duplicate, 200); assert.equal((await rows(id)).length, 2);
      await page.reload(); await settled(page); assert.equal((await choice(page))!.decision, "declined");
      assert.equal(await page.locator("script[data-autozap-analytics]").count(), 0);
      await settingsSave(page, true); await notice(page).waitFor();
      const next = (await choice(page))!.receiptId!; assert.notEqual(next, id);
      assert.deepEqual((await rows(next)).map(row => row.kind), ["grant"]);
      await page.close(); const revisit = await visit(ctx);
      assert.equal(await banner(revisit).count(), 0); assert.equal((await rows(next)).length, 1); await ctx.close();
    });
    await check("D failed grant remains unregistered and retryable", async () => {
      const ctx = await context(), page = await visit(ctx), before = await count(); let deny = true;
      await ctx.route(env.base + "/api/privacy-consent", async route => {
        if (deny && route.request().method() === "POST") {
          const response = await route.fetch({ maxRedirects: 0,
            headers: { ...route.request().headers(), origin: "https://attacker.invalid" } });
          assert.equal(response.status(), 403); await route.fulfill({ response });
        }
        else await route.fallback();
      });
      await banner(page).getByRole("button", { name: "Принять", exact: true }).click(); await banner(page).getByRole("alert").waitFor();
      assert.equal((await choice(page))?.decision === "granted", false); assert.equal(await count(), before);
      assert.equal(await notice(page).count(), 0); await off(page);
      deny = false; await banner(page).getByRole("button", { name: "Принять", exact: true }).click(); await registered(page); await ctx.close();
    });
    await check("unsupported mutation method is 405, not 403", async () => {
      const response = await fetch(env.base + "/api/privacy-consent", { method: "PUT" }); assert.equal(response.status, 405);
    });
    assert.deepEqual(errors, [], "No browser JavaScript errors");
  } finally {
    await Promise.allSettled(contexts.map(ctx => ctx.close()));
    if (isolated) await isolated.cleanup(); await env.cleanup();
    await writeFile(join(output, "report.json"), JSON.stringify({ evidence: { ...evidence, cleanedUp: true, stubLoads }, results, api, errors, external }, null, 2) + "\n");
  }
  if (results.some(result => !result.passed) || errors.length) process.exitCode = 1;
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
