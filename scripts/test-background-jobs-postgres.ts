import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { assertLocalTestDatabase } from "../src/lib/server/local-db-safety";

const { databaseUrl, databaseName } = assertLocalTestDatabase({
  requiredFlag: "ALLOW_LOCAL_DB_INTEGRATION_TESTS",
  purpose: "Background jobs PostgreSQL integration test"
});
const sql = postgres(databaseUrl, { max: 1 });
const TEST_ADMIN_ID = "00000000-0000-4000-8000-000000000001";

async function main() {
  console.log(`[background-jobs-postgres] test database: ${databaseName}`);
  await rebuildCleanSchema();
  await assertMigrationContracts();
  await assertUpgradeFromPreviousSchema();
  await ensureTestAdmin();

  const repository = await import("../src/features/background-jobs/repository");
  const types = await import("../src/features/background-jobs/types");
  const worker = await import("../src/workers/background-worker");
  const adminImports = await import("../src/features/admin/imports");
  const publish = await import("../src/features/import/publish-service");
  const workerService = await import("../src/features/import/worker-service");

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

  await run("publish reservation rejects cancellation and guarded activation publishes once", async () => {
    const fixture = await createPublishFixture(repository, { reservePublishJob: true });
    await assert.rejects(
      () => adminImports.cancelAdminImportBatch({ importBatchId: fixture.batchId, adminUserId: TEST_ADMIN_ID }),
      (error: unknown) => error instanceof adminImports.AdminImportError && error.code === "already_finalized"
    );
    await publish.activateCatalogVersionInDatabase(fixture.targetVersionId, {
      importBatchId: fixture.batchId,
      publishJob: {
        id: fixture.job!.id,
        workerId: "publish-worker",
        leaseToken: fixture.job!.leaseToken!
      }
    });
    assert.deepEqual(await catalogAndBatchState(fixture), {
      activeCatalogVersionId: fixture.targetVersionId,
      batchStatus: "published",
      targetVersionStatus: "active"
    });
  });

  await run("cancelled draft cannot later activate and cancelled analyze stays cancelled", async () => {
    const fixture = await createPublishFixture(repository);
    await adminImports.cancelAdminImportBatch({ importBatchId: fixture.batchId, adminUserId: TEST_ADMIN_ID });
    await assert.rejects(
      () => publish.activateCatalogVersionInDatabase(fixture.targetVersionId, { importBatchId: fixture.batchId }),
      publish.CatalogActivationGuardError
    );
    await workerService.markImportJobFailure({
      job: { type: "analyze_import", payload: { batchId: fixture.batchId } },
      error: { code: "ANALYSIS_FAILED", message: "safe", retryable: false },
      willRetry: false
    });
    assert.deepEqual(await catalogAndBatchState(fixture), {
      activeCatalogVersionId: fixture.oldVersionId,
      batchStatus: "cancelled",
      targetVersionStatus: "rolled_back"
    });
  });

  await run("double publish request shares one job and blocks a later cancel", async () => {
    const fixture = await createPublishFixture(repository);
    const previousBackground = process.env.BACKGROUND_JOBS_ENABLED;
    const previousImport = process.env.IMPORT_VIA_WORKER_ENABLED;
    process.env.BACKGROUND_JOBS_ENABLED = "true";
    process.env.IMPORT_VIA_WORKER_ENABLED = "true";
    try {
      const [first, second] = await Promise.all([
        adminImports.enqueueAdminImportPublish({ importBatchId: fixture.batchId, adminUserId: TEST_ADMIN_ID }),
        adminImports.enqueueAdminImportPublish({ importBatchId: fixture.batchId, adminUserId: TEST_ADMIN_ID })
      ]);
      assert.equal(first.backgroundJobId, second.backgroundJobId);
      assert.equal(await countImportJobs(fixture.batchId, "publish_import"), 1);
      await assert.rejects(
        () => adminImports.cancelAdminImportBatch({ importBatchId: fixture.batchId, adminUserId: TEST_ADMIN_ID }),
        (error: unknown) => error instanceof adminImports.AdminImportError && error.code === "already_finalized"
      );
    } finally {
      restoreEnvironment("BACKGROUND_JOBS_ENABLED", previousBackground);
      restoreEnvironment("IMPORT_VIA_WORKER_ENABLED", previousImport);
    }
  });

  await run("published catalog retries failed search reconciliation without reopening cancellation", async () => {
    const fixture = await createPublishFixture(repository, { reservePublishJob: true });
    await publish.activateCatalogVersionInDatabase(fixture.targetVersionId, {
      importBatchId: fixture.batchId,
      publishJob: {
        id: fixture.job!.id,
        workerId: "publish-worker",
        leaseToken: fixture.job!.leaseToken!
      }
    });
    const error = { code: "SEARCH_TEMPORARY_ERROR", message: "safe", retryable: false };
    await repository.failBackgroundJob({
      job: fixture.job!,
      workerId: "publish-worker",
      leaseToken: fixture.job!.leaseToken!,
      error
    });
    await workerService.markImportJobFailure({
      job: { type: "publish_import", payload: { batchId: fixture.batchId } },
      error,
      willRetry: false
    });

    const previousBackground = process.env.BACKGROUND_JOBS_ENABLED;
    const previousImport = process.env.IMPORT_VIA_WORKER_ENABLED;
    process.env.BACKGROUND_JOBS_ENABLED = "true";
    process.env.IMPORT_VIA_WORKER_ENABLED = "true";
    try {
      const retried = await adminImports.enqueueAdminImportPublish({
        importBatchId: fixture.batchId,
        adminUserId: TEST_ADMIN_ID
      });
      assert.equal(retried.created, true);
      assert.equal(retried.backgroundJobId, fixture.job!.id);
      assert.equal((await jobRow(fixture.job!.id)).status, "pending");
      assert.deepEqual(await catalogAndBatchState(fixture), {
        activeCatalogVersionId: fixture.targetVersionId,
        batchStatus: "published",
        targetVersionStatus: "active"
      });
      await assert.rejects(
        () => adminImports.cancelAdminImportBatch({ importBatchId: fixture.batchId, adminUserId: TEST_ADMIN_ID }),
        (failure: unknown) => failure instanceof adminImports.AdminImportError && failure.code === "already_finalized"
      );
    } finally {
      restoreEnvironment("BACKGROUND_JOBS_ENABLED", previousBackground);
      restoreEnvironment("IMPORT_VIA_WORKER_ENABLED", previousImport);
    }
  });

  await run("audit failure after a committed cancellation stays best-effort", async () => {
    const fixture = await createPublishFixture(repository);
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION test_import_audit_failure() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'test audit failure';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_import_audit_failure
      BEFORE INSERT ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION test_import_audit_failure();
    `);
    try {
      await adminImports.cancelAdminImportBatch({ importBatchId: fixture.batchId, adminUserId: TEST_ADMIN_ID });
      assert.equal((await importBatchRow(fixture.batchId)).status, "cancelled");
    } finally {
      await sql.unsafe("DROP TRIGGER IF EXISTS test_import_audit_failure ON audit_logs; DROP FUNCTION IF EXISTS test_import_audit_failure();");
    }
  });

  await run("rejected worker upload removes its newly stored orphan file", async () => {
    await clearImportFixtures();
    const uploadDir = path.join(process.cwd(), "data", "imports", "uploads");
    await mkdir(uploadDir, { recursive: true });
    const file = new File([Buffer.from("duplicate worker upload")], "duplicate.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const fileHash = createHash("sha256").update(Buffer.from("duplicate worker upload")).digest("hex");
    const [version] = await sql<{ id: string }[]>`
      INSERT INTO catalog_versions (status, source_file_name)
      VALUES ('draft', 'duplicate.xlsx')
      RETURNING id
    `;
    await sql`
      INSERT INTO import_batches (catalog_version_id, status, source_file_name, file_hash, report)
      VALUES (${version.id}, 'analyzed', 'duplicate.xlsx', ${fileHash}, ${JSON.stringify(publishableReport())}::jsonb)
    `;
    const before = new Set(await readdir(uploadDir));
    const previousBackground = process.env.BACKGROUND_JOBS_ENABLED;
    const previousImport = process.env.IMPORT_VIA_WORKER_ENABLED;
    process.env.BACKGROUND_JOBS_ENABLED = "true";
    process.env.IMPORT_VIA_WORKER_ENABLED = "true";
    try {
      await assert.rejects(
        () => adminImports.enqueueAdminImportFromUpload({ file, adminUserId: TEST_ADMIN_ID }),
        (error: unknown) => error instanceof adminImports.AdminImportError && error.code === "import_in_progress"
      );
      assert.deepEqual(new Set(await readdir(uploadDir)), before);
    } finally {
      restoreEnvironment("BACKGROUND_JOBS_ENABLED", previousBackground);
      restoreEnvironment("IMPORT_VIA_WORKER_ENABLED", previousImport);
    }
  });

  await run("worker import mode fails closed when background processing is disabled", async () => {
    await clearImportFixtures();
    const previousBackground = process.env.BACKGROUND_JOBS_ENABLED;
    const previousImport = process.env.IMPORT_VIA_WORKER_ENABLED;
    process.env.BACKGROUND_JOBS_ENABLED = "false";
    process.env.IMPORT_VIA_WORKER_ENABLED = "true";
    try {
      await assert.rejects(
        () => adminImports.enqueueAdminImportFromUpload({ file: null, adminUserId: TEST_ADMIN_ID }),
        (error: unknown) => error instanceof adminImports.AdminImportError && error.code === "worker_unavailable"
      );
      assert.equal(await countJobs(), 0);
    } finally {
      restoreEnvironment("BACKGROUND_JOBS_ENABLED", previousBackground);
      restoreEnvironment("IMPORT_VIA_WORKER_ENABLED", previousImport);
    }
  });
}

async function rebuildCleanSchema() {
  console.log("[background-jobs-postgres] applying migrations to clean test schema");
  await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await applyMigrations();
}

async function assertUpgradeFromPreviousSchema() {
  console.log("[background-jobs-postgres] applying 0011 over the previous schema");
  await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const migrationDir = path.join(process.cwd(), "db", "migrations");
  const files = (await readdir(migrationDir))
    .filter((file) => file.endsWith(".sql") && file < "0011_import_worker.sql")
    .sort();
  for (const file of files) await applyMigration(file);
  await applyMigration("0011_import_worker.sql");
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
  const importColumns = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'import_batches'
  `;
  const importColumnNames = new Set(importColumns.map((row) => row.column_name));
  for (const column of ["analyze_job_id", "publish_job_id", "publish_checkpoint", "last_error_code"]) {
    assert.ok(importColumnNames.has(column));
  }
}

async function ensureTestAdmin() {
  await sql`
    INSERT INTO admin_users (id, email, full_name, password_hash, role, is_active)
    VALUES (${TEST_ADMIN_ID}, 'integration-admin@example.test', 'Integration Admin', 'not-used', 'owner', true)
    ON CONFLICT (id) DO NOTHING
  `;
}

type PublishFixture = {
  oldVersionId: string;
  targetVersionId: string;
  batchId: string;
  job: Awaited<ReturnType<typeof import("../src/features/background-jobs/repository").claimNextBackgroundJob>>;
};

async function createPublishFixture(
  repository: typeof import("../src/features/background-jobs/repository"),
  options: { reservePublishJob?: boolean } = {}
): Promise<PublishFixture> {
  await clearImportFixtures();
  const [oldVersion] = await sql<{ id: string }[]>`
    INSERT INTO catalog_versions (status, source_file_name, published_at)
    VALUES ('active', 'old.xlsx', now())
    RETURNING id
  `;
  const [targetVersion] = await sql<{ id: string }[]>`
    INSERT INTO catalog_versions (status, source_file_name)
    VALUES ('draft', 'new.xlsx')
    RETURNING id
  `;
  const [batch] = await sql<{ id: string }[]>`
    INSERT INTO import_batches (catalog_version_id, status, source_file_name, report, phase)
    VALUES (${targetVersion.id}, 'analyzed', 'new.xlsx', ${JSON.stringify(publishableReport())}::jsonb, 'analyzed')
    RETURNING id
  `;

  if (!options.reservePublishJob) {
    return {
      oldVersionId: oldVersion.id,
      targetVersionId: targetVersion.id,
      batchId: batch.id,
      job: null
    };
  }

  const created = await repository.createBackgroundJob({
    type: "publish_import",
    payload: { batchId: batch.id },
    idempotencyKey: `test-publish:${batch.id}`
  });
  await sql`
    UPDATE import_batches
    SET publish_job_id = ${created.id}, phase = 'publish_queued', stage = 'Публикация поставлена в очередь'
    WHERE id = ${batch.id}
  `;
  const job = await repository.claimNextBackgroundJob({ workerId: "publish-worker" });
  assert.equal(job?.id, created.id);

  return {
    oldVersionId: oldVersion.id,
    targetVersionId: targetVersion.id,
    batchId: batch.id,
    job
  };
}

function publishableReport() {
  return {
    addedCount: 0,
    updatedCount: 0,
    archivedCount: 0,
    errorRows: 0,
    reviewRows: 0,
    safety: { canPublish: true }
  };
}

async function catalogAndBatchState(fixture: PublishFixture) {
  const [active] = await sql<{ id: string }[]>`
    SELECT id FROM catalog_versions WHERE status = 'active' ORDER BY published_at DESC NULLS LAST LIMIT 1
  `;
  const [batch] = await sql<{ status: string }[]>`SELECT status FROM import_batches WHERE id = ${fixture.batchId}`;
  const [target] = await sql<{ status: string }[]>`SELECT status FROM catalog_versions WHERE id = ${fixture.targetVersionId}`;
  return {
    activeCatalogVersionId: active?.id ?? null,
    batchStatus: batch?.status ?? null,
    targetVersionStatus: target?.status ?? null
  };
}

async function importBatchRow(id: string) {
  const [row] = await sql<{ status: string }[]>`SELECT status FROM import_batches WHERE id = ${id}`;
  assert.ok(row, `Missing import batch ${id}`);
  return row;
}

async function countImportJobs(batchId: string, type: string) {
  const [row] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM background_jobs
    WHERE type = ${type} AND payload ->> 'batchId' = ${batchId}
  `;
  return Number(row.count);
}

async function clearImportFixtures() {
  await sql.unsafe("TRUNCATE TABLE import_batches, background_jobs, catalog_versions CASCADE;");
}

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function clearJobs() {
  await sql.unsafe("TRUNCATE TABLE import_batches, background_jobs CASCADE;");
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
