/** Disposable local environment for testing the actual production Next.js UI. */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { catalogCategories } from "../../src/config/categories";
import { catalogTaxonomy } from "../../src/config/catalog-taxonomy";

const docker = (...args: string[]) => execFileSync("docker", ["--context", "desktop-linux", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve())); return address.port;
}
export async function privacyNextEnvironment(output: string, reuseBuild = false, options: { existingBuild?: boolean; counterId?: number } = {}) {
  const nonce = randomUUID(), container = `autozap-privacy-ui-${nonce}`;
  const database = "privacy_ui_integration_test", owner = "privacy_ui_owner", role = "privacy_ui_app";
  assert.equal(JSON.parse(docker("context", "inspect", "desktop-linux"))[0].Endpoints.docker.Host, `unix://${process.env.HOME}/.docker/run/docker.sock`);
  const image = JSON.parse(docker("image", "inspect", "postgres:16-alpine"))[0].Id;
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  const temporary = await mkdtemp(join(tmpdir(), "privacy-next-ui-"));
  const password = randomBytes(24).toString("hex"), appPassword = randomBytes(24).toString("hex"), secret = randomBytes(32).toString("hex");
  const secrets = [password, appPassword, secret];
  const sanitize = (value: string) => secrets.reduce((text, item) => text.replaceAll(item, "[redacted]"), value).replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[connection redacted]");
  const clients: postgres.Sql[] = [];
  let created = false, unavailable = false, server: ChildProcess | undefined, admin!: postgres.Sql, control!: postgres.Sql;
  let runtimeLog = "";
  async function cleanup() {
    if (unavailable) await control.unsafe(`ALTER DATABASE ${database} ALLOW_CONNECTIONS true`);
    if (server && server.exitCode === null) {
      const exited = new Promise<void>((resolve) => server!.once("exit", () => resolve()));
      server.kill("SIGTERM"); await Promise.race([exited, delay(5000)]);
      if (server.exitCode === null) { server.kill("SIGKILL"); await exited; }
    }
    await Promise.allSettled(clients.map((client) => client.end({ timeout: 1 })));
    if (created) { docker("rm", "--force", container); created = false; }
    await rm(temporary, { recursive: true, force: true });
    await writeFile(join(output, "server.log"), sanitize(runtimeLog));
  }
  try {
    const envFile = join(temporary, "container.env");
    await writeFile(envFile, `POSTGRES_USER=${owner}\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${database}\n`, { mode: 0o600 });
    docker("run", "--detach", "--pull=never", "--name", container, "--label", `codex.privacy-ui=${nonce}`,
      "--env-file", envFile, "--publish", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,size=512m", image);
    created = true; await rm(envFile);
    const inspection = JSON.parse(docker("inspect", container))[0];
    assert.equal(inspection.Config.Labels["codex.privacy-ui"], nonce); assert.equal(inspection.Image, image);
    assert.equal(inspection.HostConfig.NetworkMode, "bridge");
    assert.ok(inspection.Mounts.every((mount: { Type: string }) => mount.Type === "tmpfs"));
    assert.ok(inspection.HostConfig.Tmpfs["/var/lib/postgresql/data"]);
    const bindings = inspection.NetworkSettings.Ports["5432/tcp"];
    assert.equal(bindings.length, 1); assert.equal(bindings[0].HostIp, "127.0.0.1");
    const dbPort = Number(bindings[0].HostPort); assert.ok(dbPort > 1024 && dbPort < 65536);
    for (let attempt = 0; attempt < 40; attempt++) {
      try { docker("exec", container, "pg_isready", "-U", owner, "-d", database); break; } catch { await delay(300); }
    }
    const url = (user: string, pass: string, dbName = database) => {
      const value = new URL(`postgresql://127.0.0.1:${dbPort}/${dbName}`); value.username = user; value.password = pass; return value.href;
    };
    admin = postgres(url(owner, password), { max: 1, connect_timeout: 2, onnotice: () => {} }); clients.push(admin);
    control = postgres(url(owner, password, "postgres"), { max: 1, connect_timeout: 2, onnotice: () => {} }); clients.push(control);
    const [identity] = await admin`SELECT current_database() AS db,current_user AS role,current_setting('server_version') AS version`;
    assert.equal(identity.db, database); assert.equal(identity.role, owner); assert.match(identity.version, /^16\./);
    const [empty] = await admin`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'`;
    assert.equal(empty.n, 0); // No DDL/data before isolation and emptiness have been proved.
    const migrations: { file: string; sha256: string }[] = [];
    for (const file of (await readdir("db/migrations")).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
      const source = await readFile(join("db/migrations", file), "utf8"), sha256 = createHash("sha256").update(source).digest("hex");
      if (file === "0012_privacy_consent.sql") assert.equal(sha256, "8a1fd62db9e2f042dcd305cb0a0cf02c01e2f5ee0337b0aee2445373b497e6d1");
      await admin.unsafe(source); migrations.push({ file, sha256 });
    }
    // Synthetic catalog fixtures live only in this new container. No imported or working product data.
    const categoryIds = new Map<string, string>();
    for (const category of catalogCategories) {
      const [row] = await admin`INSERT INTO categories(slug,name,sort_order,is_all_assortment) VALUES(${category.slug},${category.name},${category.sortOrder},${"isAllAssortment" in category}) RETURNING id`;
      categoryIds.set(category.slug, row.id);
    }
    const target = catalogTaxonomy.find((category) => category.slug === "podveska")!;
    const [subcategorySlug, subcategoryName] = target.subcategories[0];
    const [subcategory] = await admin`INSERT INTO subcategories(category_id,slug,name) VALUES(${categoryIds.get("podveska")!},${subcategorySlug},${subcategoryName}) RETURNING id`;
    const [version] = await admin`INSERT INTO catalog_versions(status,notes,published_at) VALUES('active','Disposable UI test fixture',CURRENT_TIMESTAMP) RETURNING id`;
    const [productIdentity] = await admin`INSERT INTO product_identities DEFAULT VALUES RETURNING id`;
    const productName = "Тестовая стойка стабилизатора UI", productSlug = "testovaya-stoyka-ui";
    await admin`INSERT INTO products(catalog_version_id,product_identity_id,shop_code,raw_name,name,slug,price,category_id,subcategory_id,search_text)
      VALUES(${version.id},${productIdentity.id},'UI-TEST-001',${productName},${productName},${productSlug},1234.50,${categoryIds.get("podveska")!},${subcategory.id},${productName.toLowerCase()})`;
    await admin.unsafe(`CREATE ROLE ${role} LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO ${role};
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}; GRANT INSERT ON public.privacy_consent_events TO ${role}`);
    const app = postgres(url(role, appPassword), { max: 2, connect_timeout: 2 }); clients.push(app);
    const port = await availablePort(), base = `http://127.0.0.1:${port}`;
    const environment = { ...process.env, NODE_ENV: "production" as const, HOSTNAME: "127.0.0.1", PORT: String(port), APP_URL: base,
      DATABASE_URL: url(role, appPassword), PRIVACY_CONSENT_SECRET: secret, SESSION_SECRET: randomBytes(32).toString("hex"),
      MEILI_HOST: "http://127.0.0.1:1", MEILI_MASTER_KEY: randomBytes(24).toString("hex"), MEILI_SEARCH_KEY: "",
      YANDEX_MAPS_API_KEY: "", YANDEX_METRIKA_COUNTER_ID: String(options.counterId ?? 1), YANDEX_METRIKA_CONFIGURATION_VERIFIED: "true",
      BACKGROUND_JOBS_ENABLED: "false", IMPORT_WORKER_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1" };
    secrets.push(environment.SESSION_SECRET, environment.MEILI_MASTER_KEY);
    // Same synthetic configuration for prerendered legal pages and dynamic pages. SDK is isolated in the browser test.
    let buildCode: number | null = 0;
    if (options.existingBuild) {
      assert.ok((await readFile(".next/BUILD_ID", "utf8")).trim());
      assert.ok((await readFile(".next/standalone/server.js", "utf8")).length);
      console.log("Using existing standalone build; runtime environment is disposable and synthetic");
    } else if (reuseBuild) {
      const previous = JSON.parse(await readFile("artifacts/privacy-next-production/report.json", "utf8"));
      assert.equal(previous.evidence.buildExitCode, 0); assert.ok(previous.results.every((result: { passed: boolean }) => result.passed));
      assert.ok((await readFile(".next/BUILD_ID", "utf8")).trim());
      console.log("Using the previously verified production build for a focused ACK check; no rebuild");
    } else {
      let buildLog = "";
      const build = spawn("pnpm", ["build"], { env: environment, stdio: ["ignore", "pipe", "pipe"] });
      for (const stream of [build.stdout, build.stderr]) stream!.on("data", (chunk: Buffer) => { buildLog += chunk.toString(); });
      buildCode = await new Promise<number | null>((resolve, reject) => { build.once("error", reject); build.once("exit", resolve); });
      await writeFile(join(output, "build.log"), sanitize(buildLog)); assert.equal(buildCode, 0, "production build must complete, see sanitized build.log");
      console.log("PASS actual pnpm build and standalone preparation, unchanged fonts");
    }
    const runningServer = spawn(process.execPath, [".next/standalone/server.js"], { env: environment, stdio: ["ignore", "pipe", "pipe"] });
    server = runningServer;
    for (const stream of [runningServer.stdout, runningServer.stderr]) stream!.on("data", (chunk: Buffer) => { runtimeLog += chunk.toString(); });
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (runningServer.exitCode !== null) throw new Error("Local standalone server exited");
      try { const response = await fetch(base + "/api/privacy-consent"); if (response.ok) { ready = true; break; } } catch { /* Startup. */ }
      await delay(250);
    }
    assert.equal(ready, true);
    return { base, admin, app, secret, database, role, cleanup, sanitize,
      evidence: { version: identity.version, address: `127.0.0.1:${dbPort}`, database, role, base, image, migrations, emptyBeforeSetup: true, loopbackOnly: true, noHostVolumes: true, buildExitCode: buildCode, buildReused: reuseBuild },
      productName, productPath: `/catalog/podveska/${subcategorySlug}/${productSlug}`, subcategoryPath: `/catalog/podveska/${subcategorySlug}`,
      async outage(value: boolean) {
        await control.unsafe(`ALTER DATABASE ${database} ALLOW_CONNECTIONS ${value ? "false" : "true"}`); unavailable = value;
        if (value) await control`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${database} AND usename=${role} AND pid<>pg_backend_pid()`;
      },
      async lockJournal() {
        const locker = postgres(url(owner, password), { max: 1, connect_timeout: 2 }); clients.push(locker);
        await locker.unsafe("BEGIN; LOCK TABLE public.privacy_consent_events IN ACCESS EXCLUSIVE MODE");
        return async () => { await locker.unsafe("ROLLBACK"); await locker.end(); };
      }
    };
  } catch (error) { await cleanup(); throw error; }
}
