/** Isolated API security regression: real handlers, injected journal, no DB or SDK. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { analyticsConsentVersion } from "../src/features/privacy/consent-content";
import { PRIVACY_COOKIE, unknownConsent } from "../src/features/privacy/domain";

async function main() {
  const origin = "https://autozapchast-taldom.ru", internal = "http://127.0.0.1:3100/api/privacy-consent";
  Object.assign(process.env, { NODE_ENV: "production", APP_URL: origin,
    PRIVACY_CONSENT_SECRET: randomBytes(32).toString("hex"),
    YANDEX_METRIKA_COUNTER_ID: "1", YANDEX_METRIKA_CONFIGURATION_VERIFIED: "false" });
  const { createPrivacyConsentHandlers } = await import("../src/features/privacy/endpoint");
  let reads = 0, writes = 0, fail = false;
  const handlers = createPrivacyConsentHandlers({
    getRegisteredConsent: async () => { reads++; if (fail) throw new Error("Isolated DB failure"); return unknownConsent; },
    registerConsentEvent: async input => {
      writes++; if (fail) throw new Error("Isolated DB failure");
      return { state: input.kind === "grant" ? "granted" : input.kind === "revoke" ? "revoked" : "declined",
        receiptId: input.receiptId, operationId: input.operationId, eventKind: input.kind,
        documentVersion: input.documentVersion, expiresAt: input.receiptExpiresAt };
    }
  });
  const post = (body: unknown, headers: Record<string, string> = {}, url = internal) => handlers.POST(new NextRequest(url, {
    method: "POST", headers: { origin, "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body)
  }));
  const get = await handlers.GET(new NextRequest(internal));
  assert.equal(get.status, 200); assert.deepEqual(await get.json(), { ...unknownConsent, receipts: [] });
  assert.equal(reads, 0, "Unknown GET does not test database availability");
  assert.equal(get.headers.get("cache-control"), "private, no-store");
  for (const action of ["prepare", "grant", "decline", "revoke"]) {
    assert.equal((await post({ action }, { origin: "http://127.0.0.1:3100" })).status, 403);
  }
  for (const bad of ["null", "", "http://autozapchast-taldom.ru", "https://autozapchast-taldom.ru:3100",
    "https://www.autozapchast-taldom.ru", "https://autozapchast-taldom.ru.attacker.invalid"]) {
    assert.equal((await post({ action: "prepare" }, { origin: bad, referer: origin + "/",
      "x-forwarded-host": "autozapchast-taldom.ru", "x-forwarded-proto": "https" })).status, 403, bad);
  }
  const missingOrigin = new NextRequest(internal, { method: "POST", headers: { "content-type": "application/json", referer: origin }, body: '{"action":"prepare"}' });
  assert.equal((await handlers.POST(missingOrigin)).status, 403);
  for (const site of ["same-site", "cross-site", "none"]) assert.equal((await post({ action: "prepare" }, { "sec-fetch-site": site })).status, 403);
  assert.equal(reads + writes, 0, "403 is before receipt verification and journal access");
  console.log("PASS tunneled GET 200 / POST 403: strict Origin and Fetch Metadata guards reject before DB");

  const prepared = await post({ action: "prepare" }, { host: "127.0.0.1:3100", referer: origin + "/",
    "x-forwarded-host": "autozapchast-taldom.ru", "x-forwarded-proto": "https" });
  assert.equal(prepared.status, 200);
  const { receiptId } = await prepared.json();
  const cookies = prepared.cookies.getAll();
  const cookie = cookies.map(value => `${value.name}=${value.value}`).join("; ");
  assert(cookies.some(value => value.name === PRIVACY_COOKIE));
  for (const value of cookies) {
    assert.equal(value.httpOnly, true); assert.equal(value.secure, true);
    assert.equal(value.sameSite, "strict"); assert.equal(value.path, "/api/privacy-consent");
  }
  const noMetadata = new NextRequest(internal, { method: "POST", headers: { origin, "content-type": "application/json" }, body: '{"action":"prepare"}' });
  assert.equal((await handlers.POST(noMetadata)).status, 200, "Older browsers without Fetch Metadata still require a trusted Origin");
  assert.equal((await post({ action: "prepare" }, { referer: "https://attacker.invalid/" })).status, 200, "Referer is not used as authorization");
  const input = { action: "decline", operationId: randomUUID(), receiptId, documentVersion: null };
  assert.equal((await post(input, { cookie })).status, 200);
  assert.equal(writes, 1);
  assert.equal((await post({ ...input, action: "revoke", operationId: randomUUID() }, { cookie })).status, 200);
  assert.equal((await post({ ...input, action: "grant", documentVersion: analyticsConsentVersion }, { cookie })).status, 409, "Disabled analytics cannot grant");
  process.env.YANDEX_METRIKA_CONFIGURATION_VERIFIED = "true"; // Injected journal only; never loads an SDK.
  assert.equal((await post({ ...input, action: "grant", documentVersion: analyticsConsentVersion }, { cookie })).status, 200);
  process.env.YANDEX_METRIKA_CONFIGURATION_VERIFIED = "false";
  console.log("PASS trusted production Origin behind loopback proxy, signed Secure cookies, decline/revoke and isolated grant gate");

  assert.equal((await post({ action: "decline" })).status, 400);
  assert.equal((await post({ ...input, receiptId: "invalid" }, { cookie })).status, 400);
  assert.equal((await post({ ...input, operationId: "invalid" }, { cookie })).status, 400);
  assert.equal((await post({ ...input, extra: true }, { cookie })).status, 400);
  assert.equal((await post("{broken")).status, 400);
  assert.equal((await post({ action: "prepare", text: "x".repeat(2100) })).status, 413);
  assert.equal((await post({ action: "prepare" }, { "content-type": "text/plain" })).status, 415);
  assert.equal((await post(input)).status, 409, "Missing signed cookie is not a 403");
  assert.equal((await post(input, { cookie: `${PRIVACY_COOKIE}=invalid` })).status, 409);
  const signingSecret = process.env.PRIVACY_CONSENT_SECRET;
  process.env.PRIVACY_CONSENT_SECRET = randomBytes(32).toString("hex");
  assert.equal((await post(input, { cookie })).status, 409, "Changed signing secret invalidates proof, not Origin");
  delete process.env.PRIVACY_CONSENT_SECRET;
  assert.equal((await post({ action: "prepare" })).status, 503);
  process.env.PRIVACY_CONSENT_SECRET = signingSecret;
  fail = true;
  const unavailable = await post(input, { cookie });
  assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).code, "unavailable");
  assert.equal((await handlers.GET(new NextRequest(internal, { headers: { cookie } }))).status, 503);
  assert.equal((await handlers.GET(new NextRequest(internal))).status, 200, "No-proof GET can stay 200 even during DB failure");
  console.log("PASS invalid JSON/input/media/size, missing or invalid proof, secret rotation/missing secret and DB error have distinct non-403 outcomes");
  console.log("No database, real SDK, production HTTP request, or secret output was used.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
