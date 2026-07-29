import type { BackgroundJobStatus } from "./types";

export const BACKGROUND_JOB_ALLOWED_TRANSITIONS: Readonly<Record<BackgroundJobStatus, readonly BackgroundJobStatus[]>> = {
  pending: ["running", "cancelled"],
  running: ["succeeded", "failed", "retry_wait", "cancelled"],
  succeeded: [],
  failed: ["pending", "cancelled"],
  retry_wait: ["pending", "running", "cancelled"],
  cancelled: []
};

export function canTransitionBackgroundJob(
  from: BackgroundJobStatus,
  to: BackgroundJobStatus
) {
  return BACKGROUND_JOB_ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertBackgroundJobTransition(
  from: BackgroundJobStatus,
  to: BackgroundJobStatus
) {
  if (!canTransitionBackgroundJob(from, to)) {
    throw new Error(`Недопустимый переход background job: ${from} -> ${to}.`);
  }
}

export function getBackgroundJobRetryDelayMs(attemptCount: number) {
  const normalizedAttempt = Math.max(1, Math.floor(attemptCount));
  return Math.min(5 * 60 * 1000, 1000 * 2 ** (normalizedAttempt - 1));
}

export function getBackgroundJobRetryAt(attemptCount: number, now = new Date()) {
  return new Date(now.getTime() + getBackgroundJobRetryDelayMs(attemptCount));
}

export function isBackgroundJobLeaseStale(input: {
  status: BackgroundJobStatus;
  heartbeatAt: Date | null;
  lockedAt: Date | null;
  now?: Date;
  leaseMs: number;
}) {
  if (input.status !== "running") return false;
  const lastSeenAt = input.heartbeatAt ?? input.lockedAt;
  if (!lastSeenAt) return true;
  return lastSeenAt.getTime() <= (input.now ?? new Date()).getTime() - input.leaseMs;
}
