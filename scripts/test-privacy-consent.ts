import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  hasRegisteredGrant, isAnalyticsLocationAllowed, isSafeAnalyticsReferrer,
  parsePrivacyChoice, twelveMonthsAfter, type PrivacyChoice, type RegisteredConsent
} from "../src/features/privacy/domain";
import { createPrivacyReceipt, readPrivacyReceipt } from "../src/features/privacy/receipt";
import { createHash } from "node:crypto";
import { analyticsConsentText, analyticsConsentVersion } from "../src/features/privacy/consent-content";
import { getPrivacyConfiguration } from "../src/config/privacy";

// All identifiers/documents in this file are fixtures, never production configuration.
async function main() {
assert.equal(analyticsConsentVersion, "sha256:" + createHash("sha256").update(analyticsConsentText).digest("hex"));
assert.equal([...analyticsConsentText.matchAll(/^\d+\. [А-ЯЁ].+$/gm)].length, 10);
Object.assign(process.env, {
  DATABASE_URL: "postgres://privacy_test:local_only@127.0.0.1:1/privacy_test",
  PRIVACY_CONSENT_SECRET: "test-only-privacy-secret-at-least-32-characters",
  APP_URL: "http://localhost:3105"
});

const { stateFromConsentEvents } = await import("../src/features/privacy/repository");
const { GET, POST } = await import("../src/app/api/privacy-consent/route");
const now = Date.UTC(2024, 1, 29, 16, 25, 30);
assert.equal(new Date(twelveMonthsAfter(now)).toISOString(), "2025-02-28T16:25:30.000Z");
assert.equal(new Date(twelveMonthsAfter(Date.UTC(2025, 0, 31))).toISOString(), "2026-01-31T00:00:00.000Z");
const receipt = createPrivacyReceipt(now);
assert.equal(readPrivacyReceipt(receipt.value, now)?.receiptId, receipt.receiptId);
assert.equal(readPrivacyReceipt(receipt.value + "x", now), null);
assert.equal(readPrivacyReceipt(receipt.value, receipt.expiresAt), null);
assert.equal(readPrivacyReceipt("old-broken-cookie", now), null);

const local: PrivacyChoice = {
  version: 1, decision: "granted", expiresAt: now + 10_000, receiptId: receipt.receiptId, documentVersion: "test-document-v1"
};
const server: RegisteredConsent = { state: "granted", ...local, expiresAt: now + 8000 };
assert.equal(hasRegisteredGrant(local, server, "test-document-v1", now), true);
assert.equal(hasRegisteredGrant(local, { ...server, state: "unknown" }, "test-document-v1", now), false);
assert.equal(hasRegisteredGrant(local, { ...server, state: "revoked" }, "test-document-v1", now), false);
assert.equal(hasRegisteredGrant(local, server, "different-document", now), false);
assert.equal(hasRegisteredGrant(local, server, "test-document-v1", now + 8000), false);
assert.equal(hasRegisteredGrant(local, { ...server, receiptId: "different-receipt" }, "test-document-v1", now), false);
assert.equal(parsePrivacyChoice(JSON.stringify(local), now)?.decision, "granted");
assert.equal(parsePrivacyChoice(JSON.stringify(local), local.expiresAt), null);
assert.equal(parsePrivacyChoice("{broken", now), null);
assert.equal(parsePrivacyChoice(JSON.stringify({ ...local, pending: "revoke" }), now), null);
assert.equal(parsePrivacyChoice(JSON.stringify({ ...local, decision: "declined", receiptId: null }), now)?.decision, "declined");

for (const path of ["/", "/#catalog", "/#about", "/#reviews", "/#vacancies", "/#contacts", "/#footer", "/catalog", "/catalog/oil", "/catalog/oil/engine"]) {
  assert.equal(isAnalyticsLocationAllowed(new URL(path, "https://example.test")), true, path);
}
for (const path of ["/search", "/search?q=secret", "/admin", "/privacy", "/privacy/analytics-consent", "/spisok-pokupok",
  "/catalog/oil/engine/product", "/catalog/oil?q=secret", "/catalog#secret", "/#user-data", "/catalogue", "/api/search"]) {
  assert.equal(isAnalyticsLocationAllowed(new URL(path, "https://example.test")), false, path);
}
assert.equal(isSafeAnalyticsReferrer("https://example.test/search?q=secret", "https://example.test"), false);
assert.equal(isSafeAnalyticsReferrer("https://example.test/privacy", "https://example.test"), false);
assert.equal(isSafeAnalyticsReferrer("https://external.test/?private=value", "https://example.test"), false);
assert.equal(isSafeAnalyticsReferrer("", "https://example.test"), true);

const event = { id: "fixture", receiptHash: receipt.receiptId, operationId: "fixture", kind: "grant",
  documentVersion: "test-document-v1", occurredAt: new Date(now), expiresAt: new Date(now + 8000) };
assert.equal(stateFromConsentEvents([event], receipt.receiptId, now).state, "granted");
assert.equal(stateFromConsentEvents([event], receipt.receiptId, now + 8000).state, "expired");
assert.equal(stateFromConsentEvents([event, { ...event, kind: "revoke" }], receipt.receiptId, now).state, "revoked");
assert.equal(stateFromConsentEvents([{ ...event, kind: "revoke" }, event], receipt.receiptId, now).state, "revoked");
assert.equal(stateFromConsentEvents([{ ...event, kind: "decline" }], receipt.receiptId, now).state, "declined");

const request = (body: unknown, origin = process.env.APP_URL!) => new NextRequest(`${origin}/api/privacy-consent`, {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify(body)
});
assert.equal((await GET(new NextRequest("http://localhost:3105/api/privacy-consent"))).status, 200);
assert.equal((await POST(request({ action: "prepare" }, "https://hostile.test"))).status, 403);
assert.equal((await POST(request({ action: "prepare", unexpected: true }))).status, 400);
assert.equal((await POST(request({ action: "prepare", value: "x".repeat(3000) }))).status, 413);
const prepared = await POST(request({ action: "prepare" }));
assert.equal(prepared.status, 200);
const cookie = prepared.headers.get("set-cookie")!;
assert.match(cookie, /HttpOnly/i);
assert.match(cookie, /SameSite=strict/i);
assert.match(cookie, /Path=\/api\/privacy-consent/i);
const body = await prepared.json();
assert.match(body.receiptId, /^[a-f0-9]{64}$/);
assert.equal((await POST(request({ action: "grant", receiptId: body.receiptId,
  operationId: crypto.randomUUID(), documentVersion: "test-document-v1" }))).status, 409, "An unverified counter cannot grant even with an approved document");
const unavailable = request({ action: "decline", receiptId: body.receiptId, operationId: crypto.randomUUID(), documentVersion: null });
unavailable.cookies.set("autozap_privacy_receipt", cookie.split(";")[0].split("=")[1]);
const failure = await POST(unavailable);
assert.equal(failure.status, 503, "Database outage is not a successful registration");
assert.equal(JSON.stringify(await failure.json()).includes("postgres"), false);

const analytics = await import("../src/features/privacy/analytics");
const calls: unknown[][] = [];
function storage() {
  const value = Object.create(null) as Storage;
  Object.defineProperties(value, {
    getItem: { value: (key: string) => value[key] ?? null },
    setItem: { value: (key: string, item: string) => { value[key] = item; } },
    removeItem: { value: (key: string) => { delete value[key]; } }
  });
  return value;
}
const localData = storage(), sessionData = storage();
const cookieData = new Map<string, string>();
const fakeDocument = { referrer: "", cookie: "", querySelector: () => ({}),
  createElement: () => ({ dataset: {}, remove() {} }), head: { appendChild: (tag: typeof tags[number]) => { tags.push(tag); } } };
Object.defineProperty(fakeDocument, "cookie", {
  get: () => [...cookieData].map(([key, value]) => `${key}=${value}`).join("; "),
  set: (value: string) => { if (value.includes("Max-Age=0")) cookieData.delete(value.split("=")[0]); }
});
const tags: Array<{ onload?: () => void; remove: () => void }> = [];
const fakeWindow = {
  ym: Object.assign((...args: unknown[]) => {
    if (args[1] === "destruct") assert.equal((fakeWindow as unknown as Record<string, unknown>)[`disableYaCounter${args[0]}`], true,
      "The SDK is blocked before destruct");
    calls.push(args);
  }, { a: [] as unknown[][] }),
  setTimeout, clearTimeout, localStorage: localData, sessionStorage: sessionData
};
Object.assign(globalThis, {
  window: fakeWindow, location: { href: "https://example.test/", origin: "https://example.test", hostname: "example.test", pathname: "/" },
  document: fakeDocument
});
await analytics.updateAnalytics(null, false, () => true);
await analytics.updateAnalytics(1, true, () => false);
assert.equal(tags.length, 0, "No script without a registered authorized grant");
const delayed = analytics.updateAnalytics(1, true, () => true);
assert.equal(tags.length, 1);
assert.equal(calls.length, 0, "No initialization before the loader completes");
analytics.withdrawAnalytics(1);
localData.setItem("_ym_retryReqs", "late SDK data");
tags[0].onload?.();
await delayed;
assert.equal(calls.length, 0, "A late loader callback after withdrawal cannot initialize");
assert.equal(localData.getItem("_ym_retryReqs"), null, "A late SDK load cannot retain its retry queue after withdrawal");
await Promise.all([analytics.updateAnalytics(1, true, () => true), analytics.updateAnalytics(1, true, () => true)]);
assert.equal(calls.filter((call) => call[1] === "init").length, 1);
assert.equal(calls.filter((call) => call[1] === "hit").length, 1);
const hit = calls.find((call) => call[1] === "hit")!;
assert.equal(hit[2], "https://example.test/");
assert.deepEqual(hit[3], { referer: "", title: "Автозапчасти в Талдоме" });
assert.equal(analytics.RESTRICTED_METRIKA_OPTIONS.webvisor, false);
assert.equal(analytics.RESTRICTED_METRIKA_OPTIONS.disableYtm, true);
assert.deepEqual(analytics.RESTRICTED_METRIKA_OPTIONS, { defer: true, webvisor: false, clickmap: false,
  trackLinks: false, trackHash: false, ecommerce: false, accurateTrackBounce: false, sendTitle: false,
  childIframe: false, disableYtm: true });
cookieData.set("_ym_uid", "old"); cookieData.set("autozap_privacy_receipt", "preserve");
cookieData.set("session", "preserve"); cookieData.set("_ym_unrelated", "preserve");
localData.setItem("_ym_retryReqs", "old events");
analytics.stopAnalytics();
assert.equal(calls.some((call) => call[1] === "destruct"), true);
assert.equal(cookieData.get("_ym_uid"), "old", "Temporary pauses preserve cookies");
assert.equal(localData.getItem("_ym_retryReqs"), "old events", "Temporary pauses preserve vendor storage");
assert.equal(analytics.isAnalyticsResident(), true, "Removing a script cannot unload the SDK: sensitive navigation still needs a new document");
fakeWindow.ym.a.push([99, "init", { unrelatedService: true }]);
fakeWindow.ym.a.push([1, "hit", "old event"]);
for (const data of [localData, sessionData]) {
  for (const key of ["_ym_uid", "_ym_retryReqs", "_ym_hide_phones", "_ym1_lsid", "_ym1_lastHit", "_ym1_reqNum",
    "_ym_debugger_state", "_ym_turbo_uid", "ytm_tf_1_fixture", "ytm_tag_1_fixture"]) data.setItem(key, "old");
  for (const key of ["autozap.privacy-choice.v1", "shopping", "_ym99_lsid", "ytm_tf_99_fixture"]) data.setItem(key, "preserve");
}
analytics.withdrawAnalytics(1);
assert.equal(fakeWindow.ym.a.length, 1, "Disabled own analytics cannot clear another service's queue");
assert.equal(cookieData.has("_ym_uid"), false);
assert.equal(cookieData.get("autozap_privacy_receipt"), "preserve");
assert.equal(cookieData.get("session"), "preserve");
assert.equal(cookieData.get("_ym_unrelated"), "preserve");
for (const data of [localData, sessionData]) {
  assert.equal(Object.keys(data).some((key) => data.getItem(key) === "old"), false);
  assert.equal(data.getItem("shopping"), "preserve");
  assert.equal(data.getItem("autozap.privacy-choice.v1"), "preserve");
  assert.equal(data.getItem("_ym99_lsid"), "preserve");
}
await analytics.updateAnalytics(1, true, () => false);
assert.equal(calls.filter((call) => call[1] === "init").length, 1, "A withdrawal never authorizes a restart");
await Promise.all([analytics.updateAnalytics(1, true, () => true), analytics.updateAnalytics(1, true, () => true)]);
assert.equal(calls.filter((call) => call[1] === "init").length, 2, "Explicit renewed authorization initializes once");
assert.equal((fakeWindow as unknown as Record<string, unknown>).disableYaCounter1, false);
assert.equal(localData.getItem("_ym_retryReqs"), null);
analytics.withdrawAnalytics(1);
// These are document visits, not SDK initialization cycles. UI/visibility pauses
// must retain the visit, but a navigation or a new registered grant must not.
const pageviews = () => calls.filter((call) => call[1] === "hit").length;
const initialize = (grant = "grant-a") => analytics.updateAnalytics(1, true, () => true, grant);
await initialize();
let counted = pageviews();
analytics.stopAnalytics(); // Opening privacy settings.
await initialize(); // Closing settings without changing the choice.
assert.equal(pageviews(), counted, "Opening and closing settings must not repeat the current pageview");
analytics.stopAnalytics(); // Hidden tab / server revalidation on resume.
await initialize();
assert.equal(pageviews(), counted, "Returning to a visible tab must not repeat the current pageview");
const navigate = (path: string) => {
  const next = new URL(path, "https://example.test");
  Object.assign(location, { href: next.href, pathname: next.pathname });
  analytics.observeAnalyticsRoute();
};
navigate("/catalog"); await initialize();
assert.equal(pageviews(), ++counted, "A real route change sends one pageview");
await Promise.all([initialize(), initialize()]);
assert.equal(pageviews(), counted, "Repeated updates of the same route do not create a new visit");
navigate("/"); await initialize();
assert.equal(pageviews(), ++counted, "Returning from another route counts as a real pageview");
analytics.stopAnalytics();
navigate("/catalog"); navigate("/");
await initialize();
assert.equal(pageviews(), ++counted, "A return navigation while paused must not be mistaken for the old visit");
analytics.stopAnalytics();
await initialize("grant-b");
assert.equal(pageviews(), ++counted, "A new registered grant starts a fresh view even at the same URL");
analytics.withdrawAnalytics(1);
await analytics.updateAnalytics(1, true, () => false, "grant-b");
assert.equal(pageviews(), counted, "Withdrawal forbids further pageviews");
await initialize("grant-c");
assert.equal(pageviews(), ++counted, "An explicit new consent can resume the current page");
for (const path of ["/search?q=private-search-marker", "/catalog?q=private-search-marker", "/catalog?utm_source=private-search-marker",
  "/catalog?utm_medium=private-search-marker", "/catalog?utm_campaign=private-search-marker", "/catalog?yclid=private-search-marker",
  "/catalog?page=2", "/catalog/oil/engine/product"]) {
  navigate(path); await initialize("grant-c");
  assert.equal(pageviews(), counted, `Excluded route cannot send a view: ${path}`);
}
assert.equal(JSON.stringify(calls).includes("private-search-marker"), false);
assert.equal(JSON.stringify(calls).includes("grant-"), false, "Consent identity remains local and is never sent to the SDK");
analytics.withdrawAnalytics(1);
console.log("PASS pageview lifecycle: settings, visibility, real/return/paused navigation, fresh grants and excluded URLs");

const configurationKeys = ["NODE_ENV", "YANDEX_METRIKA_COUNTER_ID", "YANDEX_METRIKA_CONFIGURATION_VERIFIED", "PRIVACY_CONSENT_SECRET"] as const;
const originalConfiguration = configurationKeys.map((key) => [key, process.env[key]] as const);
try {
  Object.assign(process.env, { NODE_ENV: "production", YANDEX_METRIKA_COUNTER_ID: "113668070" });
  delete process.env.YANDEX_METRIKA_CONFIGURATION_VERIFIED;
  delete process.env.PRIVACY_CONSENT_SECRET;
  assert.equal(getPrivacyConfiguration().counterId, 113668070);
  assert.equal(getPrivacyConfiguration().analyticsReady, false, "Analytics stays disabled by default");
  process.env.YANDEX_METRIKA_CONFIGURATION_VERIFIED = "true";
  assert.equal(getPrivacyConfiguration().analyticsReady, false, "Production cannot enable analytics without its receipt secret");
  assert.throws(() => createPrivacyReceipt(), /secret is not configured/);
  process.env.PRIVACY_CONSENT_SECRET = "too-short";
  assert.equal(getPrivacyConfiguration().analyticsReady, false);
  process.env.PRIVACY_CONSENT_SECRET = "isolated-config-fixture-secret-at-least-32-characters";
  assert.equal(getPrivacyConfiguration().analyticsReady, true);
  assert.equal(JSON.stringify(getPrivacyConfiguration()).includes(process.env.PRIVACY_CONSENT_SECRET), false,
    "The public configuration must not expose the server secret");
  process.env.YANDEX_METRIKA_CONFIGURATION_VERIFIED = "false";
  assert.equal(getPrivacyConfiguration().analyticsReady, false, "Configuration is read afresh, never cached");
} finally {
  for (const [key, value] of originalConfiguration) {
    if (value === undefined) delete process.env[key]; else Object.assign(process.env, { [key]: value });
  }
}
console.log("PASS runtime configuration: disabled defaults, counter ID, production secret gate and no secret in public props");
console.log("Privacy tests passed: calendar expiry, signed receipts, journal states, CSRF/body validation, publication gates, DB outage, SDK race and duplicate protection.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
