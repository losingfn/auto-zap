import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  DISPUTED_GAZ_PRODUCT_SLUGS,
  isRestrictedPublicProduct,
  publicProductExclusionCondition
} from "../src/features/catalog/public-product-exclusions";

// New, disposable PostgreSQL only: no host ports, network, host mounts or inherited URL.
const nonce = randomUUID();
const container = `autozap-gaz-test-${nonce.slice(0, 12)}`;
const docker = (...args: string[]) => execFileSync("docker", ["--context", "desktop-linux", ...args],
  { encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] }).trim();
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const fixtures = [
  { name: "Каретка Газ-2705", rawName: "Каретка", slug: "item-1" },
  { name: "Новая деталь", rawName: "GAZelle NEXT", slug: "item-2" },
  { name: "Фара", rawName: "Фара", slug: "new-sobol-next" },
  { name: "Деталь НАЗ", rawName: "Деталь НАЗ", slug: "item-3" },
  { name: "Бампер GАZ3302", rawName: "Бампер", slug: "item-4" },
  { name: "Фара Газели", rawName: "Фара", slug: "item-5" },
  { name: "Фара G-PART", rawName: "Фара", slug: "item-6" },
  { name: "Шланг 3302 мм", rawName: "Шланг", slug: "retained-1" },
  { name: "Трос газа УАЗ", rawName: "Трос", slug: "retained-2" },
  { name: "Фара Kia Rio", rawName: "Фара", slug: "retained-3" },
  { name: "Газонокосилка", rawName: "Газонокосилка", slug: "retained-4" },
  ...DISPUTED_GAZ_PRODUCT_SLUGS.map(slug => ({ name: "Переименованная деталь", rawName: "Деталь", slug }))
];
const predicate = new PgDialect().sqlToQuery(publicProductExclusionCondition());
const tuple = (row: typeof fixtures[number]) => `(${literal(row.name)},${literal(row.rawName)},${literal(row.slug)})`;
async function main() {
let created = false;
try {
  docker("run", "--detach", "--pull=never", "--name", container, "--network", "none",
    "--label", `codex.gaz-exclusion-test=${nonce}`, "--tmpfs", "/var/lib/postgresql/data:rw,size=192m",
    "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16-alpine");
  created = true;
  const info = JSON.parse(docker("inspect", container))[0];
  assert.equal(info.HostConfig.NetworkMode, "none");
  assert.equal(info.Config.Labels["codex.gaz-exclusion-test"], nonce);
  assert.ok(info.Mounts.every((mount: { Type: string }) => mount.Type === "tmpfs"));
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { docker("exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  assert.ok(ready, "Disposable PostgreSQL did not start");
  const sqlText = `
    CREATE TEMP TABLE products (name text, raw_name text, slug text);
    INSERT INTO products VALUES ${fixtures.map(tuple).join(",")};
    PREPARE available(${predicate.params.map(() => "text").join(",")}) AS
      SELECT coalesce(json_agg(slug ORDER BY slug),'[]'::json) FROM products WHERE ${predicate.sql};
    EXECUTE available(${(predicate.params as string[]).map(literal).join(",")});
    INSERT INTO products VALUES ('Новый товар','Кран ГАЗ','future-import');
    EXECUTE available(${(predicate.params as string[]).map(literal).join(",")});
  `;
  const result = execFileSync("docker", ["--context", "desktop-linux", "exec", "-i", container,
    "psql", "-h", "127.0.0.1", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
    { input: sqlText, encoding: "utf8", timeout: 30000 }).trim().split("\n").map(line => JSON.parse(line));
  const expected = fixtures.filter(row => !isRestrictedPublicProduct(row)).map(row => row.slug).sort();
  assert.deepEqual(result, [expected, expected]);
  assert.equal(expected.length, 3);
  assert.ok(!result[0].includes("retained-3"), "Kia Rio is now explicitly restricted");
  console.log(`PostgreSQL 16: ${fixtures.length} fixtures, all 21 complained routes, retained items and future imported row verified; no network/host data used.`);
} finally {
  if (created) docker("rm", "--force", container);
}

}
main().catch(error => { console.error(error); process.exitCode = 1; });
