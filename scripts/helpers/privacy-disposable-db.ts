import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

const docker = (...args: string[]) => execFileSync("docker", ["--context", "desktop-linux", ...args],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Never reads DATABASE_URL or .env; never uses a host volume or pulls an image. */
export async function privacyDisposableDb() {
  const nonce = randomUUID(), container = `autozap-legal-test-${nonce}`;
  const database = "privacy_legal_disposable", owner = "privacy_legal_owner";
  assert.equal(JSON.parse(docker("context", "inspect", "desktop-linux"))[0].Endpoints.docker.Host,
    `unix://${process.env.HOME}/.docker/run/docker.sock`);
  const image = JSON.parse(docker("image", "inspect", "postgres:16-alpine"))[0].Id;
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  const temporary = await mkdtemp(join(tmpdir(), "privacy-legal-db-"));
  const password = randomBytes(32).toString("hex");
  let created = false;
  let connection: postgres.Sql | undefined;
  const cleanup = async () => {
    await connection?.end({ timeout: 2 });
    if (created) { docker("rm", "--force", container); created = false; }
    await rm(temporary, { recursive: true, force: true });
  };
  try {
    const envFile = join(temporary, "container.env");
    await writeFile(envFile, `POSTGRES_USER=${owner}\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${database}\n`, { mode: 0o600 });
    docker("run", "--detach", "--pull=never", "--name", container, "--label", `codex.legal-test=${nonce}`,
      "--env-file", envFile, "--publish", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,size=512m", image);
    created = true; await rm(envFile);
    const inspection = JSON.parse(docker("inspect", container))[0];
    assert.equal(inspection.Config.Labels["codex.legal-test"], nonce); assert.equal(inspection.Image, image);
    assert.equal(inspection.HostConfig.NetworkMode, "bridge");
    assert.ok(inspection.Mounts.every((mount: { Type: string }) => mount.Type === "tmpfs"));
    assert.ok(inspection.HostConfig.Tmpfs["/var/lib/postgresql/data"]);
    const bindings = inspection.NetworkSettings.Ports["5432/tcp"];
    assert.equal(bindings.length, 1); assert.equal(bindings[0].HostIp, "127.0.0.1");
    const port = Number(bindings[0].HostPort); assert.ok(port > 1024 && port < 65536);
    const url = new URL(`postgresql://127.0.0.1:${port}/${database}`); url.username = owner; url.password = password;
    // Existing migrations include explicit BEGIN/COMMIT; reserve a single connection.
    connection = postgres(url.href, { max: 1, connect_timeout: 2, onnotice: () => {} });
    for (let i = 0; i < 40; i++) {
      try { docker("exec", container, "pg_isready", "-U", owner, "-d", database); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    const [identity] = await connection`SELECT current_database() AS db,current_user AS role,current_setting('server_version') AS version`;
    assert.equal(identity.db, database); assert.equal(identity.role, owner); assert.match(identity.version, /^16\./);
    const [empty] = await connection`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'`;
    assert.equal(empty.n, 0); // All destructive test DDL below is AFTER this isolation check.
    for (const file of (await readdir("db/migrations")).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort()) {
      await connection.unsafe(await readFile(join("db/migrations", file), "utf8"));
    }
    return { connection, url: url.href, database, password, cleanup,
      isolation: { version: identity.version, localOnly: true, tmpfsOnly: true, emptyBeforeSetup: true, image } };
  } catch (error) { await cleanup(); throw error; }
}
