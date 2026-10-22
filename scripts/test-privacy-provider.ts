import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transpileModule, ModuleKind, JsxEmit, ScriptTarget } from "typescript";
import { randomUUID } from "node:crypto";
import * as domain from "../src/features/privacy/domain";
import * as coordination from "../src/features/privacy/coordinator";
import { fixture } from "./test-privacy-lifecycle";
import { analyticsConsentVersion } from "../src/features/privacy/consent-content";

async function main() {
  const f = fixture();
  const states: unknown[] = [], refs: { current: unknown }[] = [], effects: (() => void | (() => void))[] = [];
  let stateIndex = 0, refIndex = 0;
  let withdrawals = 0;
  const observedRoutes: string[] = [];
  const grantKeys: string[] = [];
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const react = {
    createContext: () => ({ Provider: "Provider" }), useContext: () => null, useCallback: (value: unknown) => value,
    useEffect: (effect: () => void | (() => void)) => effects.push(effect),
    useRef: (value: unknown) => refs[refIndex++] ??= { current: value },
    useState: (value: unknown) => {
      const index = stateIndex++; if (!(index in states)) states[index] = value;
      return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    }
  };
  const context = {
    exports: {} as { PrivacyProvider?: (props: unknown) => { props: { children: [unknown, { props: { openSettings: () => void; save: (grant: boolean) => Promise<void> } }, unknown] } } },
    require: (name: string) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/navigation") return { usePathname: () => "/" };
      if (name === "./domain") return domain;
      if (name === "./coordinator") return coordination;
      if (name === "./analytics") return {
        observeAnalyticsRoute() { observedRoutes.push(context.window.location.pathname); },
        stopAnalytics() {}, withdrawAnalytics() { withdrawals++; },
        updateAnalytics: async (_id: number, _ready: boolean, _authorized: unknown, grantKey: string) => { grantKeys.push(grantKey); },
        isAnalyticsResident: () => false, leaveAnalyticsDocument() {}
      };
      if (name === "@/components/site/privacy-settings") return { PrivacySettingsDialog: "Settings" };
      if (name === "@/components/site/privacy-saved-notice") return { PrivacySavedNotice: "Notice" };
      throw new Error("Unexpected fixture import");
    },
    crypto: { randomUUID }, AbortController, URL, document: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} },
    window: { location: { pathname: "/" }, localStorage: f.storage,
      navigator: { onLine: false, locks: { request: async (_name: string, _options: unknown, work: () => Promise<unknown>) => work() } },
      setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
    fetch: async (_url: string, options: { body?: string; headers?: Record<string, string> }) => {
      try {
        const value = await f.request(options.body ? JSON.parse(options.body) : undefined, options.headers?.["X-Privacy-Receipt"]);
        return { ok: true, status: 200, json: async () => value };
      } catch (error) {
        if (!(error instanceof coordination.PrivacyRequestError)) throw error;
        return { ok: false, status: error.status, json: async () => ({ code: error.code }) };
      }
    }
  };
  const source = readFileSync("src/features/privacy/privacy-provider.tsx", "utf8");
  vm.runInNewContext(transpileModule(source, { compilerOptions: {
    module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, target: ScriptTarget.ES2022
  } }).outputText, context);
  function render() {
    stateIndex = 0; refIndex = 0; effects.length = 0;
    return context.exports.PrivacyProvider!({ configuration: { analyticsReady: true, counterId: 1,
      document: { version: analyticsConsentVersion } }, children: null }).props.children;
  }
  render();
  const setup = effects.find((effect) => effect.toString().includes("new coordinator_1.PrivacyCoordinator"));
  assert.ok(setup); const cleanup = setup();
  const controller = refs.map((ref) => ref.current).find((value) => value instanceof coordination.PrivacyCoordinator) as coordination.PrivacyCoordinator;
  assert.ok(controller); await controller.synchronize();
  function settings() { render()[1].props.openSettings(); return render()[1].props; }
  function reconcileAnalytics() {
    render();
    const effect = effects.find((effect) => effect.toString().includes("observeAnalyticsRoute"));
    assert.ok(effect); effect();
  }
  await settings().save(true); assert.ok(render()[2]); const original = f.events[0].receiptId;
  reconcileAnalytics();
  assert.equal(grantKeys.at(-1), original, "The provider distinguishes actual server-confirmed grants");
  settings();
  const updatesBeforePause = grantKeys.length;
  context.window.location.pathname = "/catalog";
  reconcileAnalytics();
  assert.equal(observedRoutes.at(-1), "/catalog", "Route changes are observed even while settings pause analytics");
  assert.equal(grantKeys.length, updatesBeforePause);
  console.log("PASS actual provider: confirmed grant identity forwarded; paused routes observed without sending analytics");
  f.getFailure(true); await controller.synchronize(); assert.equal(controller.snapshot.choice!.receiptId, original);
  f.getFailure(false); await settings().save(false); assert.ok(render()[2]);
  assert.ok(withdrawals > 0, "Refusal invokes analytics cleanup through the actual provider");
  assert.equal(f.events.at(-1)!.kind, "revoke"); assert.equal(f.events.at(-1)!.receiptId, original);
  console.log("PASS actual provider: after GET failure, notice follows revoke A, never decline B");
  await settings().save(true); f.wrongAck(); await settings().save(false);
  const beforeRestore = withdrawals; await controller.synchronize();
  assert.ok(withdrawals > beforeRestore, "A restored negative choice clears analytics even without a successful acknowledgement");
  assert.equal(render()[2], null); assert.ok(controller.snapshot.message);
  console.log("PASS actual provider: wrong acknowledgement leaves settings open and saved notice absent");
  states[3] = "banner";
  await render()[1].props.save(false);
  assert.equal(states[3], "banner"); assert.equal(render()[2], null); assert.ok(controller.snapshot.message);
  console.log("PASS actual provider: failed initial refusal exposes the existing banner error slot without a success notice");
  if (typeof cleanup === "function") cleanup();
  console.log("Provider hook model passed; component source executed, React hooks/HTTP journal mocked. No PostgreSQL or visual rendering claim.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
