/** Real, disposable PostgreSQL 16 integration. Never consumes an inherited DATABASE_URL. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import postgres from "postgres";
import { NextRequest } from "next/server";
import { chromium } from "playwright-core";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { createPrivacyReceipt, proofCookieName } from "../src/features/privacy/receipt";
import { PRIVACY_COOKIE, PRIVACY_STORAGE_KEY, type ConsentEventKind } from "../src/features/privacy/domain";
import { analyticsConsentVersion } from "../src/features/privacy/consent-content";

const migrationHash = "8a1fd62db9e2f042dcd305cb0a0cf02c01e2f5ee0337b0aee2445373b497e6d1";
const database = "privacy_integration_test", owner = "privacy_test_owner", role = "privacy_test_app";
const nonce = randomUUID(), container = `autozap-privacy-test-${nonce}`;
const docker = (...args: string[]) => execFileSync("docker", ["--context", "desktop-linux", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
type Row = { id: string; receipt_hash: string; operation_id: string; kind: string; document_version: string | null; expires_at: Date | null; occurred_at: Date };
type Reply = { status: number; value: Record<string, unknown> };
const results: { test: string; passed: boolean }[] = [];
const evidence: Record<string, unknown> = { database, role, productionAccess: false };
async function check(test: string, work: () => Promise<void>) {
  try { await work(); results.push({ test, passed: true }); console.log(`PASS ${test}`); }
  catch (error) { results.push({ test, passed: false }); throw new Error(`${test}: ${error instanceof Error ? error.message : "failed"}`); }
}
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  // Explicit local context and pinned, already-installed image; no remote Docker daemon or image pull.
  assert.equal(JSON.parse(docker("context", "inspect", "desktop-linux"))[0].Endpoints.docker.Host,
    `unix://${process.env.HOME}/.docker/run/docker.sock`);
  const image = JSON.parse(docker("image", "inspect", "postgres:16-alpine"))[0].Id as string;
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  const migration = await readFile("db/migrations/0012_privacy_consent.sql", "utf8");
  assert.equal(createHash("sha256").update(migration).digest("hex"), migrationHash);
  const temporary = await mkdtemp(join(tmpdir(), "privacy-postgres-"));
  const password = randomBytes(24).toString("hex"), appPassword = randomBytes(24).toString("hex");
  const clients: postgres.Sql[] = [];
  let created = false, databaseUnavailable = false;
  let admin!: postgres.Sql, app!: postgres.Sql, control!: postgres.Sql;
  try {
    const envFile = join(temporary, "container.env");
    await writeFile(envFile, `POSTGRES_USER=${owner}\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${database}\n`, { mode: 0o600 });
    docker("run", "--detach", "--pull=never", "--name", container, "--label", `codex.privacy-integration=${nonce}`,
      "--env-file", envFile, "--publish", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,size=256m", image);
    created = true;
    await rm(envFile);
    const inspection = JSON.parse(docker("inspect", container))[0];
    assert.equal(inspection.Config.Labels["codex.privacy-integration"], nonce);
    assert.equal(inspection.Image, image); assert.equal(inspection.State.Running, true);
    assert.equal(inspection.HostConfig.NetworkMode, "bridge");
    assert.ok(inspection.Mounts.every((mount: { Type: string }) => mount.Type === "tmpfs"));
    assert.ok(inspection.HostConfig.Tmpfs["/var/lib/postgresql/data"]);
    const bindings = inspection.NetworkSettings.Ports["5432/tcp"];
    assert.equal(bindings.length, 1); assert.equal(bindings[0].HostIp, "127.0.0.1");
    const port = Number(bindings[0].HostPort); assert.ok(port > 1024 && port < 65536);
    const url = (username: string, secret: string, dbName = database) => `postgresql://${username}:${secret}@127.0.0.1:${port}/${dbName}`;
    admin = postgres(url(owner, password), { max: 2, connect_timeout: 2, onnotice: () => {} }); clients.push(admin);
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        if (docker("exec", container, "pg_isready", "-U", owner, "-d", database).includes("accepting connections")) { ready = true; break; }
      } catch { /* A newly started server is still initializing. */ }
      await delay(500);
    }
    assert.equal(ready, true);
    const [identity] = await admin`SELECT current_database() AS db, current_user AS role, current_setting('server_version') AS version`;
    assert.equal(identity.db, database); assert.equal(identity.role, owner); assert.match(identity.version, /^16\./);
    const [empty] = await admin`SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'`;
    assert.equal(empty.count, 0);
    // A separate control session in this same new container is needed to disable the test database.
    control = postgres(url(owner, password, "postgres"), { max: 1, connect_timeout: 2 }); clients.push(control);
    assert.equal((await control`SELECT current_database() AS db`)[0].db, "postgres");
    Object.assign(evidence, { version: identity.version, address: `127.0.0.1:${port}`, image,
      isolation: "new labeled local container, loopback binding, tmpfs only, empty database verified before DDL" });
    console.log(`ISOLATED PostgreSQL ${identity.version}; 127.0.0.1:${port}; database=${database}; initially empty`);

    // The first DDL is reached only after all container, endpoint, identity and emptiness assertions above.
    await admin.begin(async (tx) => { await tx.unsafe(migration); });
    await admin.unsafe(`CREATE ROLE ${role} LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    await admin.unsafe(`REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT, INSERT ON public.privacy_consent_events TO ${role}`);
    app = postgres(url(role, appPassword), { max: 2, connect_timeout: 2 }); clients.push(app);
    const [appIdentity] = await app`SELECT current_database() AS db, current_user AS role, current_schemas(false) AS schemas,
      to_regclass('privacy_consent_events')::oid = to_regclass('public.privacy_consent_events')::oid AS resolves_public`;
    assert.equal(appIdentity.db, database); assert.equal(appIdentity.role, role); assert.equal(appIdentity.resolves_public, true);
    evidence.searchPath = appIdentity.schemas;
    const schema = async () => ({
      constraints: await admin`SELECT conname, contype, pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conrelid='public.privacy_consent_events'::regclass ORDER BY conname`,
      indexes: await admin`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='privacy_consent_events' ORDER BY indexname`,
      columns: await admin`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_schema='public' AND table_name='privacy_consent_events' ORDER BY ordinal_position`
    });
    const initialSchema = JSON.stringify(await schema());
    const definitions = JSON.parse(initialSchema);
    assert.equal(definitions.constraints.length, 6); assert.equal(definitions.indexes.length, 4);
    assert.equal(definitions.constraints.filter((c: { contype: string }) => c.contype === "c").length, 3);
    assert.match(definitions.indexes.find((i: { indexname: string }) => i.indexname.endsWith("expiry_idx")).indexdef, /WHERE \(expires_at IS NOT NULL\)/);
    evidence.migration = { sha256: migrationHash, constraints: 6, indexes: 4, unchanged: true };

    // Set an explicit disposable URL BEFORE importing the real repository/route. No .env loader is used.
    Object.assign(process.env, { DATABASE_URL: url(role, appPassword), NODE_ENV: "test",
      APP_URL: "http://127.0.0.1:19001", PRIVACY_CONSENT_SECRET: randomBytes(32).toString("hex"),
      YANDEX_METRIKA_COUNTER_ID: "1", YANDEX_METRIKA_CONFIGURATION_VERIFIED: "true" });
    const handlers = await import("../src/app/api/privacy-consent/route");
    const repository = await import("../src/features/privacy/repository");
    const rows = (id?: string) => id
      ? app<Row[]>`SELECT * FROM public.privacy_consent_events WHERE receipt_hash=${id} ORDER BY occurred_at,kind`
      : app<Row[]>`SELECT * FROM public.privacy_consent_events ORDER BY id`;
    async function outage(unavailable: boolean) {
      await control.unsafe(`ALTER DATABASE ${database} ALLOW_CONNECTIONS ${unavailable ? "false" : "true"}`);
      databaseUnavailable = unavailable;
      if (unavailable) await control`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname=${database} AND usename=${role} AND pid<>pg_backend_pid()`;
    }
    function jar() {
      const cookies = new Map<string, string>();
      async function call(body?: unknown, selected?: string): Promise<Reply> {
        const request = new NextRequest(process.env.APP_URL + "/api/privacy-consent", {
          method: body ? "POST" : "GET", headers: body ? { Origin: process.env.APP_URL!, "Content-Type": "application/json" }
            : selected ? { "X-Privacy-Receipt": selected } : {}, ...(body ? { body: JSON.stringify(body) } : {})
        });
        for (const [name, value] of cookies) request.cookies.set(name, value);
        const response = await (body ? handlers.POST(request) : handlers.GET(request));
        for (const cookie of response.cookies.getAll()) {
          if (cookie.maxAge === 0) cookies.delete(cookie.name); else cookies.set(cookie.name, cookie.value);
        }
        const text = await response.text();
        // No signed credential may appear in JSON, even in error responses.
        for (const value of cookies.values()) assert.equal(text.includes(value), false);
        return { status: response.status, value: JSON.parse(text) };
      }
      const prepare = async () => {
        const reply = await call({ action: "prepare" }); assert.equal(reply.status, 200);
        assert.match(String(reply.value.receiptId), /^[a-f0-9]{64}$/);
        return { receiptId: reply.value.receiptId as string, expiresAt: reply.value.expiresAt as number };
      };
      const event = (action: ConsentEventKind, receiptId: string, operationId: string = randomUUID()) => call({ action, receiptId, operationId,
        documentVersion: action === "grant" ? analyticsConsentVersion : null });
      return { cookies, call, prepare, event };
    }
    async function acknowledged(reply: Reply, id: string, operation: string, kind: string, state: string) {
      assert.equal(reply.status, 200, `API status ${reply.status}, code=${reply.value.code ?? ""}`);
      assert.equal(reply.value.receiptId, id); assert.equal(reply.value.operationId, operation);
      assert.equal(reply.value.eventKind, kind); assert.equal(reply.value.state, state);
      const stored = await rows(id);
      assert.ok(stored.some((row) => row.kind === kind && row.operation_id === operation), "ACK must match a real stored operation");
      return stored;
    }
    async function afterRecovery(work: () => Promise<Reply>) {
      let reply = await work();
      for (let attempt = 0; reply.status === 503 && attempt < 5; attempt++) {
        await delay(300 * (attempt + 1)); reply = await work();
      }
      return reply;
    }
    let a!: ReturnType<typeof jar>, grantId = "", grantOperation = "";
    await check("1 grant: real row, hash, UUID, document and expiry", async () => {
      a = jar(); const receipt = await a.prepare(); grantId = receipt.receiptId; grantOperation = randomUUID();
      const reply = await a.event("grant", grantId, grantOperation);
      if (reply.status !== 200) {
        // Surface only the innermost diagnostic, never a Drizzle query/parameters or connection URL.
        try { await repository.registerConsentEvent({ ...receipt, operationId: grantOperation, kind: "grant", documentVersion: analyticsConsentVersion, receiptExpiresAt: receipt.expiresAt }); }
        catch (error) {
          let cause = error as Error; while (cause.cause instanceof Error) cause = cause.cause;
          console.error("Repository diagnostic:", cause.name, cause.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]"));
        }
      }
      const stored = await acknowledged(reply, grantId, grantOperation, "grant", "granted"); assert.equal(stored.length, 1);
      assert.equal(stored[0].document_version, analyticsConsentVersion);
      assert.ok(stored[0].expires_at instanceof Date); assert.ok(stored[0].occurred_at instanceof Date);
      assert.ok(stored[0].expires_at!.getTime() <= receipt.expiresAt);
      assert.equal(reply.value.expiresAt, stored[0].expires_at!.getTime());
      assert.equal(createHash("sha256").update(a.cookies.get(proofCookieName(grantId))!).digest("hex"), stored[0].receipt_hash);
    });
    await check("2 initial decline: only decline", async () => {
      const j = jar(), receipt = await j.prepare(), operation = randomUUID();
      const stored = await acknowledged(await j.event("decline", receipt.receiptId, operation), receipt.receiptId, operation, "decline", "declined");
      assert.equal(stored.length, 1); assert.equal(stored[0].document_version, null);
    });
    let revokeOperation = "";
    await check("3 revoke A preserves grant A; no decline B", async () => {
      const before = JSON.stringify((await rows(grantId))[0]); revokeOperation = randomUUID();
      const stored = await acknowledged(await a.event("revoke", grantId, revokeOperation), grantId, revokeOperation, "revoke", "revoked");
      assert.equal(stored.length, 2); assert.equal(JSON.stringify(stored.find((r) => r.kind === "grant")), before);
      assert.equal(stored.some((r) => r.kind === "decline"), false);
    });
    await check("4 same-operation retries are idempotent", async () => {
      const before = JSON.stringify(await rows());
      await acknowledged(await a.event("revoke", grantId, revokeOperation), grantId, revokeOperation, "revoke", "revoked");
      await acknowledged(await a.event("grant", grantId, grantOperation), grantId, grantOperation, "grant", "revoked");
      assert.equal(JSON.stringify(await rows()), before);
    });
    await check("5 incompatible and cross-receipt operation UUID conflicts", async () => {
      const j = jar(), receipt = await j.prepare(), operation = randomUUID();
      await acknowledged(await j.event("grant", receipt.receiptId, operation), receipt.receiptId, operation, "grant", "granted");
      const before = JSON.stringify(await rows());
      for (const reply of [await j.event("revoke", receipt.receiptId, operation), await a.event("decline", grantId, operation)]) {
        assert.equal(reply.status, 409); assert.equal(reply.value.code, "operation_conflict");
      }
      const fresh = await j.prepare();
      const duplicate = await j.event("grant", fresh.receiptId, operation);
      assert.equal(duplicate.status, 409); assert.equal(duplicate.value.code, "operation_conflict");
      // A new operation UUID must never be acknowledged against a row belonging to another UUID.
      const sameKind = await j.event("grant", receipt.receiptId, randomUUID());
      assert.equal(sameKind.status, 409); assert.equal(sameKind.value.code, "operation_conflict");
      assert.equal(JSON.stringify(await rows()), before);
    });
    await check("6 proof B cannot withdraw A", async () => {
      const j = jar(); await j.prepare(); const before = JSON.stringify(await rows());
      assert.equal((await j.event("revoke", grantId)).status, 409); assert.equal(JSON.stringify(await rows()), before);
    });
    await check("7 bad signature, modified identifier, expired signed proof", async () => {
      const before = JSON.stringify(await rows()); const j = jar(); const receipt = createPrivacyReceipt();
      j.cookies.set(PRIVACY_COOKIE, receipt.value.slice(0, -1) + (receipt.value.endsWith("A") ? "B" : "A"));
      assert.equal((await j.event("revoke", receipt.receiptId)).status, 409);
      j.cookies.set(PRIVACY_COOKIE, receipt.value);
      assert.equal((await j.event("revoke", "0".repeat(64))).status, 409);
      const expired = createPrivacyReceipt(Date.now() - 2 * 366 * 86400000); j.cookies.set(PRIVACY_COOKIE, expired.value);
      const reply = await j.event("revoke", expired.receiptId); assert.equal(reply.status, 409); assert.equal(reply.value.code, "receipt_expired");
      assert.equal(JSON.stringify(await rows()), before);
    });
    await check("8 regrant uses a new receipt; old receipt stays revoked", async () => {
      const before = JSON.stringify(await rows(grantId)), receipt = await a.prepare(), operation = randomUUID();
      assert.notEqual(receipt.receiptId, grantId);
      await acknowledged(await a.event("grant", receipt.receiptId, operation), receipt.receiptId, operation, "grant", "granted");
      assert.equal(JSON.stringify(await rows(grantId)), before);
      assert.equal((await a.call(undefined, grantId)).value.state, "revoked");
    });
    await check("9 concurrent duplicate, UUID conflict, withdrawal race and retry", async () => {
      const j = jar(), receipt = await j.prepare(), operation = randomUUID();
      const replies = await Promise.all(Array.from({ length: 6 }, () => j.event("grant", receipt.receiptId, operation)));
      assert.ok(replies.some((r) => r.status === 200)); assert.ok(replies.every((r) => [200, 503].includes(r.status)));
      await acknowledged(await j.event("grant", receipt.receiptId, operation), receipt.receiptId, operation, "grant", "granted");
      assert.equal((await rows(receipt.receiptId)).length, 1);
      const left = jar(), right = jar(), l = await left.prepare(), r = await right.prepare(), shared = randomUUID();
      const conflicts = await Promise.all([left.event("grant", l.receiptId, shared), right.event("grant", r.receiptId, shared)]);
      assert.deepEqual(conflicts.map((reply) => reply.status).sort(), [200, 409]);
      assert.equal((await app`SELECT count(*)::int AS n FROM public.privacy_consent_events WHERE operation_id=${shared}`)[0].n, 1);
      const racing = jar(), target = await racing.prepare(), grant = randomUUID(), revoke = randomUUID();
      const race = await Promise.all([racing.event("grant", target.receiptId, grant), racing.event("revoke", target.receiptId, revoke)]);
      assert.ok(race.every((reply) => [200, 409].includes(reply.status)));
      await acknowledged(await racing.event("revoke", target.receiptId, revoke), target.receiptId, revoke, "revoke", "revoked");
      assert.equal((await repository.getRegisteredConsent(target.receiptId)).state, "revoked");
      const duplicates = await app`SELECT receipt_hash,kind FROM public.privacy_consent_events GROUP BY receipt_hash,kind HAVING count(*)>1`;
      assert.equal(duplicates.length, 0);
      evidence.concurrency = { duplicateRequestStatuses: replies.map((r) => r.status), sharedUuidStatuses: conflicts.map((r) => r.status), withdrawalRaceStatuses: race.map((r) => r.status) };
    });
    await check("10 real PostgreSQL CHECK and UNIQUE constraints", async () => {
      const existing = (await rows(grantId))[0], before = JSON.stringify(await rows());
      const bad = [
        { hash: randomBytes(32).toString("hex"), op: randomUUID(), kind: "invalid", doc: null, expiry: null, code: "23514" },
        { hash: "bad-hash", op: randomUUID(), kind: "decline", doc: null, expiry: null, code: "23514" },
        { hash: randomBytes(32).toString("hex"), op: existing.operation_id, kind: "decline", doc: null, expiry: null, code: "23505" },
        { hash: grantId, op: randomUUID(), kind: existing.kind, doc: analyticsConsentVersion, expiry: new Date(), code: "23505" },
        { hash: randomBytes(32).toString("hex"), op: randomUUID(), kind: "grant", doc: null, expiry: new Date(), code: "23514" },
        { hash: randomBytes(32).toString("hex"), op: randomUUID(), kind: "grant", doc: analyticsConsentVersion, expiry: null, code: "23514" }
      ];
      for (const value of bad) {
        await assert.rejects(app`INSERT INTO public.privacy_consent_events(receipt_hash,operation_id,kind,document_version,expires_at)
          VALUES(${value.hash},${value.op},${value.kind},${value.doc},${value.expiry})`, (error: unknown) => (error as { code?: string }).code === value.code);
        assert.equal(JSON.stringify(await rows()), before);
      }
    });
    // Faults affect only this verified disposable container/database. Nothing is mocked in the API or repository.
    await check("11 real database outage: 503, no saved success, durable retry", async () => {
      const j = jar(), receipt = await j.prepare(), operation = randomUUID();
      await acknowledged(await j.event("grant", receipt.receiptId, operation), receipt.receiptId, operation, "grant", "granted");
      const before = JSON.stringify(await rows(receipt.receiptId));
      const retry = randomUUID(); await outage(true);
      try {
        const status = await j.call(undefined, receipt.receiptId); assert.equal(status.status, 503); assert.equal(status.value.code, "unavailable");
        const failed = await j.event("revoke", receipt.receiptId, retry); assert.equal(failed.status, 503);
        assert.equal(failed.value.state, undefined); assert.equal(failed.value.operationId, undefined);
      } finally { await outage(false); }
      assert.equal(JSON.stringify(await rows(receipt.receiptId)), before);
      await acknowledged(await afterRecovery(() => j.event("revoke", receipt.receiptId, retry)), receipt.receiptId, retry, "revoke", "revoked");
      evidence.databaseOutage = "test database connections temporarily disabled and app sessions terminated; GET/POST 503; no write; same UUID retry committed";
    });
    await check("12 SELECT/INSERT only; UPDATE DELETE TRUNCATE DROP denied", async () => {
      const [privileges] = await app`SELECT has_table_privilege(current_user,'public.privacy_consent_events','SELECT') AS select,
        has_table_privilege(current_user,'public.privacy_consent_events','INSERT') AS insert,
        has_table_privilege(current_user,'public.privacy_consent_events','UPDATE') AS update,
        has_table_privilege(current_user,'public.privacy_consent_events','DELETE') AS delete,
        has_table_privilege(current_user,'public.privacy_consent_events','TRUNCATE') AS truncate,
        has_schema_privilege(current_user,'public','CREATE') AS schema_create`;
      assert.deepEqual({ ...privileges }, { select: true, insert: true, update: false, delete: false, truncate: false, schema_create: false });
      const before = JSON.stringify(await rows());
      for (const query of ["UPDATE public.privacy_consent_events SET kind=kind", "DELETE FROM public.privacy_consent_events", "TRUNCATE public.privacy_consent_events", "DROP TABLE public.privacy_consent_events"]) {
        await assert.rejects(app.unsafe(query), (error: unknown) => (error as { code?: string }).code === "42501");
      }
      assert.equal(JSON.stringify(await rows()), before);
      assert.doesNotMatch(await readFile("src/features/privacy/repository.ts", "utf8"), /\.(update|delete)\s*\(|\b(UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP)\s+(TABLE|FROM|public\.)/);
      evidence.privileges = privileges;
    });

    // Real Chromium fixture uses the unchanged coordinator and real Next route, not a mock journal or request interceptor.
    const modules: string[] = [];
    for (const name of ["domain", "coordinator"]) {
      const source = await readFile(`src/features/privacy/${name}.ts`, "utf8");
      const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
      modules.push(`{const module={exports:{}};(function(require,module,exports){${code}})(name=>modules[name],module,module.exports);modules['./${name}']=module.exports;}`);
    }
    const html = `<html><body>Local PostgreSQL integration fixture<script>
      const modules={};${modules.join("\n")}
      const {PrivacyCoordinator,PrivacyRequestError,PRIVACY_LOCK}=modules['./coordinator'];
      window.controller=new PrivacyCoordinator({storage:localStorage,now:Date.now,id:()=>crypto.randomUUID(),stop:()=>{},changed:()=>{},
        lock:work=>navigator.locks.request(PRIVACY_LOCK,work),request:async(body,id)=>{
          const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),7000);
          try {
          const r=await fetch('/api/privacy-consent',{method:body?'POST':'GET',credentials:'same-origin',
            signal:abort.signal,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:id?{headers:{'X-Privacy-Receipt':id}}:{})});
          const value=await r.json();if(!r.ok)throw new PrivacyRequestError(r.status,value.code);return value;
          } finally {clearTimeout(timer);}
        }},${JSON.stringify(analyticsConsentVersion)},true);
      addEventListener('storage',()=>controller.synchronize());controller.synchronize().then(()=>window.ready=true);
      </script></body></html>`;
    let base = "";
    const server = createServer(async (request, response) => {
      try {
        if (request.url === "/fixture") { response.setHeader("Content-Type", "text/html"); response.end(html); return; }
        if (request.url !== "/api/privacy-consent") { response.writeHead(404).end(); return; }
        const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const incoming = new NextRequest(base + request.url, { method: request.method, headers: request.headers as Record<string, string>,
          ...(request.method === "POST" ? { body: Buffer.concat(chunks) } : {}) });
        const result = await (request.method === "POST" ? handlers.POST(incoming) : handlers.GET(incoming));
        if (!result.ok) console.log(`Browser API ${request.method}: ${result.status} ${String((await result.clone().json()).code ?? "")}`);
        response.writeHead(result.status, { "Content-Type": "application/json", "Set-Cookie": result.headers.getSetCookie() }); response.end(await result.text());
      } catch { if (!response.destroyed) response.writeHead(500).end(); }
    });
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      const address = server.address(); assert.ok(address && typeof address !== "string");
      base = `http://127.0.0.1:${address.port}`; process.env.APP_URL = base;
      browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
      evidence.browser = { version: browser.version(), scope: "real coordinator + actual Next route + real repository + PostgreSQL; fixture page, not full Next UI" };
      const context = await browser.newContext();
      await context.route("**/*", (route) => route.request().url().startsWith(base + "/") ? route.continue() : route.abort());
      const tab = await context.newPage(); await tab.goto(base + "/fixture"); await tab.waitForFunction("window.ready");
      await check("13 Chromium: actual GET outage retains A; failed withdrawal stays pending; retry revokes A", async () => {
        assert.equal(await tab.evaluate("controller.save(true)"), true, "initial browser grant");
        const id = await tab.evaluate<string>(`JSON.parse(localStorage.getItem('${PRIVACY_STORAGE_KEY}')).receiptId`);
        const before = JSON.stringify(await rows(id)); assert.equal((await rows(id))[0].kind, "grant");
        await outage(true);
        try {
          await tab.evaluate("controller.synchronize()");
          assert.equal(await tab.evaluate("controller.snapshot.choice.receiptId"), id);
          assert.equal(await tab.evaluate("controller.isAuthorized()"), false);
          assert.equal(await tab.evaluate("controller.save(false)"), false); // Provider must not show a success notice.
          assert.equal(await tab.evaluate("controller.hasPending()"), true);
          assert.ok(await tab.evaluate("controller.snapshot.message"));
          const duringOutage = await admin<Row[]>`SELECT * FROM public.privacy_consent_events WHERE receipt_hash=${id} ORDER BY occurred_at,kind`;
          assert.equal(JSON.stringify(duringOutage), before);
        } finally { await outage(false); }
        let saved = false;
        for (let attempt = 0; !saved && attempt < 6; attempt++) {
          saved = await tab.evaluate<boolean>("controller.save(false)");
          if (!saved) await delay(300 * (attempt + 1));
        }
        assert.equal(saved, true, "browser withdrawal retry after database recovery");
        const stored = await rows(id); assert.deepEqual(stored.map((row) => row.kind).sort(), ["grant", "revoke"]);
        assert.equal(await tab.evaluate("controller.hasPending()"), false); assert.equal(await tab.evaluate("controller.isAuthorized()"), false);
      });
      await check("14 real Chromium tabs: prepare B preserves proof A, actual revoke A, reload stays off", async () => {
        // Drain any connection recovery left by the deliberately interrupted requests.
        let healthy = false;
        for (let attempt = 0; !healthy && attempt < 6; attempt++) {
          const health = await Promise.allSettled([repository.getRegisteredConsent(grantId), repository.getRegisteredConsent(grantId)]);
          healthy = health.every((result) => result.status === "fulfilled");
          if (!healthy) await delay(500);
        }
        assert.equal(healthy, true, "repository recovered both pool slots");
        const other = await context.newPage(); await other.goto(base + "/fixture"); await other.waitForFunction("window.ready");
        assert.equal(await tab.evaluate("controller.save(true)"), true, "new grant after outage recovery");
        const id = await tab.evaluate<string>(`JSON.parse(localStorage.getItem('${PRIVACY_STORAGE_KEY}')).receiptId`);
        const savedGrant = JSON.stringify((await rows(id))[0]);
        const proof = (await context.cookies()).find((cookie) => cookie.name === proofCookieName(id));
        assert.equal(proof?.httpOnly, true); assert.equal(proof?.sameSite, "Strict");
        assert.equal(await other.evaluate("typeof navigator.locks.request"), "function");
        const prepared = await other.evaluate("fetch('/api/privacy-consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'prepare'})}).then(r=>r.json())") as { receiptId: string };
        assert.notEqual(prepared.receiptId, id);
        let withdrawn = false;
        for (let attempt = 0; !withdrawn && attempt < 6; attempt++) {
          withdrawn = await other.evaluate<boolean>("controller.save(false)");
          assert.equal(await other.evaluate("controller.isAuthorized()"), false, "withdrawal must immediately disable authorization");
          if (!withdrawn) await delay(300 * (attempt + 1));
        }
        assert.equal(withdrawn, true, "other tab withdrawal and bounded retries");
        const stored = await rows(id); assert.deepEqual(stored.map((row) => row.kind).sort(), ["grant", "revoke"]);
        assert.equal(JSON.stringify(stored.find((row) => row.kind === "grant")), savedGrant);
        assert.equal((await rows(prepared.receiptId)).length, 0);
        await tab.evaluate("controller.synchronize()"); assert.equal(await tab.evaluate("controller.isAuthorized()"), false, "original tab remains off");
        await other.reload(); await other.waitForFunction("window.ready"); assert.equal(await other.evaluate("controller.isAuthorized()"), false, "reload remains off");
        assert.equal(await other.evaluate("controller.hasPending()"), false, "acknowledged withdrawal must not be recreated by another tab");
        const beforeRepeatedOff = JSON.stringify(await rows(id));
        assert.equal(await other.evaluate("controller.save(false)"), true, "saving already-revoked settings must remain usable");
        assert.equal(JSON.stringify(await rows(id)), beforeRepeatedOff);
        const storage = await other.evaluate("JSON.stringify(Object.fromEntries(Object.entries(localStorage)))");
        assert.equal(/v1\.[\w-]{43}\./.test(storage as string), false);
        assert.equal((await other.evaluate("document.cookie") as string).includes("autozap_privacy"), false);
        await other.close();
      });
      await context.close();
    } finally {
      await browser?.close();
      await new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
    }
    assert.equal(JSON.stringify(await schema()), initialSchema, "Application must not mutate the schema");
    evidence.eventCounts = await app`SELECT kind,count(*)::int AS count FROM public.privacy_consent_events GROUP BY kind ORDER BY kind`;
    evidence.schemaUnchanged = true;
    evidence.migrationUnchanged = createHash("sha256").update(await readFile("db/migrations/0012_privacy_consent.sql")).digest("hex") === migrationHash;
  } finally {
    if (databaseUnavailable) await control.unsafe(`ALTER DATABASE ${database} ALLOW_CONNECTIONS true`);
    await Promise.allSettled(clients.map((client) => client.end({ timeout: 1 })));
    if (created) { docker("rm", "--force", container); evidence.containerRemoved = true; }
    await rm(temporary, { recursive: true, force: true });
    await writeFile("artifacts/privacy-postgres-integration.json", JSON.stringify({ timestamp: new Date().toISOString(), evidence, results }, null, 2) + "\n");
  }
}
main().then(() => { console.log("All 14 real PostgreSQL integration scenarios passed; disposable container removed."); process.exit(0); })
  .catch((error: unknown) => { console.error("Integration failed:", error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]") : "unknown error"); process.exit(1); });
