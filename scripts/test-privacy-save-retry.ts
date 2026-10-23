/** Explicit retry regression. In-memory journal; no SDK or PostgreSQL. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrivacyCoordinator, PrivacyRequestError, PRIVACY_OPERATION_PREFIX } from "../src/features/privacy/coordinator";
import { analyticsConsentVersion } from "../src/features/privacy/consent-content";
import { fixture } from "./test-privacy-lifecycle";

async function main() {
  for (const granted of [false, true]) {
    const f = fixture();
    if (granted) assert.equal(await f.tab().save(true), true);
    let forbidden = true;
    const sent: { action: string; receiptId: string; operationId: string }[] = [];
    const tab = new PrivacyCoordinator({ storage: f.storage, now: Date.now, id: randomUUID, stop() {}, changed() {},
      lock: async work => work(), request: async <T>(body?: unknown, selected?: string): Promise<T> => {
        const input = body as { action: string; receiptId: string; operationId: string } | undefined;
        if (input && ["decline", "revoke"].includes(input.action)) {
          sent.push(input); if (forbidden) throw new PrivacyRequestError(403);
        }
        return f.request<T>(body, selected);
      }
    }, analyticsConsentVersion, true);
    assert.equal(await tab.save(false), false);
    assert.equal(tab.isAuthorized(), false); assert.ok(tab.snapshot.message);
    const operationKey = [...f.storage.values.keys()].find(key => key.startsWith(PRIVACY_OPERATION_PREFIX) && key.endsWith(".withdraw"))!;
    assert.equal(JSON.parse(f.storage.getItem(operationKey)!).blocked, true);
    const sentBefore = sent.length;
    await tab.retry(); assert.equal(sent.length, sentBefore, "Background retry cannot bypass a terminal rejection");
    forbidden = false;
    assert.equal(await tab.save(false), true, "An explicit retry must revalidate the same pending withdrawal at the server");
    assert.equal(tab.hasPending(), false); assert.equal(tab.isAuthorized(), false);
    assert.equal(sent.length, sentBefore + 1);
    assert.equal(sent.at(-1)!.receiptId, sent[0].receiptId); assert.equal(sent.at(-1)!.operationId, sent[0].operationId);
    assert.deepEqual(f.events.map(event => event.kind), granted ? ["grant", "revoke"] : ["decline"]);
    console.log(`PASS explicit retry after terminal 403 retains original ${granted ? "revoke" : "decline"} identity and requires real ACK`);
  }
  const f = fixture(), tab = f.tab(); await tab.save(true); f.cookies.clear();
  assert.equal(await tab.save(false), false);
  assert.equal(await tab.save(false), false, "Explicit retry cannot invent a missing signed proof");
  assert.equal(tab.isAuthorized(), false); assert.equal(tab.hasPending(), true);
  assert.deepEqual(f.events.map(event => event.kind), ["grant"]);
  console.log("PASS explicit retry still fails closed for missing credentials; no substitute decline or new grant");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
