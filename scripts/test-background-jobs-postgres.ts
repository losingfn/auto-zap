import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { assertLocalTestDatabase } from "../src/lib/server/local-db-safety";

const { databaseUrl, databaseName } = assertLocalTestDatabase({
  requiredFlag: "ALLOW_LOCAL_DB_INTEGRATION_TESTS",
  purpose: "Background jobs PostgreSQL integration test"
});
const sql = postgres(databaseUrl, { max: 1 });

async function main() {
  console.log(`[background-jobs-postgres] test database: ${databaseName}`);
  await rebuildCleanSchema();
  await assertMigrationContracts();
  await assertUpgradeFromPreviousSchema();

  const repository = await import("../src/features/background-jobs/repository");
  const types = await import("../src/features/background-jobs/types");
  const worker = await import("../src/workers/background-worker");

  await run("atomic claim gives one job to exactly one concurrent worker", async () => {
    await clearJobs();
    const created = await repository.createBackgroundJob({ type: "health_check", idempotencyKey: "claim-one" });
    const [first, second] = await Promise.all([
      repository.claimNextBackgroundJob({ workerId: "worker-a" }),
      repository.claimNextBackgroundJob({ workerId: "worker-b" })
    ]);
    const claimed = [first, second].filter(Boolean);
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0]?.id, created.id);
    assert.equal(claimed[0]?.attemptCount, 1);
    assert.ok(claimed[0]?.leaseToken);
  });

  await run("available-at ordering and parallel workers claim distinct jobs", async () => {
    await clearJobs();
    const now = Date.now();
    const early = await repository.createBackgroundJob({
      type: "health_check",
      idempotencyKey: "ordered-early",
      availableAt: new Date(now - 2_000)
    });
    const late = await repository.createBackgroundJob({
      type: "health_check",
      idempotencyKey: "ordered-late",
      availableAt: new Date(now - 1_000)
    });
    const first = await repository.claimNextBackgroundJob({ workerId: "worker-order-a" });
    const second = await repository.claimNextBackgroundJob({ workerId: "worker-order-b" });
    assert.equal(first?.id, early.id);
    assert.equal(second?.id, late.id);
  });

  await run("idempotency accepts identical payloads and rejects payload conflicts", async () => {
    await clearJobs();
    const first = await repository.createBackgroundJob({
      type: "health_check",
      payload: { testOnly: true },
      idempotencyKey: "same-payload"
    });
    const repeat = await repository.createBackgroundJob({
      type: "health_check",
      payload: { testOnly: true },
      idempotencyKey: "same-payload"
    });
    assert.equal(repeat.id, first.id);
    await assert.rejects(
      () => repository.createBackgroundJob({ type: "health_check", payload: {}, idempotencyKey: "same-payload" }),
      (error: unknown) => error instanceof types.BackgroundJobIdempotencyConflictError
    );
  });

  await run("idempotency race preserves one row and reports conflicting payload", async () => {
    await clearJobs();
    const [first, second] = await Promise.all([
      repository.createBackgroundJob({ type: "health_check", payload: { testOnly: true }, idempotencyKey: "race-same" }),
      repository.createBackgroundJob({ type: "health_check", payload: { testOnly: true }, idempotencyKey: "race-same" })
    ]);
    assert.equal(first.id, second.id);
    const conflictResults = await Promise.allSettled([
      repository.createBackgroundJob({ type: "health_check", payload: {}, idempotencyKey: "race-conflict" }),
      repository.createBackgroundJob({ type: "health_check", payload: { testOnly: true }, idempotencyKey: "race-conflict" })
    ]);
    assert.equal(conflictResults.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(
      conflictResults.filter(
        (result) => result.status === "rejected" && result.reason instanceof types.BackgroundJobIdempotencyConflictError
      ).length,
      1
    );
  });

  await run("idempotency scope is type plus key and terminal repeats keep their job", async () => {
    await clearJobs();
    const health = await repository.createBackgroundJob({ type: "health_check", idempotencyKey: "shared-key" });
    const claimed = await repository.claimNextBackgroundJob({ workerId: "worker-terminal" });
    assert.equal(claimed?.id, health.id);
    await repository.completeBackgroundJob({
      jobId: claimed!.id,
      workerId: "worker-terminal",
      leaseToken: claimed!.leaseToken!,
      result: { kind: "health_check" }
    });
    await sql`
      INSERT INTO background_jobs (type, payload, payload_hash, idempotency_key)
      VALUES ('test_only_other_type', '{}'::jsonb, ${"0".repeat(64)}, 'shared-key')
    `;
    assert.equal(await countJobs(), 2);
    const repeated = await repository.createBackgroundJob({ type: "health_check", idempotencyKey: "shared-key" });
    assert.equal(repeated.id, health.id);
  });

  await run("invalid payload is rejected before insert", async () => {
    await clearJobs();
    await assert.rejects(
      () => repository.createBackgroundJob({ type: "health_check", payload: { testOnly: "yes" } as never, idempotencyKey: "invalid" }),
      (error: unknown) => error instanceof types.BackgroundJobExecutionError && error.code === "invalid_payload"
    );
    await assert.rejects(
      () => repository.createBackgroundJob({ type: "unknown_type" as never, idempotencyKey: "unknown" }),
      (error: unknown) => error instanceof types.BackgroundJobExecutionError && error.code === "unknown_job_type"
    );
    assert.equal(await countJobs(), 0);
  });

  await run("lease ownership requires both worker id and lease token", async () => {
    await clearJobs();
    await repository.createBackgroundJob({ type: "health_check", idempotencyKey: "ownership" });
    const job = await repository.claimNextBackgroundJob({ workerId: "owner" });
    assert.ok(job?.leaseToken);
    await assert.rejects(
      () => repository.heartbeatBackgroundJob({ jobId: job!.id, workerId: "other", leaseToken: job!.leaseToken! }),
      types.BackgroundJobOwnershipLostError
    );
    await assert.rejects(
      () => repository.updateBackgroundJobProgress({ jobId: job!.id, workerId: "owner", leaseToken: crypto.randomUUID(), progress: 10 }),
      types.BackgroundJobLeaseLostError
    );
    await repository.updateBackgroundJobProgress({ jobId: job!.id, workerId: "owner", leaseToken: job!.leaseToken!, progress: 10 });
    await repository.completeBackgroundJob({
      jobId: job!.id,
      workerId: "owner",
      leaseToken: job!.leaseToken!,
      result: { kind: "health_check" }
    });
  });

  await run("stale recovery clears fencing and respects max attempts", async () => {
    await clearJobs();
    const base = new Date();
    const retryable = await repository.createBackgroundJob({
      type: "health_check",
      idempotencyKey: "stale-retry",
      maxAttempts: 2,
      availableAt: base
    });
    const running = await repository.claimNextBackgroundJob({ workerId: "stale-worker", now: base });
    assert.equal(running?.id, retryable.id);
    await repository.recoverStaleBackgroundJobs({ leaseMs: 1, now: new Date(base.getTime() + 60_000) });
    const recovered = await jobRow(retryable.id);
    assert.equal(recovered.status, "retry_wait");
    assert.equal(recovered.lease_token, null);
    assert.equal(recovered.locked_by, null);

    await clearJobs();
    const permanent = await repository.createBackgroundJob({
      type: "health_check",
      idempotencyKey: "stale-failed",
      maxAttempts: 1,
      availableAt: base
    });
    await repository.claimNextBackgroundJob({ workerId: "stale-worker", now: base });
    await repository.recoverStaleBackgroundJobs({ leaseMs: 1, now: new Date(base.getTime() + 60_000) });
    assert.equal((await jobRow(permanent.id)).status, "failed");
  });

  await run("fencing blocks an old worker after stale recovery and reclaim", async () => {
    await clearJobs();
    const base = new Date();
    await repository.createBackgroundJob({ type: "health_check", idempotencyKey: "fencing", availableAt: base });
    const workerA = await repository.claimNextBackgroundJob({ workerId: "worker-a", now: base });
    await repository.recoverStaleBackgroundJobs({ leaseMs: 1, now: new Date(base.getTime() + 60_000) });
    const workerB = await repository.claimNextBackgroundJob({ workerId: "worker-b", now: new Date(base.getTime() + 61_000) });
    assert.notEqual(workerA?.leaseToken, workerB?.leaseToken);
    await assert.rejects(
      () => repository.completeBackgroundJob({
        jobId: workerA!.id,
        workerId: "worker-a",
        leaseToken: workerA!.leaseToken!,
        result: { old: true }
      }),
      types.BackgroundJobLeaseLostError
    );
    await repository.completeBackgroundJob({
      jobId: workerB!.id,
      workerId: "worker-b",
      leaseToken: workerB!.leaseToken!,
      result: { current: true }
    });
  });

  await run("retry policy and terminal transitions are enforced by PostgreSQL mutations", async () => {
    await clearJobs();
    const base = new Date();
    await repository.createBackgroundJob({ type: "health_check", idempotencyKey: "retry", maxAttempts: 2, availableAt: base });
    const first = await repository.claimNextBackgroundJob({ workerId: "retry-worker", now: base });
    const retry = await repository.failBackgroundJob({
      job: first!,
      workerId: "retry-worker",
      leaseToken: first!.leaseToken!,
      error: { code: "transient", message: "safe", retryable: true },
      now: base
    });
    assert.equal(retry.job.status, "retry_wait");
    assert.equal(retry.retryDelayMs, 1000);
    const second = await repository.claimNextBackgroundJob({ workerId: "retry-worker", now: new Date(base.getTime() + 1_000) });
    const failed = await repository.failBackgroundJob({
      job: second!,
      workerId: "retry-worker",
      leaseToken: second!.leaseToken!,
      error: { code: "transient", message: "safe", retryable: true },
      now: new Date(base.getTime() + 1_000)
    });
    assert.equal(failed.job.status, "failed");
    assert.equal(await repository.claimNextBackgroundJob({ workerId: "retry-worker", now: new Date(base.getTime() + 2_000) }), null);
    const manual = await repository.retryFailedHealthCheckJob(failed.job.id);
    assert.equal(manual.status, "pending");
  });

  await run("worker smoke processes a health-check job", async () => {
    await clearJobs();
    process.env.BACKGROUND_JOBS_ENABLED = "1";
    const job = await repository.createBackgroundJob({ type: "health_check", idempotencyKey: "worker-smoke" });
    await worker.runBackgroundWorker({
      workerId: "worker-smoke",
      pollIntervalMs: 10,
      heartbeatIntervalMs: 100,
      leaseMs: 1_000,
      gracefulShutdownMs: 100,
      maxProcessedJobs: 1
    });
    assert.equal((await jobRow(job.id)).status, "succeeded");
  });

  await run("abortable graceful shutdown requeues only while the lease is still owned", async () => {
    await clearJobs();
    const created = await repository.createBackgroundJob({
      type: "health_check",
      payload: { testOnly: true, delayMs: 500 },
      idempotencyKey: "graceful-shutdown"
    });
    const job = await repository.claimNextBackgroundJob({ workerId: "worker-shutdown" });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20);
    try {
      await worker.runClaimedBackgroundJob({
        job: job!,
        workerId: "worker-shutdown",
        signal: controller.signal,
        heartbeatIntervalMs: 100,
        gracefulShutdownMs: 100
      });
    } finally {
      clearTimeout(timer);
    }
    const row = await jobRow(created.id);
    assert.equal(row.status, "retry_wait");
    assert.equal(row.lease_token, null);
    assert.equal(row.locked_by, null);
  });

  await run("lease loss does not terminate the worker loop and a following job completes", async () => {
    await clearJobs();
    process.env.BACKGROUND_JOBS_ENABLED = "1";
    const first = await repository.createBackgroundJob({
      type: "health_check",
      payload: { testOnly: true, delayMs: 300 },
      idempotencyKey: "worker-lease-loss-first"
    });
    const second = await repository.createBackgroundJob({
      type: "health_check",
      payload: { testOnly: true },
      idempotencyKey: "worker-lease-loss-second",
      availableAt: new Date(Date.now() + 60 * 60 * 1000)
    });
    const workerPromise = worker.runBackgroundWorker({
      workerId: "worker-a",
      pollIntervalMs: 10,
      heartbeatIntervalMs: 1000,
      leaseMs: 50,
      gracefulShutdownMs: 100,
      maxProcessedJobs: 2
    });
    await waitFor(async () => (await jobRow(first.id)).status === "running");
    await delay(70);
    await repository.recoverStaleBackgroundJobs({ leaseMs: 50 });
    const workerB = await repository.claimNextBackgroundJob({ workerId: "worker-b" });
    assert.equal(workerB?.id, first.id);
    await repository.completeBackgroundJob({
      jobId: workerB!.id,
      workerId: "worker-b",
      leaseToken: workerB!.leaseToken!,
      result: { recovered: true }
    });
    await sql`UPDATE background_jobs SET available_at = now() WHERE id = ${second.id}`;
    await withTimeout(workerPromise, 3_000);
    assert.equal((await jobRow(second.id)).status, "succeeded");
  });
}

async function rebuildCleanSchema() {
  console.log("[background-jobs-postgres] applying migrations to clean test schema");
  await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await applyMigrations();
}

async function assertUpgradeFromPreviousSchema() {
  console.log("[background-jobs-postgres] applying 0009 over previous test schema");
  await sql.unsafe("DROP TABLE background_jobs; DROP TYPE background_job_status;");
  await applyMigration("0009_background_jobs.sql");
  await assertMigrationContracts();
}

async function applyMigrations() {
  const migrationDir = path.join(process.cwd(), "db", "migrations");
  const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) await applyMigration(file);
}

async function applyMigration(file: string) {
  const migrationSql = await readFile(path.join(process.cwd(), "db", "migrations", file), "utf8");
  await sql.unsafe(migrationSql);
}

async function assertMigrationContracts() {
  const [relation] = await sql<{ exists: boolean }[]>`
    SELECT to_regclass('public.background_jobs') IS NOT NULL AS "exists"
  `;
  assert.equal(relation.exists, true);
  const [enumRow] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'background_job_status') AS "exists"
  `;
  assert.equal(enumRow.exists, true);
  const names = await sql<{ conname: string }[]>`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'background_jobs'::regclass
    ORDER BY conname
  `;
  const constraintNames = new Set(names.map((row) => row.conname));
  assert.ok(constraintNames.has("background_jobs_idempotency_key_check"));
  assert.ok(constraintNames.has("background_jobs_state_lease_check"));
  assert.ok(constraintNames.has("background_jobs_succeeded_progress_check"));
  const indexes = await sql<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE tablename = 'background_jobs'
  `;
  assert.ok(indexes.some((row) => row.indexname === "background_jobs_claim_idx"));
  assert.ok(indexes.some((row) => row.indexname === "background_jobs_type_idempotency_key_unique"));
}

async function clearJobs() {
  await sql.unsafe("TRUNCATE TABLE background_jobs;");
}

async function countJobs() {
  const [row] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM background_jobs`;
  return Number(row.count);
}

async function jobRow(id: string) {
  const [row] = await sql<{
    status: string;
    locked_by: string | null;
    lease_token: string | null;
  }[]>`SELECT status, locked_by, lease_token FROM background_jobs WHERE id = ${id}`;
  assert.ok(row, `Missing job ${id}`);
  return row;
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(10);
  }
  throw new Error("Timed out waiting for integration test condition.");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Integration worker timed out.")), timeoutMs))
  ]);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function run(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`ok - ${name}`);
}

main()
  .catch((error) => {
    console.error("[background-jobs-postgres] failed", {
      error: error instanceof Error ? error.message : "unknown",
      code: getSafeErrorCode(error),
      cause: getSafeCauseMessage(error)
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });

function getSafeErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "unknown";
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error && error.cause && typeof error.cause === "object" && "code" in error.cause && typeof error.cause.code === "string") {
    return error.cause.code;
  }
  return "integration_test_failed";
}

function getSafeCauseMessage(error: unknown) {
  if (!error || typeof error !== "object" || !("cause" in error) || !(error.cause instanceof Error)) return null;
  return error.cause.message;
}
