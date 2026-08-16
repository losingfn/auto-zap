import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { backgroundJobs } from "@/db/schema";
import { getBackgroundJobRetryAt, getBackgroundJobRetryDelayMs, assertBackgroundJobTransition } from "./state";
import { hashBackgroundJobPayload } from "./payload";
import { validateBackgroundJobPayload } from "./handlers";
import {
  BackgroundJobIdempotencyConflictError,
  BackgroundJobLeaseLostError,
  BackgroundJobOwnershipLostError,
  BackgroundJobRepositoryError,
  type BackgroundJob,
  type BackgroundJobError,
  type BackgroundJobStatus,
  type CreateBackgroundJobInput
} from "./types";

type BackgroundJobRow = Omit<BackgroundJob, "payload" | "result" | "error"> & {
  payload: unknown;
  result: unknown;
  error: unknown;
};

type JobStatusCount = {
  status: BackgroundJobStatus;
  count: number;
};

export async function createBackgroundJob(input: CreateBackgroundJobInput) {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 180) {
    throw new BackgroundJobRepositoryError("invalid_transition", "Background job idempotency key is invalid.");
  }

  const payload = input.payload ?? {};
  const payloadVersion = validateBackgroundJobPayload(input.type, payload);
  const payloadHash = hashBackgroundJobPayload({ payload, payloadVersion });
  const maxAttempts = Math.max(1, Math.min(10, Math.floor(input.maxAttempts ?? 3)));
  const [created] = await db
    .insert(backgroundJobs)
    .values({
      type: input.type,
      payload,
      payloadHash,
      idempotencyKey,
      maxAttempts,
      requestedBy: input.requestedBy ?? null,
      correlationId: input.correlationId ?? null,
      availableAt: input.availableAt ?? new Date()
    })
    .onConflictDoNothing()
    .returning();

  if (created) return toBackgroundJob(created);

  const [existing] = await db
    .select()
    .from(backgroundJobs)
    .where(
      and(
        eq(backgroundJobs.type, input.type),
        eq(backgroundJobs.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);

  if (!existing) {
    throw new BackgroundJobRepositoryError("invalid_transition", "Unable to create or find background job.");
  }
  if (existing.payloadHash !== payloadHash) {
    logBackgroundJobRepositoryEvent({
      event: "job_idempotency_conflict",
      jobId: existing.id,
      jobType: existing.type
    });
    throw new BackgroundJobIdempotencyConflictError();
  }

  return toBackgroundJob(existing);
}

export async function getBackgroundJobById(jobId: string) {
  const [row] = await db
    .select()
    .from(backgroundJobs)
    .where(eq(backgroundJobs.id, jobId))
    .limit(1);
  return row ? toBackgroundJob(row) : null;
}

export async function claimNextBackgroundJob(input: { workerId: string; now?: Date }) {
  if (!input.workerId.trim()) {
    throw new BackgroundJobRepositoryError("ownership_lost", "Background worker id is required.");
  }
  assertBackgroundJobTransition("pending", "running");
  assertBackgroundJobTransition("retry_wait", "running");
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const leaseToken = randomUUID();
  const rows = await db.execute<BackgroundJobRow>(sql`
    WITH candidate AS (
      SELECT id
      FROM background_jobs
      WHERE status IN ('pending', 'retry_wait')
        AND available_at <= ${nowIso}::timestamptz
        AND attempt_count < max_attempts
      ORDER BY available_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE background_jobs AS job
    SET
      status = 'running',
      attempt_count = job.attempt_count + 1,
      started_at = COALESCE(job.started_at, ${nowIso}::timestamptz),
      finished_at = NULL,
      locked_at = ${nowIso}::timestamptz,
      locked_by = ${input.workerId},
      lease_token = ${leaseToken}::uuid,
      heartbeat_at = ${nowIso}::timestamptz,
      updated_at = ${nowIso}::timestamptz
    FROM candidate
    WHERE job.id = candidate.id
      AND job.status IN ('pending', 'retry_wait')
      AND job.attempt_count < job.max_attempts
    RETURNING
      job.id AS "id",
      job.type AS "type",
      job.status AS "status",
      job.payload AS "payload",
      job.payload_hash AS "payloadHash",
      job.progress AS "progress",
      job.result AS "result",
      job.error AS "error",
      job.attempt_count AS "attemptCount",
      job.max_attempts AS "maxAttempts",
      job.created_at AS "createdAt",
      job.updated_at AS "updatedAt",
      job.started_at AS "startedAt",
      job.finished_at AS "finishedAt",
      job.locked_at AS "lockedAt",
      job.locked_by AS "lockedBy",
      job.lease_token AS "leaseToken",
      job.heartbeat_at AS "heartbeatAt",
      job.available_at AS "availableAt",
      job.idempotency_key AS "idempotencyKey",
      job.requested_by AS "requestedBy",
      job.correlation_id AS "correlationId"
  `);

  return rows[0] ? toBackgroundJob(rows[0]) : null;
}

export async function recoverStaleBackgroundJobs(input: { leaseMs: number; now?: Date }) {
  assertBackgroundJobTransition("running", "retry_wait");
  assertBackgroundJobTransition("running", "failed");
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - input.leaseMs);
  const staleBeforeIso = staleBefore.toISOString();
  const rows = await db.execute<{ id: string; status: BackgroundJobStatus; attemptCount: number }>(sql`
    UPDATE background_jobs
    SET
      status = CASE
        WHEN attempt_count >= max_attempts THEN 'failed'::background_job_status
        ELSE 'retry_wait'::background_job_status
      END,
      finished_at = CASE WHEN attempt_count >= max_attempts THEN ${nowIso}::timestamptz ELSE NULL END,
      available_at = CASE WHEN attempt_count >= max_attempts THEN available_at ELSE ${nowIso}::timestamptz END,
      locked_at = NULL,
      locked_by = NULL,
      lease_token = NULL,
      heartbeat_at = NULL,
      error = jsonb_build_object(
        'code', 'lease_expired',
        'message', 'Worker lease expired before the job completed.',
        'retryable', attempt_count < max_attempts
      ),
      updated_at = ${nowIso}::timestamptz
    WHERE status = 'running'
      AND COALESCE(heartbeat_at, locked_at, started_at, created_at) <= ${staleBeforeIso}::timestamptz
    RETURNING id, status, attempt_count AS "attemptCount"
  `);

  return rows;
}

export async function heartbeatBackgroundJob(input: {
  jobId: string;
  workerId: string;
  leaseToken: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [row] = await db
    .update(backgroundJobs)
    .set({ heartbeatAt: now, updatedAt: now })
    .where(ownedRunningJobWhere(input))
    .returning({ id: backgroundJobs.id });

  if (!row) throw await ownedJobMutationError(input);
}

export async function updateBackgroundJobProgress(input: {
  jobId: string;
  workerId: string;
  leaseToken: string;
  progress: number;
}) {
  const progress = Math.max(0, Math.min(100, Math.floor(input.progress)));
  const [row] = await db
    .update(backgroundJobs)
    .set({ progress, updatedAt: new Date() })
    .where(ownedRunningJobWhere(input))
    .returning({ id: backgroundJobs.id });

  if (!row) throw await ownedJobMutationError(input);
}

export async function completeBackgroundJob(input: {
  jobId: string;
  workerId: string;
  leaseToken: string;
  result: Record<string, unknown>;
  now?: Date;
}) {
  assertBackgroundJobTransition("running", "succeeded");
  const now = input.now ?? new Date();
  const [row] = await db
    .update(backgroundJobs)
    .set({
      status: "succeeded",
      progress: 100,
      result: input.result,
      error: null,
      finishedAt: now,
      lockedAt: null,
      lockedBy: null,
      leaseToken: null,
      heartbeatAt: null,
      updatedAt: now
    })
    .where(ownedRunningJobWhere(input))
    .returning();

  if (!row) throw await ownedJobMutationError(input);
  return toBackgroundJob(row);
}

export async function failBackgroundJob(input: {
  job: Pick<BackgroundJob, "id" | "attemptCount" | "maxAttempts">;
  workerId: string;
  leaseToken: string;
  error: BackgroundJobError;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const willRetry = input.error.retryable && input.job.attemptCount < input.job.maxAttempts;
  assertBackgroundJobTransition("running", willRetry ? "retry_wait" : "failed");
  const retryAt = willRetry ? getBackgroundJobRetryAt(input.job.attemptCount, now) : now;
  const [row] = await db
    .update(backgroundJobs)
    .set({
      status: willRetry ? "retry_wait" : "failed",
      availableAt: retryAt,
      error: input.error,
      finishedAt: willRetry ? null : now,
      lockedAt: null,
      lockedBy: null,
      leaseToken: null,
      heartbeatAt: null,
      updatedAt: now
    })
    .where(
      ownedRunningJobWhere({
        jobId: input.job.id,
        workerId: input.workerId,
        leaseToken: input.leaseToken
      })
    )
    .returning();

  if (!row) {
    throw await ownedJobMutationError({
      jobId: input.job.id,
      workerId: input.workerId,
      leaseToken: input.leaseToken
    });
  }
  return {
    job: toBackgroundJob(row),
    retryDelayMs: willRetry ? getBackgroundJobRetryDelayMs(input.job.attemptCount) : null
  };
}

export async function requeueBackgroundJobAfterShutdown(input: {
  job: Pick<BackgroundJob, "id" | "attemptCount">;
  workerId: string;
  leaseToken: string;
  now?: Date;
}) {
  assertBackgroundJobTransition("running", "retry_wait");
  const now = input.now ?? new Date();
  const [row] = await db
    .update(backgroundJobs)
    .set({
      status: "retry_wait",
      availableAt: getBackgroundJobRetryAt(input.job.attemptCount, now),
      error: {
        code: "worker_shutdown",
        message: "Worker shutdown interrupted the job.",
        retryable: true
      },
      lockedAt: null,
      lockedBy: null,
      leaseToken: null,
      heartbeatAt: null,
      updatedAt: now
    })
    .where(
      ownedRunningJobWhere({
        jobId: input.job.id,
        workerId: input.workerId,
        leaseToken: input.leaseToken
      })
    )
    .returning();

  if (!row) {
    throw await ownedJobMutationError({
      jobId: input.job.id,
      workerId: input.workerId,
      leaseToken: input.leaseToken
    });
  }
  return toBackgroundJob(row);
}

export async function retryFailedHealthCheckJob(jobId: string) {
  assertBackgroundJobTransition("failed", "pending");
  const [row] = await db
    .update(backgroundJobs)
    .set({
      status: "pending",
      progress: 0,
      attemptCount: 0,
      error: null,
      result: null,
      startedAt: null,
      finishedAt: null,
      availableAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      leaseToken: null,
      heartbeatAt: null,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(backgroundJobs.id, jobId),
        eq(backgroundJobs.type, "health_check"),
        eq(backgroundJobs.status, "failed")
      )
    )
    .returning();

  if (!row) {
    throw new BackgroundJobRepositoryError("invalid_transition", "Only failed health-check jobs can be retried.");
  }
  return toBackgroundJob(row);
}

export async function getBackgroundJobStatusCounts(): Promise<JobStatusCount[]> {
  const rows = await db
    .select({
      status: backgroundJobs.status,
      count: sql<number>`count(*)::int`
    })
    .from(backgroundJobs)
    .groupBy(backgroundJobs.status)
    .orderBy(asc(backgroundJobs.status));

  return rows.map((row) => ({
    status: row.status as BackgroundJobStatus,
    count: Number(row.count)
  }));
}

export async function clearTestHealthCheckJobs() {
  const rows = await db.execute<{ id: string }>(sql`
    DELETE FROM background_jobs
    WHERE type = 'health_check'
      AND payload ->> 'testOnly' = 'true'
    RETURNING id
  `);
  return rows.length;
}

function ownedRunningJobWhere(input: { jobId: string; workerId: string; leaseToken: string }) {
  return and(
    eq(backgroundJobs.id, input.jobId),
    eq(backgroundJobs.status, "running"),
    eq(backgroundJobs.lockedBy, input.workerId),
    eq(backgroundJobs.leaseToken, input.leaseToken)
  );
}

async function ownedJobMutationError(input: { jobId: string; workerId: string; leaseToken: string }) {
  const [current] = await db
    .select({
      status: backgroundJobs.status,
      lockedBy: backgroundJobs.lockedBy,
      leaseToken: backgroundJobs.leaseToken
    })
    .from(backgroundJobs)
    .where(eq(backgroundJobs.id, input.jobId))
    .limit(1);

  if (!current) {
    return new BackgroundJobRepositoryError("invalid_transition", "Background job no longer exists.");
  }
  if (["succeeded", "failed", "cancelled"].includes(current.status)) {
    return new BackgroundJobRepositoryError("already_terminal", "Background job is already terminal.");
  }
  if (current.status !== "running") {
    return new BackgroundJobRepositoryError("invalid_transition", "Background job is not running.");
  }
  if (current.leaseToken !== input.leaseToken) {
    return new BackgroundJobLeaseLostError();
  }
  if (current.lockedBy !== input.workerId) {
    return new BackgroundJobOwnershipLostError();
  }
  return new BackgroundJobRepositoryError("invalid_transition", "Background job update did not affect a row.");
}

function toBackgroundJob(row: BackgroundJobRow | typeof backgroundJobs.$inferSelect): BackgroundJob {
  return {
    ...row,
    status: row.status as BackgroundJobStatus,
    payload: asRecord(row.payload),
    result: row.result ? asRecord(row.result) : null,
    error: row.error ? asBackgroundJobError(row.error) : null
  };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asBackgroundJobError(value: unknown): BackgroundJobError {
  const record = asRecord(value);
  return {
    code: typeof record.code === "string" ? record.code : "unknown",
    message: typeof record.message === "string" ? record.message : "Background job failed.",
    retryable: record.retryable === true
  };
}

function logBackgroundJobRepositoryEvent(input: Record<string, unknown>) {
  try {
    console.info("[background-job]", JSON.stringify(input));
  } catch {
    // Logging must not affect repository mutations.
  }
}
