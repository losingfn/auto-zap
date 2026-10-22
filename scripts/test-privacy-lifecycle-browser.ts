import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { NextRequest } from "next/server";
import { fixture } from "./test-privacy-lifecycle";
import { analyticsConsentVersion } from "../src/features/privacy/consent-content";

async function main() {
  const f = fixture();
  const modules: string[] = [];
  for (const name of ["domain", "coordinator"]) {
    const source = await readFile(`src/features/privacy/${name}.ts`, "utf8");
    const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
    modules.push(`{const module={exports:{}}; (function(require,module,exports){${code}})(name=>modules[name],module,module.exports);modules['./${name}']=module.exports;}`);
  }
  const html = `<html><body>Isolated consent fixture<script>
  const modules={};${modules.join("\n")}
  const {PrivacyCoordinator,PrivacyRequestError,PRIVACY_LOCK}=modules['./coordinator'];
  window.controller=new PrivacyCoordinator({storage:localStorage,now:Date.now,id:()=>crypto.randomUUID(),stop:()=>{},changed:()=>{},
    lock:work=>navigator.locks.request(PRIVACY_LOCK,work),
    request:async(body,id)=>{const r=await fetch('/api/privacy-consent',{method:body?'POST':'GET',credentials:'same-origin',
      ...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:id?{headers:{'X-Privacy-Receipt':id}}:{})}); const value=await r.json();
      if(!r.ok)throw new PrivacyRequestError(r.status,value.code);return value;}
  },${JSON.stringify(analyticsConsentVersion)},true);
  addEventListener('storage',()=>controller.synchronize());
  controller.synchronize().then(()=>window.ready=true);
  </script></body></html>`;
  let base = "";
  const server = createServer(async (request, response) => {
    try {
      if (request.url === "/fixture") { response.setHeader("Content-Type", "text/html"); response.end(html); return; }
      if (!request.url?.startsWith("/api/privacy-consent")) { response.writeHead(404).end(); return; }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const incoming = new NextRequest(base + request.url, {
        method: request.method, headers: request.headers as Record<string, string>,
        ...(request.method === "POST" ? { body: Buffer.concat(chunks) } : {})
      });
      const result = await (request.method === "POST" ? f.handlers.POST(incoming) : f.handlers.GET(incoming));
      response.writeHead(result.status, { "Content-Type": "application/json", "Set-Cookie": result.headers.getSetCookie() });
      response.end(await result.text());
    } catch { if (!response.destroyed) response.writeHead(500).end(); }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing local listener");
  base = `http://127.0.0.1:${address.port}`; process.env.APP_URL = base;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
    const context = await browser.newContext();
    const a = await context.newPage(), b = await context.newPage();
    await Promise.all([a.goto(base + "/fixture"), b.goto(base + "/fixture")]);
    await Promise.all([a.waitForFunction("window.ready"), b.waitForFunction("window.ready")]);
    assert.equal(await a.evaluate("typeof navigator.locks.request"), "function");
    assert.equal(await a.evaluate("controller.save(true)"), true);
    const first = f.events[0].receiptId;
    const proof = (await context.cookies()).find((cookie) => cookie.name.endsWith(first) && cookie.name.startsWith("autozap_privacy_proof_"));
    assert.ok(proof?.httpOnly); assert.equal(proof.sameSite, "Strict");
    await a.evaluate("fetch('/api/privacy-consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'prepare'})})");
    assert.equal(await b.evaluate("controller.save(false)"), true);
    assert.equal(f.state(first).state, "revoked"); assert.equal(await a.evaluate("controller.isAuthorized()"), false);
    console.log("PASS real Chromium tabs: shared HttpOnly credentials survive current-cookie replacement; revoke targets original grant");

    assert.equal(await a.evaluate("controller.save(true)"), true); const second = f.events.at(-1)!.receiptId;
    f.getFailure(true); await a.evaluate("controller.synchronize()");
    assert.equal(await a.evaluate("controller.snapshot.choice.receiptId"), second);
    assert.equal(await a.evaluate("controller.isAuthorized()"), false);
    f.getFailure(false); assert.equal(await a.evaluate("controller.save(false)"), true);
    assert.equal(f.state(second).state, "revoked");
    console.log("PASS real Chromium: GET failure retains identity and later sends original revoke");

    const held = f.holdGrant();
    await a.evaluate("window.pending=controller.save(true); void 0"); await held.entered;
    await b.evaluate("window.pending=controller.save(false); void 0");
    assert.equal(await a.evaluate("controller.isAuthorized()"), false);
    held.release(); assert.equal(await a.evaluate("pending"), false); assert.equal(await b.evaluate("pending"), true);
    console.log("PASS native Web Locks: newer withdrawal wins over delayed grant response");

    const abandoned = f.holdGrant();
    await a.evaluate("window.pending=controller.save(true); void 0"); await abandoned.entered;
    await a.close();
    await b.evaluate("controller.retry(true)");
    abandoned.release();
    const c = await context.newPage(); await c.goto(base + "/fixture"); await c.waitForFunction("window.ready");
    assert.equal(await c.evaluate("controller.isAuthorized()"), false);
    assert.equal(await c.evaluate("controller.hasPending()"), false);
    console.log("PASS closed-tab recovery: lock released, durable grant intent safely withdrawn by another tab, reload stays off");
    await context.close();
  } finally {
    await browser?.close();
    await new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
  }
  console.log("Browser lifecycle passed with real Chromium cookies/storage/Web Locks and a MOCK journal, not PostgreSQL.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
