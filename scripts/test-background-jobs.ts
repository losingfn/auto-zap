import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { executeBackgroundJob, validateBackgroundJobPayload } from "../src/features/background-jobs/handlers";
import { canonicalizeBackgroundJobPayload, hashBackgroundJobPayload } from "../src/features/background-jobs/payload";
import { assertLocalTestDatabase } from "../src/lib/server/local-db-safety";
import {
  BACKGROUND_JOB_ALLOWED_TRANSITIONS,
  assertBackgroundJobTransition,
  canTransitionBackgroundJob,
  getBackgroundJobRetryAt,
  getBackgroundJobRetryDelayMs,
  isBackgroundJobLeaseStale
} from "../src/features/background-jobs/state";
import { BackgroundJobExecutionError, type BackgroundJob } from "../src/features/background-jobs/types";

const repositorySource = readFileSync("src/features/background-jobs/repository.ts", "utf8");
const workerSource = readFileSync("src/workers/background-worker.ts", "utf8");
const migrationSource = readFileSync("db/migrations/0009_background_jobs.sql", "utf8");
const flagsSource = readFileSync("src/lib/feature-flags.ts", "utf8");
const mainEcosystemSource = readFileSync("ecosystem.config.cjs", "utf8");
const workerEcosystemSource = readFileSync("ecosystem.worker.config.cjs", "utf8");
const benchmarkSource = readFileSync("scripts/benchmark-review-group-preparation.ts", "utf8");

async function main() {
  run("state machine declares all valid transitions", () => {
    for (const [from, nextStatuses] of Object.entries(BACKGROUND_JOB_ALLOWED_TRANSITIONS)) {
      for (const to of nextStatuses) {
        assert.equal(canTransitionBackgroundJob(from as BackgroundJob["status"], to), true);
      }
    }
  });

  run("invalid status transitions are rejected", () => {
    assert.equal(canTransitionBackgroundJob("succeeded", "running"), false);
    assert.throws(() => assertBackgroundJobTransition("failed", "succeeded"));
  });

  run("retry backoff is bounded and deterministic", () => {
    assert.equal(getBackgroundJobRetryDelayMs(1), 1000);
    assert.equal(getBackgroundJobRetryDelayMs(2), 2000);
    assert.equal(getBackgroundJobRetryDelayMs(100), 5 * 60 * 1000);
    assert.deepEqual(getBackgroundJobRetryAt(3, new Date("2026-01-01T00:00:00.000Z")), new Date("2026-01-01T00:00:04.000Z"));
  });

  run("stale leases recover while healthy running jobs remain owned", () => {
    const now = new Date("2026-01-01T00:10:00.000Z");
    assert.equal(
      isBackgroundJobLeaseStale({
        status: "running",
        heartbeatAt: new Date("2026-01-01T00:07:00.000Z"),
        lockedAt: null,
        now,
        leaseMs: 2 * 60 * 1000
      }),
      true
    );
    assert.equal(
      isBackgroundJobLeaseStale({
        status: "running",
        heartbeatAt: new Date("2026-01-01T00:09:30.000Z"),
        lockedAt: null,
        now,
        leaseMs: 2 * 60 * 1000
      }),
      false
    );
  });

  run("payload canonicalization is key-order stable and rejects unsafe values", () => {
    assert.equal(canonicalizeBackgroundJobPayload({ b: [true, null], a: "ok" }), '{"a":"ok","b":[true,null]}');
    assert.equal(
      hashBackgroundJobPayload({ payload: { b: 2, a: 1 }, payloadVersion: "health_check:v1" }),
      hashBackgroundJobPayload({ payload: { a: 1, b: 2 }, payloadVersion: "health_check:v1" })
    );
    assert.throws(() => canonicalizeBackgroundJobPayload({ value: undefined }));
  });

  await runAsync("registered health-check handler validates its payload and AbortSignal", async () => {
    const controller = new AbortController();
    const result = await executeBackgroundJob(handlerContext(jobFixture({ payload: { testOnly: true } }), controller.signal));
    assert.equal(result.kind, "health_check");
    assert.equal(result.testOnly, true);
    assert.throws(() => validateBackgroundJobPayload("health_check", { testOnly: "yes" }));
    controller.abort();
    await assert.rejects(
      () => executeBackgroundJob(handlerContext(jobFixture({ payload: { testOnly: true } }), controller.signal)),
      BackgroundJobExecutionError
    );
  });

  await runAsync("unknown job types fail without retry", async () => {
    await assert.rejects(
      () => executeBackgroundJob(handlerContext(jobFixture({ type: "unknown_type" }))),
      (error: unknown) =>
        error instanceof BackgroundJobExecutionError &&
        error.code === "unknown_job_type" &&
        error.retryable === false
    );
  });

  run("repository enforces transition source status and lease fencing in SQL", () => {
    assert.match(repositorySource, /FOR UPDATE SKIP LOCKED/);
    assert.match(repositorySource, /job\.status IN \('pending', 'retry_wait'\)/);
    assert.match(repositorySource, /eq\(backgroundJobs\.leaseToken, input\.leaseToken\)/);
    assert.match(repositorySource, /new BackgroundJobLeaseLostError/);
    assert.match(repositorySource, /lease_token = NULL/);
    assert.match(repositorySource, /job_idempotency_conflict/);
  });

  run("migration protects payload hash, lease token, and status invariants", () => {
    assert.match(migrationSource, /payload_hash varchar\(64\) NOT NULL/);
    assert.match(migrationSource, /lease_token uuid/);
    assert.match(migrationSource, /background_jobs_state_lease_check/);
    assert.match(migrationSource, /background_jobs_succeeded_progress_check/);
    assert.match(migrationSource, /background_jobs_type_idempotency_key_unique/);
  });

  run("worker controls lease loss, shutdown, and safe retry classification", () => {
    assert.match(workerSource, /job_lease_lost/);
    assert.match(workerSource, /job_shutdown_requested/);
    assert.match(workerSource, /job_shutdown_timeout/);
    assert.match(workerSource, /requeueBackgroundJobAfterShutdown/);
    assert.match(workerSource, /handler_programming_error/);
    assert.match(workerSource, /isTransientDatabaseError/);
  });

  run("worker feature flags are fail-closed", () => {
    assert.match(flagsSource, /value === "1" \|\| value === "true"/);
    assert.match(flagsSource, /IMPORT_VIA_WORKER_ENABLED/);
    assert.match(flagsSource, /REVIEW_REAPPLY_VIA_WORKER_ENABLED/);
    assert.match(flagsSource, /GROUP_APPLY_VIA_WORKER_ENABLED/);
  });

  run("web PM2 config cannot start the worker", () => {
    assert.doesNotMatch(mainEcosystemSource, /autozap-worker/);
    assert.match(workerEcosystemSource, /autozap-worker/);
    assert.match(workerEcosystemSource, /WORKER_GRACEFUL_SHUTDOWN_MS: "10000"/);
    assert.match(workerEcosystemSource, /kill_timeout: 15000/);
  });

  run("preparation benchmark is guarded and uses a read-only transaction", () => {
    assert.match(benchmarkSource, /ALLOW_LOCAL_READ_ONLY_BENCHMARK/);
    assert.match(benchmarkSource, /BEGIN TRANSACTION READ ONLY/);
    assert.match(benchmarkSource, /ROLLBACK/);
    assert.match(benchmarkSource, /preparation_read_only_benchmark/);
    assert.doesNotMatch(benchmarkSource, /applyReviewGroup/);
  });

  run("local database guards require explicit localhost test opt-in", () => {
    withEnvironment(
      {
        NODE_ENV: "test",
        ALLOW_LOCAL_DB_INTEGRATION_TESTS: "1",
        DATABASE_URL: "postgresql://autozap_test:test@127.0.0.1:55432/autozap_integration_test"
      },
      () => assert.equal(assertLocalTestDatabase({ requiredFlag: "ALLOW_LOCAL_DB_INTEGRATION_TESTS", purpose: "test" }).databaseName, "autozap_integration_test")
    );
    withEnvironment(
      {
        NODE_ENV: "production",
        ALLOW_LOCAL_DB_INTEGRATION_TESTS: "1",
        DATABASE_URL: "postgresql://autozap_test:test@127.0.0.1:55432/autozap_integration_test"
      },
      () => assert.throws(() => assertLocalTestDatabase({ requiredFlag: "ALLOW_LOCAL_DB_INTEGRATION_TESTS", purpose: "test" }))
    );
    withEnvironment(
      {
        NODE_ENV: "test",
        ALLOW_LOCAL_DB_INTEGRATION_TESTS: "1",
        DATABASE_URL: "postgresql://autozap_test:test@localhost:5432/autozap"
      },
      () => assert.throws(() => assertLocalTestDatabase({ requiredFlag: "ALLOW_LOCAL_DB_INTEGRATION_TESTS", purpose: "test" }))
    );
  });
}

function jobFixture(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "job-1",
    type: "health_check",
    status: "running",
    payload: {},
    payloadHash: "a".repeat(64),
    progress: 0,
    result: null,
    error: null,
    attemptCount: 1,
    maxAttempts: 3,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    finishedAt: null,
    lockedAt: now,
    lockedBy: "worker-1",
    leaseToken: "00000000-0000-4000-8000-000000000001",
    heartbeatAt: now,
    availableAt: now,
    idempotencyKey: "test-1",
    requestedBy: null,
    correlationId: "test-correlation",
    ...overrides
  };
}

function handlerContext(job: BackgroundJob, signal = new AbortController().signal) {
  return {
    job,
    workerId: "worker-1",
    leaseToken: job.leaseToken ?? "lease-token",
    signal,
    reportProgress: async () => undefined,
    assertLease: async () => undefined
  };
}

function withEnvironment(values: Record<string, string | undefined>, fn: () => void) {
  const before = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function run(name: string, fn: () => void) {
  fn();
  console.log(`ok - ${name}`);
}

async function runAsync(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`ok - ${name}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
