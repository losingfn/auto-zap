# Background jobs (PR 2A)

## Scope and safety

The PostgreSQL-backed worker is separately runnable. It handles import analysis and explicit publication behind a feature flag; review reapply and “Применить к группе” retain their existing paths.

Registered handlers are `health_check`, `analyze_import`, and `publish_import`. Payload validation does not accept arbitrary handler names or Excel buffers. The worker idles without claiming jobs unless `BACKGROUND_JOBS_ENABLED=1` (or `true`).

## Database model

Migration `db/migrations/0009_background_jobs.sql` is additive:

- adds `background_job_status` enum and `background_jobs` table;
- adds a unique `(type, idempotency_key)` constraint, canonical `payload_hash`, and per-claim `lease_token` fencing;
- adds a claim index `(status, available_at, created_at)` and lease-recovery index `(status, heartbeat_at)`;
- does not change or lock existing catalogue/import/review tables;
- does not require worker startup.

Application rollback must leave the table in place. Older application code ignores it safely.

| Status | Allowed next status | Meaning |
| --- | --- | --- |
| `pending` | `running`, `cancelled` | Ready to be claimed. |
| `running` | `succeeded`, `failed`, `retry_wait`, `cancelled` | Owned by one worker. |
| `retry_wait` | `pending`, `running`, `cancelled` | Retry is delayed until `available_at`. |
| `succeeded` | — | Handler completed. |
| `failed` | `pending`, `cancelled` | Retry limit reached or error is non-retryable. |
| `cancelled` | — | Reserved for a safe future cancellation flow. |

## Claim, idempotency, lease, retry

`claimNextBackgroundJob()` uses one `UPDATE … FROM` statement with `FOR UPDATE SKIP LOCKED`. Two workers cannot claim the same row: PostgreSQL locks the candidate before it is set to `running` and assigned a `locked_by` worker id plus a fresh `lease_token` UUID. Every heartbeat, progress, completion, failure and shutdown requeue checks all of `id`, `status = running`, `locked_by`, and `lease_token`; an old handler cannot overwrite a reclaimed job.

The unique type/idempotency key returns the existing job only when its canonical SHA-256 `payload_hash` is identical. The same key with a different payload fails with `idempotency_conflict` and never modifies the existing row. Callers must include their business entity/actor scope in the key when needed. The worker increments `attempt_count` at claim time, writes `heartbeat_at` every 15 seconds, and recovers a running job whose heartbeat/lock is older than two minutes. Retries use bounded exponential delay: 1s, 2s, 4s, …, at most five minutes; default `max_attempts` is three.

On `SIGTERM`/`SIGINT` the worker stops claiming new work, aborts the current handler through `AbortSignal`, and waits up to `WORKER_GRACEFUL_SHUTDOWN_MS` (default 10 seconds). An abortable handler is requeued only while its lease is still owned. At the timeout the process exits without a success write; the running job is later recovered by lease expiry. Import handlers persist their own business checkpoints and only run when the import flag is explicitly enabled.

## Feature flags

All flags are read centrally in `src/lib/feature-flags.ts`. Missing, malformed, or any value other than `1` / `true` is false.

| Variable | Default | PR 2A behavior |
| --- | --- | --- |
| `BACKGROUND_JOBS_ENABLED` | false | Permits the worker to claim registered jobs. |
| `IMPORT_VIA_WORKER_ENABLED` | false | New imports enqueue durable analyze/publish jobs; false retains the legacy synchronous draft path. |
| `REVIEW_REAPPLY_VIA_WORKER_ENABLED` | false | Reserved; CLI processor remains required. |
| `GROUP_APPLY_VIA_WORKER_ENABLED` | false | Reserved; group apply remains a server action. |

Turning any flag off does not alter existing business semantics; it keeps the legacy path active.

## Local operation

Use a local or dedicated test database. Both the integration suite and benchmark require localhost, a test/integration database name, a non-production `NODE_ENV`, and an explicit opt-in variable.

```bash
pnpm worker:start
pnpm jobs status
pnpm jobs enqueue-test-health-check
pnpm jobs retry <failed-health-check-job-id>
pnpm jobs clear-test
ALLOW_LOCAL_READ_ONLY_BENCHMARK=1 NODE_ENV=test DATABASE_URL=postgresql://autozap_test:autozap_test_password@127.0.0.1:55432/autozap_integration_test pnpm review:benchmark-group-preparation
```

`jobs clear-test` deletes only `health_check` rows whose payload has `testOnly: true`. Failed health-check jobs can be retried with `jobs retry`; it cannot requeue future production job types.

To stop a local worker, send `SIGTERM`/`Ctrl+C` and wait for `worker_stopped`. The website is independent of this process.

## PM2 recommendation (do not run from root)

`ecosystem.config.cjs` defines only the existing `autozap` web application. `ecosystem.worker.config.cjs` is a separate, explicit worker definition:

- `autozap`: existing standalone Next.js web process;
- `autozap-worker`: `scripts/with-env.sh node --import tsx scripts/background-worker.ts`, configured only in the worker ecosystem file.

The standard web ecosystem has no worker entry, so a web deploy cannot start the worker. Production commands must be run as Linux user `autozap`:

```bash
pm2 startOrReload ecosystem.config.cjs --only autozap
pm2 start ecosystem.worker.config.cjs --only autozap-worker
pm2 status
pm2 logs autozap-worker
pm2 stop autozap-worker
pm2 delete autozap-worker
```

Start the worker only after a staged validation and only with an explicit `BACKGROUND_JOBS_ENABLED=1` environment. Keep `IMPORT_VIA_WORKER_ENABLED` false until a controlled worker health check has passed. Do not use root’s PM2 daemon or change the web process to run the worker.

## Group-apply diagnostics

Set `ADMIN_REVIEW_GROUP_APPLY_PERF_LOGS=1` temporarily to emit structured server logs:

- `group_apply_stage` for origin/auth/input, DB load, classification, transaction, post-condition, revalidation and response preparation;
- `group_apply_completed` with `groupId`, `itemCount`, total, database/indexing/revalidation/other duration, SQL-operation estimate, correlation id and result;
- `group_apply_failed` with the last stage and a safe error code/message.

No payload, product names, sessions, cookies, headers or stack traces are logged. Database duration is cumulative per measured DB stage; some context reads run concurrently, so the sum can exceed wall-clock duration. `indexingDurationMs` is zero for this flow by design: group apply prepares review-workspace records only and never indexes/publishes products.

The client stores only group key, timestamp and scroll offset in `sessionStorage`. On the redirected page it restores scroll and writes a browser-console `group_apply_client_refresh` duration; this separates client navigation/refresh time from server timings.

The existing native server-action form has no returned client error state. A browser `pageshow` resets its pending guard after an interrupted navigation; a richer no-navigation network-error recovery would require changing the action/result architecture and remains outside PR 2A/for PR 2B.

### Confirmed current bottlenecks

Code inspection establishes the following facts:

1. `applyReviewRuleToWorkspace()` validates target/workspace/idempotency, then calls `getActionRows()`.
2. `getActionRows()` reloads version context, categorization context, taxonomy targets, and up to `MAX_ACTION_REVIEW_ROWS = 5000` review rows. It classifies and filters them in memory before selecting the requested group.
3. On success the server action calls `revalidatePath("/admin/review")`, `revalidatePath("/admin")`, and `redirect()`. The Next route is rebuilt, which was the cause of scroll loss before this PR.
4. The group mutation itself is a single transaction for workspace action, workspace-item upserts, optional rule and audit log. It does not update `products`/`review_queue`, call Meilisearch, or publish a catalogue version.

Therefore indexing/publication are ruled out for this operation. The live bottleneck must be confirmed with the new stage logs plus benchmark on a local/test database; this checkout could not run the benchmark because local PostgreSQL was unavailable (`ECONNREFUSED`).

`pnpm review:benchmark-group-preparation` measures representative 1/5/10/25/50/100-row read-and-classification samples, SQL-operation count and heap delta. It starts `BEGIN TRANSACTION READ ONLY` and always issues `ROLLBACK`. It intentionally does not measure group mutation, revalidation, redirect, indexing or publication; its timings are not full “Применить к группе” timings.

| Sample size | Before | After PR 2A |
| --- | --- | --- |
| 1, 5, 10, 25, 50, 100 | Not captured: local test DB unavailable | No backend optimization in PR 2A; collect with the read-only benchmark and stage logs |

## Local PostgreSQL integration suite

The test-only compose file contains PostgreSQL 16 only. It has its own localhost port, DB, credentials and volume; it never references the standard application compose stack, production credentials or production data.

```bash
docker compose -f docker-compose.test.yml up -d
NODE_ENV=test ALLOW_LOCAL_DB_INTEGRATION_TESTS=1 DATABASE_URL=postgresql://autozap_test:autozap_test_password@127.0.0.1:55432/autozap_integration_test node --import tsx scripts/test-background-jobs-postgres.ts
docker compose -f docker-compose.test.yml down -v
```

The suite first recreates only the dedicated test schema and applies all migrations to verify a clean migration. It then rebuilds the previous schema, applies `0011_import_worker.sql`, and verifies the additive upgrade path. It covers actual PostgreSQL concurrent claim, idempotency races, lease ownership/fencing, stale recovery, retry limits, and the worker lease-loss regression.

## Rollback

1. Keep all four feature flags absent/false.
2. Stop `autozap-worker` as user `autozap`.
3. Keep `autozap` web process running and verify it is healthy.
4. If required, roll back the application commit only; do not drop `background_jobs` or its enum/indexes in an incident.
5. Verify the catalogue, admin page, legacy import, review CLI flow, and group apply.
6. Failed/pending health-check jobs are inert. They do not block the web process.

## PR 2B plan

1. Add a narrowly scoped import handler with a versioned, validated payload and idempotency key; preserve existing import safety checks.
2. Behind `IMPORT_VIA_WORKER_ENABLED`, enqueue after file persistence and return “Файл принят”; expose read-only run progress in the admin UI.
3. Add a review-reapply handler only after comparing CLI batch output and worker output on a test DB; gate with `REVIEW_REAPPLY_VIA_WORKER_ENABLED` and retain the CLI fallback.
4. Use group stage logs and benchmark results to decide whether only targeted UI refresh is enough or a group handler is justified; do not move group apply by default.
5. Replace full redirect with confirmed server-action result plus targeted queue/count update, preserve scroll, then gate the optional worker route with `GROUP_APPLY_VIA_WORKER_ENABLED`.
6. Roll out one flag at a time with canary validation, worker logs, job status checks, and documented rollback to the legacy path.
