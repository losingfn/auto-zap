import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { isBackgroundJobsInfrastructureEnabled } from "@/lib/feature-flags";
import { executeBackgroundJob, handleBackgroundJobFailure } from "@/features/background-jobs/handlers";
import {
  claimNextBackgroundJob,
  completeBackgroundJob,
  failBackgroundJob,
  getBackgroundJobById,
  heartbeatBackgroundJob,
  recoverStaleBackgroundJobs,
  requeueBackgroundJobAfterShutdown,
  updateBackgroundJobProgress
} from "@/features/background-jobs/repository";
import {
  BackgroundJobExecutionError,
  BackgroundJobLeaseLostError,
  BackgroundJobOwnershipLostError,
  BackgroundJobRepositoryError,
  type BackgroundJob,
  type BackgroundJobError
} from "@/features/background-jobs/types";

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_GRACEFUL_SHUTDOWN_MS = 10_000;

export type BackgroundWorkerOptions = {
  workerId?: string;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  leaseMs?: number;
  gracefulShutdownMs?: number;
  maxProcessedJobs?: number;
};

export async function runBackgroundWorker(options: BackgroundWorkerOptions = {}) {
  const workerId = options.workerId ?? createWorkerId();
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const gracefulShutdownMs = options.gracefulShutdownMs ?? readGracefulShutdownMs();
  let stopping = false;
  let disabledLogged = false;
  let processedJobs = 0;
  let activeJob: { job: BackgroundJob; controller: AbortController } | null = null;

  const requestShutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logWorkerEvent({ event: "job_shutdown_requested", workerId, signal, jobId: activeJob?.job.id ?? null });
    activeJob?.controller.abort();
  };
  const onSigterm = () => requestShutdown("SIGTERM");
  const onSigint = () => requestShutdown("SIGINT");
  process.on("SIGTERM", onSigterm);
  process.on("SIGINT", onSigint);

  logWorkerEvent({ event: "worker_started", workerId, gracefulShutdownMs });

  try {
    while (!stopping) {
      if (!isBackgroundJobsInfrastructureEnabled()) {
        if (!disabledLogged) {
          disabledLogged = true;
          logWorkerEvent({ event: "worker_idle_feature_flag_disabled", workerId });
        }
        await delay(pollIntervalMs);
        continue;
      }

      disabledLogged = false;
      const recovered = await recoverStaleBackgroundJobs({ leaseMs });
      for (const job of recovered) {
        if (job.status === "failed") {
          const recoveredJob = await getBackgroundJobById(job.id);
          if (recoveredJob?.error) {
            await handleBackgroundJobFailure({
              job: recoveredJob,
              error: recoveredJob.error,
              willRetry: false
            }).catch(() => undefined);
          }
        }
        logWorkerEvent({
          event: job.status === "retry_wait" ? "job_requeued_after_stale" : "job_failed_permanently",
          workerId,
          jobId: job.id,
          attempt: job.attemptCount
        });
      }

      const job = await claimNextBackgroundJob({ workerId });
      if (!job) {
        await delay(pollIntervalMs);
        continue;
      }

      const controller = new AbortController();
      activeJob = { job, controller };
      await runClaimedBackgroundJob({
        job,
        workerId,
        signal: controller.signal,
        heartbeatIntervalMs,
        gracefulShutdownMs
      });
      activeJob = null;
      processedJobs += 1;
      if (options.maxProcessedJobs !== undefined && processedJobs >= options.maxProcessedJobs) {
        stopping = true;
      }
    }
  } finally {
    process.off("SIGTERM", onSigterm);
    process.off("SIGINT", onSigint);
    logWorkerEvent({ event: "worker_stopped", workerId });
  }
}

export async function runClaimedBackgroundJob(input: {
  job: BackgroundJob;
  workerId: string;
  signal: AbortSignal;
  heartbeatIntervalMs: number;
  gracefulShutdownMs: number;
}) {
  if (!input.job.leaseToken) throw new BackgroundJobLeaseLostError();
  const startedAt = performance.now();
  let leaseLost = false;
  const leaseToken = input.job.leaseToken;
  logWorkerEvent({
    event: "job_started",
    workerId: input.workerId,
    jobId: input.job.id,
    jobType: input.job.type,
    attempt: input.job.attemptCount,
    correlationId: input.job.correlationId
  });

  const heartbeatTimer = setInterval(() => {
    void heartbeatBackgroundJob({
      jobId: input.job.id,
      workerId: input.workerId,
      leaseToken
    }).catch((error) => {
      if (isJobOwnershipLost(error)) {
        leaseLost = true;
        logLeaseLost(input);
        return;
      }
      logWorkerEvent({
        event: "job_heartbeat_failed",
        workerId: input.workerId,
        jobId: input.job.id,
        jobType: input.job.type,
        attempt: input.job.attemptCount,
        correlationId: input.job.correlationId
      });
    });
  }, input.heartbeatIntervalMs);

  const handlerOutcome = executeBackgroundJob({
    job: input.job,
    workerId: input.workerId,
    leaseToken,
    signal: input.signal,
    reportProgress: async (progress) => {
      await updateBackgroundJobProgress({
        jobId: input.job.id,
        workerId: input.workerId,
        leaseToken,
        progress
      });
    },
    assertLease: async () => {
      await heartbeatBackgroundJob({
        jobId: input.job.id,
        workerId: input.workerId,
        leaseToken
      });
    }
  })
    .then((result) => ({ kind: "result" as const, result }))
    .catch((error) => ({ kind: "error" as const, error }));
  const shutdownTimeout = createShutdownTimeout(input.signal, input.gracefulShutdownMs);

  try {
    const outcome = await Promise.race([handlerOutcome, shutdownTimeout.promise]);
    if (outcome.kind === "shutdown_timeout") {
      logWorkerEvent({
        event: "job_shutdown_timeout",
        workerId: input.workerId,
        jobId: input.job.id,
        jobType: input.job.type,
        attempt: input.job.attemptCount,
        correlationId: input.job.correlationId
      });
      return;
    }

    if (leaseLost) {
      logLeaseLost(input);
      return;
    }

    if (input.signal.aborted) {
      await requeueAfterShutdown(input, leaseToken);
      return;
    }

    if (outcome.kind === "result") {
      try {
        const completed = await completeBackgroundJob({
          jobId: input.job.id,
          workerId: input.workerId,
          leaseToken,
          result: outcome.result
        });
        logWorkerEvent({
          event: "job_succeeded",
          workerId: input.workerId,
          jobId: completed.id,
          jobType: completed.type,
          attempt: completed.attemptCount,
          durationMs: elapsedSince(startedAt),
          progress: completed.progress,
          correlationId: completed.correlationId
        });
      } catch (error) {
        if (isJobOwnershipLost(error)) {
          logLeaseLost(input);
          return;
        }
        logWorkerEvent({
          event: "job_completion_update_failed",
          workerId: input.workerId,
          jobId: input.job.id,
          jobType: input.job.type,
          correlationId: input.job.correlationId
        });
      }
      return;
    }

    if (isJobOwnershipLost(outcome.error)) {
      logLeaseLost(input);
      return;
    }
    const safeError = toSafeJobError(outcome.error);
    try {
      const failed = await failBackgroundJob({
        job: input.job,
        workerId: input.workerId,
        leaseToken,
        error: safeError
      });
      await handleBackgroundJobFailure({
        job: input.job,
        error: safeError,
        willRetry: failed.job.status === "retry_wait"
      }).catch(() => undefined);
      logWorkerEvent({
        event: failed.job.status === "retry_wait" ? "job_retry_wait" : "job_failed_permanently",
        workerId: input.workerId,
        jobId: failed.job.id,
        jobType: failed.job.type,
        attempt: failed.job.attemptCount,
        durationMs: elapsedSince(startedAt),
        progress: failed.job.progress,
        correlationId: failed.job.correlationId,
        errorCode: safeError.code,
        retryDelayMs: failed.retryDelayMs
      });
    } catch (error) {
      if (isJobOwnershipLost(error)) {
        logLeaseLost(input);
        return;
      }
      logWorkerEvent({
        event: "job_failure_update_failed",
        workerId: input.workerId,
        jobId: input.job.id,
        jobType: input.job.type,
        correlationId: input.job.correlationId
      });
    }
  } finally {
    shutdownTimeout.cancel();
    clearInterval(heartbeatTimer);
  }
}

async function requeueAfterShutdown(
  input: Parameters<typeof runClaimedBackgroundJob>[0],
  leaseToken: string
) {
  try {
    const job = await requeueBackgroundJobAfterShutdown({
      job: input.job,
      workerId: input.workerId,
      leaseToken
    });
    logWorkerEvent({
      event: "job_requeued_after_shutdown",
      workerId: input.workerId,
      jobId: job.id,
      jobType: job.type,
      attempt: job.attemptCount,
      correlationId: job.correlationId
    });
  } catch (error) {
    if (isJobOwnershipLost(error)) {
      logLeaseLost(input);
      return;
    }
    logWorkerEvent({
      event: "job_shutdown_requeue_failed",
      workerId: input.workerId,
      jobId: input.job.id,
      jobType: input.job.type,
      correlationId: input.job.correlationId
    });
  }
}

function toSafeJobError(error: unknown): BackgroundJobError {
  if (error instanceof BackgroundJobExecutionError) {
    return {
      code: error.code,
      message: error.safeMessage,
      retryable: error.retryable
    };
  }

  return {
    code: isTransientDatabaseError(error) ? "transient_database_error" : "handler_programming_error",
    message: isTransientDatabaseError(error)
      ? "Background job encountered a transient database error."
      : "Background job handler failed unexpectedly.",
    retryable: isTransientDatabaseError(error)
  };
}

function isTransientDatabaseError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
  return Boolean(code && (code.startsWith("08") || ["40001", "40P01", "53300", "57P01", "57P02", "57P03", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT"].includes(code)));
}

function isJobOwnershipLost(error: unknown) {
  return (
    error instanceof BackgroundJobLeaseLostError ||
    error instanceof BackgroundJobOwnershipLostError ||
    (error instanceof BackgroundJobRepositoryError &&
      ["invalid_transition", "already_terminal"].includes(error.code))
  );
}

function createShutdownTimeout(signal: AbortSignal, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const promise = new Promise<{ kind: "shutdown_timeout" }>((resolve) => {
    onAbort = () => {
      timer = setTimeout(() => resolve({ kind: "shutdown_timeout" }), timeoutMs);
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  return {
    promise,
    cancel() {
      if (timer) clearTimeout(timer);
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  };
}

function readGracefulShutdownMs() {
  const value = Number(process.env.WORKER_GRACEFUL_SHUTDOWN_MS);
  if (!Number.isInteger(value) || value < 1000 || value >= 15_000) return DEFAULT_GRACEFUL_SHUTDOWN_MS;
  return value;
}

function logLeaseLost(input: Pick<Parameters<typeof runClaimedBackgroundJob>[0], "job" | "workerId">) {
  logWorkerEvent({
    event: "job_lease_lost",
    workerId: input.workerId,
    jobId: input.job.id,
    jobType: input.job.type,
    attempt: input.job.attemptCount,
    correlationId: input.job.correlationId
  });
}

function createWorkerId() {
  return `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
}

function elapsedSince(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function logWorkerEvent(input: Record<string, unknown>) {
  try {
    console.info("[background-job]", JSON.stringify(input));
  } catch {
    // Logging must not alter background job processing.
  }
}
