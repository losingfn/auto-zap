import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createPrivacyConsentHandlers } from "../src/features/privacy/endpoint";
import { PrivacyCoordinator, PrivacyRequestError, PRIVACY_INTENT_KEY, PRIVACY_OPERATION_PREFIX } from "../src/features/privacy/coordinator";
import {
  MAX_PRIVACY_PROOFS, PRIVACY_COOKIE, PRIVACY_STORAGE_KEY, PrivacyOperationConflict, unknownConsent,
  type ConsentAcknowledgement, type ConsentEventKind, type RegisteredConsent
} from "../src/features/privacy/domain";
import { createPrivacyReceipt, proofCookieName } from "../src/features/privacy/receipt";
import { analyticsConsentVersion } from "../src/features/privacy/consent-content";

Object.assign(process.env, {
  APP_URL: "https://privacy-fixture.invalid", PRIVACY_CONSENT_SECRET: "isolated-lifecycle-fixture-secret-at-least-32-characters",
  YANDEX_METRIKA_COUNTER_ID: "1", YANDEX_METRIKA_CONFIGURATION_VERIFIED: "true"
});
class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
type Input = { receiptId: string; operationId: string; kind: ConsentEventKind; documentVersion: string | null; receiptExpiresAt: number };
type Event = Input & { expiresAt: number };
function deferred() { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; }

// This is an explicitly in-memory journal, NOT a PostgreSQL integration test.
export function fixture() {
  const storage = new MemoryStorage(), cookies = new Map<string, string>(), events: Event[] = [];
  const requests: { action: string; receiptId?: string; operationId?: string }[] = [];
  let unavailable = false, loseNextWithdrawal = false, wrongAcknowledgement = false;
  let failGet = false, stopped = 0, serial = Promise.resolve();
  let grantHold: ReturnType<typeof deferred> | null = null;
  let grantEntered: ReturnType<typeof deferred> | null = null;
  const state = (id: string): RegisteredConsent => {
    const own = events.filter((event) => event.receiptId === id);
    const grant = own.find((event) => event.kind === "grant");
    const off = own.find((event) => event.kind === "revoke") ?? own.find((event) => event.kind === "decline");
    return off ? { state: off.kind === "revoke" ? "revoked" : "declined", receiptId: id,
      documentVersion: grant?.documentVersion ?? null, expiresAt: off.expiresAt }
      : grant ? { state: grant.expiresAt > Date.now() ? "granted" : "expired", receiptId: id,
        documentVersion: grant.documentVersion, expiresAt: grant.expiresAt } : { ...unknownConsent, receiptId: id };
  };
  const handlers = createPrivacyConsentHandlers({
    getRegisteredConsent: async (id) => { if (unavailable || failGet) throw new Error("fixture outage"); return state(id); },
    registerConsentEvent: async (input): Promise<ConsentAcknowledgement> => {
      if (unavailable) throw new Error("fixture outage");
      if (input.kind === "grant" && grantHold) { grantEntered!.resolve(); await grantHold.promise; }
      const own = events.filter((event) => event.receiptId === input.receiptId);
      const kind = input.kind === "decline" && own.some((event) => event.kind === "grant") ? "revoke" : input.kind;
      const previous = events.find((event) => event.operationId === input.operationId);
      const sameKind = own.find((event) => event.kind === kind);
      if (previous && (previous.receiptId !== input.receiptId || previous.kind !== kind) ||
        sameKind && sameKind.operationId !== input.operationId ||
        kind === "grant" && own.some((event) => event.kind !== "grant")) throw new PrivacyOperationConflict();
      if (!previous && !own.some((event) => event.kind === kind)) events.push({ ...input, kind,
        expiresAt: Math.min(input.receiptExpiresAt, Date.now() + 365 * 86400000) });
      return { ...state(input.receiptId), operationId: input.operationId, eventKind: kind };
    }
  });
  async function request<T>(body?: unknown, selected?: string): Promise<T> {
    const input = body as { action: string; receiptId?: string; operationId?: string } | undefined;
    requests.push(input ?? { action: "GET", receiptId: selected });
    const request = new NextRequest("https://privacy-fixture.invalid/api/privacy-consent", {
      method: body ? "POST" : "GET", headers: body ? { Origin: process.env.APP_URL!, "Content-Type": "application/json" }
        : selected ? { "X-Privacy-Receipt": selected } : {},
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    for (const [name, value] of cookies) request.cookies.set(name, value);
    const response = await (body ? handlers.POST(request) : handlers.GET(request));
    for (const cookie of response.cookies.getAll()) {
      if (cookie.maxAge === 0) cookies.delete(cookie.name); else cookies.set(cookie.name, cookie.value);
    }
    const value = await response.json();
    if (!response.ok) throw new PrivacyRequestError(response.status, value.code);
    if (input?.action === "revoke" && loseNextWithdrawal) { loseNextWithdrawal = false; throw new PrivacyRequestError(503); }
    if (input?.action === "revoke" && wrongAcknowledgement) return { ...value, receiptId: "b".repeat(64), eventKind: "decline", state: "declined" } as T;
    return value as T;
  }
  function tab(locks = true) {
    return new PrivacyCoordinator({ storage, request, now: Date.now, id: randomUUID, stop: () => { stopped++; }, changed: () => {},
      lock: locks ? async <T>(work: () => Promise<T>) => {
        const before = serial; const done = deferred(); serial = done.promise;
        await before; try { return await work(); } finally { done.resolve(); }
      } : undefined
    }, analyticsConsentVersion, true);
  }
  return { handlers, storage, cookies, events, requests, request, state, tab, stopped: () => stopped,
    outage: (value: boolean) => { unavailable = value; }, getFailure: (value: boolean) => { failGet = value; },
    loseResponse: () => { loseNextWithdrawal = true; }, wrongAck: () => { wrongAcknowledgement = true; },
    holdGrant: () => { grantHold = deferred(); grantEntered = deferred(); return { entered: grantEntered.promise, release: grantHold.resolve }; }
  };
}
async function check(name: string, work: () => Promise<void>) { await work(); console.log(`PASS ${name}`); }
const version = analyticsConsentVersion;

async function main() {
  await check("1/20 first explicit grant; analytics gated until acknowledgement", async () => {
    const f = fixture(), tab = f.tab(), held = f.holdGrant(); await tab.synchronize();
    assert.equal(f.events.length, 0); assert.equal(tab.isAuthorized(), false);
    const pending = tab.save(true); await held.entered; assert.equal(tab.isAuthorized(), false);
    held.release(); assert.equal(await pending, true); assert.equal(tab.isAuthorized(), true);
    assert.equal(f.events.filter((e) => e.kind === "grant").length, 1);
  });
  await check("2 first refusal", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize();
    assert.equal(await tab.save(false), true); assert.equal(tab.isAuthorized(), false); assert.equal(f.events[0].kind, "decline");
  });
  await check("3 revoke preserves original grant; 4 regrant uses fresh identity", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize(); assert.equal(await tab.save(true), true);
    const a = f.events[0].receiptId;
    const off = tab.save(false); assert.equal(tab.isAuthorized(), false); assert.equal(await off, true);
    assert.equal(f.state(a).state, "revoked"); assert.equal(f.events.filter((e) => e.receiptId === a).length, 2);
    assert.equal(await tab.save(true), true); assert.notEqual(f.events.at(-1)!.receiptId, a);
  });
  await check("5 shared-cookie tabs; 6 prepare B cannot destroy withdrawal proof A", async () => {
    const f = fixture(), a = f.tab(), b = f.tab(); await a.synchronize(); await a.save(true); await b.synchronize();
    const original = f.events[0].receiptId;
    await f.request({ action: "prepare" });
    assert.equal(await b.save(false), true); assert.equal(f.state(original).state, "revoked");
    assert.equal(a.isAuthorized(), false); await a.synchronize(); assert.equal(a.isAuthorized(), false);
  });
  await check("7 failed GET retains grant identity; 8 later refusal is revoke A", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize(); await tab.save(true);
    const a = f.events[0].receiptId; f.getFailure(true); await tab.synchronize();
    assert.equal(tab.snapshot.choice!.receiptId, a); assert.equal(tab.isAuthorized(), false);
    f.getFailure(false); assert.equal(await tab.save(false), true);
    assert.equal(f.events.at(-1)!.kind, "revoke"); assert.equal(f.events.at(-1)!.receiptId, a);
    assert.equal(f.events.some((e) => e.kind === "decline"), false);
  });
  await check("9 wrong receipt/event acknowledgement never confirms withdrawal", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize(); await tab.save(true); f.wrongAck();
    assert.equal(await tab.save(false), false); assert.equal(tab.isAuthorized(), false); assert.ok(tab.snapshot.message);
  });
  await check("10 lost response retries stable operationId and equivalent revoke", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize(); await tab.save(true); f.loseResponse();
    assert.equal(await tab.save(false), false); const first = f.requests.find((r) => r.action === "revoke")!;
    await tab.retry(); const repeats = f.requests.filter((r) => r.action === "revoke");
    assert.ok(repeats.length >= 2); assert.ok(repeats.every((r) => r.operationId === first.operationId));
    assert.equal(f.events.filter((e) => e.kind === "revoke").length, 1); assert.equal(tab.hasPending(), false);
  });
  await check("11 missing proof yields terminal 409, no repeated conflicting writes", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize(); await tab.save(true); const a = f.events[0].receiptId;
    f.cookies.clear(); assert.equal(await tab.save(false), false);
    const before = f.requests.filter((r) => r.action === "revoke").length;
    await tab.retry(); await tab.retry();
    assert.equal(f.requests.filter((r) => r.action === "revoke").length, before);
    assert.equal(f.events.some((e) => e.kind === "decline"), false); assert.equal(f.state(a).state, "granted");
  });
  await check("12 temporary 503 keeps analytics off; 13 reload recovers exact revoke", async () => {
    const f = fixture(), a = f.tab(); await a.synchronize(); await a.save(true); const id = f.events[0].receiptId;
    f.outage(true); assert.equal(await a.save(false), false); assert.equal(a.isAuthorized(), false); a.dispose();
    const b = f.tab(); await b.synchronize(); assert.equal(b.isAuthorized(), false); f.outage(false); await b.retry();
    assert.equal(f.state(id).state, "revoked"); assert.equal(b.hasPending(), false);
  });
  await check("14 newer off supersedes delayed grant; stale tab cannot restart analytics", async () => {
    const f = fixture(), a = f.tab(), b = f.tab(), held = f.holdGrant(); await a.synchronize(); await b.synchronize();
    const granting = a.save(true); await held.entered; const withdrawing = b.save(false); assert.equal(a.isAuthorized(), false);
    held.release(); assert.equal(await granting, false); assert.equal(await withdrawing, true);
    assert.equal(f.events[0].kind, "grant"); assert.equal(f.state(f.events[0].receiptId).state, "revoked");
    assert.equal(a.isAuthorized(), false); assert.equal(b.isAuthorized(), false);
  });
  await check("15 forged/expired proof and foreign receipt rejected", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize(); await tab.save(true); const a = f.events[0].receiptId;
    const body = { action: "revoke", receiptId: a, operationId: randomUUID(), documentVersion: null };
    f.cookies.clear(); f.cookies.set(PRIVACY_COOKIE, a);
    await assert.rejects(f.request(body), (e: unknown) => e instanceof PrivacyRequestError && e.status === 409);
    f.cookies.set(PRIVACY_COOKIE, createPrivacyReceipt(Date.now() - 2 * 365 * 86400000).value);
    await assert.rejects(f.request(body), (e: unknown) => e instanceof PrivacyRequestError && e.status === 409);
    f.cookies.set(PRIVACY_COOKIE, createPrivacyReceipt().value);
    await assert.rejects(f.request(body), (e: unknown) => e instanceof PrivacyRequestError && e.status === 409);
    assert.equal(f.events.length, 1);
  });
  await check("16 local grant without cookie is retained for off, never replaced by decline B", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize(); await tab.save(true); const a = f.events[0].receiptId;
    f.cookies.clear(); await tab.synchronize(); assert.equal(tab.snapshot.choice!.receiptId, a);
    assert.equal(tab.isAuthorized(), false); assert.equal(await tab.save(false), false);
    assert.equal(f.requests.filter((r) => r.action === "prepare").length, 1);
  });
  await check("17 corrupted localStorage discovers authenticated grant without enabling analytics", async () => {
    const f = fixture(), a = f.tab(); await a.synchronize(); await a.save(true); const id = f.events[0].receiptId;
    f.storage.setItem(PRIVACY_STORAGE_KEY, "{broken"); const b = f.tab(); await b.synchronize();
    assert.equal(b.isAuthorized(), false); assert.equal(await b.save(false), true); assert.equal(f.state(id).state, "revoked");
  });
  await check("18 expired local choice and 19 storage sync cannot authorize old state", async () => {
    const f = fixture(), a = f.tab(), b = f.tab(); await a.synchronize(); await a.save(true); await b.synchronize();
    const local = JSON.parse(f.storage.getItem(PRIVACY_STORAGE_KEY)!); local.expiresAt = Date.now() - 1;
    f.storage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(local)); assert.equal(a.isAuthorized(), false);
    await b.synchronize(); assert.equal(b.isAuthorized(), false); assert.equal(await b.save(false), true);
    assert.equal(a.isAuthorized(), false);
  });
  await check("20 no grant with unavailable locks; immediate off and no automatic acceptance", async () => {
    const f = fixture(), tab = f.tab(false); await tab.synchronize(); assert.equal(await tab.save(true), false);
    assert.equal(tab.isAuthorized(), false); assert.equal(f.events.length, 0);
    assert.equal(await tab.save(false), true); assert.equal(tab.snapshot.choice!.decision, "declined");
  });
  await check("bounded proofs and repeated grant/withdraw cycles", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize();
    for (let i = 0; i < MAX_PRIVACY_PROOFS + 3; i++) {
      assert.equal(await tab.save(true), true); assert.equal(await tab.save(false), true);
      assert.ok(f.cookies.size <= MAX_PRIVACY_PROOFS + 1);
    }
    assert.ok(![...f.storage.values.keys()].some((key) => key.startsWith(PRIVACY_OPERATION_PREFIX)));
  });
  await check("simultaneous explicit grants serialize; only latest intent succeeds", async () => {
    const f = fixture(), a = f.tab(), b = f.tab(); await a.synchronize(); await b.synchronize();
    const result = await Promise.all([a.save(true), b.save(true)]);
    assert.deepEqual(result, [false, true]); assert.equal(f.events.filter((e) => e.kind === "grant").length, 1);
    assert.equal(a.isAuthorized(), false); assert.equal(b.isAuthorized(), true);
  });
  await check("legacy cookie and pending revoke migrate without losing proof", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize(); await tab.save(true); const a = f.events[0].receiptId;
    f.cookies.delete(proofCookieName(a));
    f.storage.removeItem(PRIVACY_INTENT_KEY);
    f.storage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify({ version: 1, decision: "declined", receiptId: a,
      documentVersion: version, expiresAt: Date.now() + 86400000, pending: "revoke", operationId: randomUUID() }));
    const b = f.tab(); await b.synchronize(); await b.retry(); assert.equal(f.state(a).state, "revoked");
  });
  await check("storage synchronization cannot recreate an already delivered pending operation", async () => {
    const f = fixture(), a = f.tab(); await a.synchronize(); assert.equal(await a.save(true), true);
    const id = f.events[0].receiptId, operationId = randomUUID();
    const local = JSON.parse(f.storage.getItem(PRIVACY_STORAGE_KEY)!);
    // State between the successful POST/removal from the queue and the final local choice write.
    await f.request({ action: "revoke", receiptId: id, operationId, documentVersion: null });
    f.storage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify({ ...local, decision: "declined", pending: "revoke", operationId }));
    const b = f.tab(); await b.synchronize();
    assert.equal([...f.storage.values.keys()].some((key) => key.startsWith(PRIVACY_OPERATION_PREFIX)), false);
    await b.retry(); assert.equal(b.hasPending(), false); assert.equal(f.events.length, 2);
  });
  await check("new UUID is not acknowledged for an existing event; repeated off verifies the same receipt", async () => {
    const f = fixture(), a = f.tab(); await a.synchronize(); await a.save(true); await a.save(false);
    const id = f.events[0].receiptId, count = f.events.length;
    await assert.rejects(f.request({ action: "revoke", receiptId: id, operationId: randomUUID(), documentVersion: null }),
      (error: unknown) => error instanceof PrivacyRequestError && error.code === "operation_conflict");
    assert.equal(await a.save(false), true); assert.equal(a.hasPending(), false); assert.equal(f.events.length, count);
  });
  await check("simultaneous prepare responses preserve both signed credentials; repeated UUID is idempotent", async () => {
    const f = fixture();
    const [a, b] = await Promise.all([
      f.request<{ receiptId: string }>({ action: "prepare" }), f.request<{ receiptId: string }>({ action: "prepare" })
    ]);
    assert.notEqual(a.receiptId, b.receiptId);
    const operation = { action: "grant", receiptId: a.receiptId, operationId: randomUUID(), documentVersion: version };
    const first = await f.request<ConsentAcknowledgement>(operation), repeated = await f.request<ConsentAcknowledgement>(operation);
    assert.equal(first.receiptId, a.receiptId); assert.equal(repeated.operationId, operation.operationId);
    assert.equal(f.events.length, 1);
    const tab = f.tab(); await tab.synchronize(); assert.equal(tab.isAuthorized(), false);
    assert.equal(await tab.save(false), true); assert.equal(f.state(a.receiptId).state, "revoked");
  });
  await check("proof limit refuses preparation without evicting an active credential", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize(); await tab.save(true);
    const a = f.events[0].receiptId, proof = f.cookies.get(proofCookieName(a));
    for (let i = 1; i < MAX_PRIVACY_PROOFS; i++) await f.request({ action: "prepare" });
    await assert.rejects(f.request({ action: "prepare" }), (e: unknown) => e instanceof PrivacyRequestError && e.code === "receipt_limit");
    assert.equal(f.cookies.get(proofCookieName(a)), proof); assert.equal(await tab.save(false), true);
  });
  await check("expired credential has a distinct terminal error; hash cannot recover it", async () => {
    const f = fixture(), expired = createPrivacyReceipt(Date.now() - 2 * 365 * 86400000);
    f.cookies.set(PRIVACY_COOKIE, expired.value);
    await assert.rejects(f.request({ action: "revoke", receiptId: expired.receiptId,
      operationId: randomUUID(), documentVersion: null }),
    (e: unknown) => e instanceof PrivacyRequestError && e.code === "receipt_expired");
    assert.equal(f.events.length, 0);
  });
  await check("old document version retains original withdrawal identity", async () => {
    const f = fixture(), a = f.tab(); await a.synchronize(); await a.save(true); const id = f.events[0].receiptId;
    const local = JSON.parse(f.storage.getItem(PRIVACY_STORAGE_KEY)!); local.documentVersion = "old-document";
    f.storage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(local)); const b = f.tab(); await b.synchronize();
    assert.equal(b.isAuthorized(), false); assert.equal(await b.save(false), true); assert.equal(f.state(id).state, "revoked");
  });
  await check("off between grant intent check and storage write cannot be overwritten", async () => {
    const f = fixture(), a = f.tab(), b = f.tab(); await a.synchronize(); await b.synchronize();
    const write = f.storage.setItem.bind(f.storage); let off: Promise<boolean> | null = null; let intercepted = false;
    f.storage.setItem = (key, value) => {
      if (!intercepted && key === PRIVACY_STORAGE_KEY && JSON.parse(value).decision === "granted") {
        intercepted = true; off = b.save(false);
      }
      write(key, value);
    };
    assert.equal(await a.save(true), false); assert.ok(off); assert.equal(await off, true);
    assert.equal(JSON.parse(f.storage.getItem(PRIVACY_STORAGE_KEY)!).decision, "declined");
    assert.equal(f.state(f.events[0].receiptId).state, "revoked"); assert.equal(a.isAuthorized(), false);
  });
  await check("invalid proof cookies do not accumulate across new preparations", async () => {
    const f = fixture(); const a = await f.request<{ receiptId: string }>({ action: "prepare" });
    f.cookies.delete(PRIVACY_COOKIE);
    f.cookies.set(proofCookieName(a.receiptId), f.cookies.get(proofCookieName(a.receiptId))! + "invalid");
    await f.request({ action: "prepare" });
    assert.equal(f.cookies.has(proofCookieName(a.receiptId)), false); assert.equal(f.cookies.size, 2);
  });
  console.log("Lifecycle checks passed using actual API/coordinator and an explicit in-memory journal. Real PostgreSQL/browser not verified by this suite.");
}
if (process.argv[1]?.endsWith("test-privacy-lifecycle.ts")) main().catch((error) => { console.error(error); process.exitCode = 1; });
