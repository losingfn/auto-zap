export const BACKGROUND_JOB_TYPES = ["health_check"] as const;

export type BackgroundJobType = (typeof BACKGROUND_JOB_TYPES)[number];
export type BackgroundJobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "retry_wait"
  | "cancelled";

export type BackgroundJobError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type BackgroundJob = {
  id: string;
  type: string;
  status: BackgroundJobStatus;
  payload: Record<string, unknown>;
  payloadHash: string;
  progress: number;
  result: Record<string, unknown> | null;
  error: BackgroundJobError | null;
  attemptCount: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  leaseToken: string | null;
  heartbeatAt: Date | null;
  availableAt: Date;
  idempotencyKey: string;
  requestedBy: string | null;
  correlationId: string | null;
};

export type CreateBackgroundJobInput = {
  type: BackgroundJobType;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
  maxAttempts?: number;
  requestedBy?: string | null;
  correlationId?: string | null;
  availableAt?: Date;
};

export type BackgroundJobLease = {
  workerId: string;
  leaseToken: string;
};

export type BackgroundJobHandlerContext = {
  job: BackgroundJob;
  workerId: string;
  leaseToken: string;
  signal: AbortSignal;
  reportProgress: (progress: number) => Promise<void>;
  assertLease: () => Promise<void>;
};

export type BackgroundJobHandlerResult = Record<string, unknown>;

export type BackgroundJobHandlerDefinition = {
  payloadVersion: string;
  validatePayload: (payload: Record<string, unknown>) => void;
  execute: (context: BackgroundJobHandlerContext) => Promise<BackgroundJobHandlerResult>;
};

export type BackgroundJobRepositoryErrorCode =
  | "invalid_transition"
  | "lease_lost"
  | "already_terminal"
  | "ownership_lost"
  | "idempotency_conflict";

export class BackgroundJobRepositoryError extends Error {
  constructor(
    readonly code: BackgroundJobRepositoryErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BackgroundJobRepositoryError";
  }
}

export class BackgroundJobLeaseLostError extends BackgroundJobRepositoryError {
  constructor() {
    super("lease_lost", "Background job lease was lost.");
    this.name = "BackgroundJobLeaseLostError";
  }
}

export class BackgroundJobOwnershipLostError extends BackgroundJobRepositoryError {
  constructor() {
    super("ownership_lost", "Background job is owned by another worker.");
    this.name = "BackgroundJobOwnershipLostError";
  }
}

export class BackgroundJobIdempotencyConflictError extends BackgroundJobRepositoryError {
  constructor() {
    super("idempotency_conflict", "Idempotency key is already bound to another payload.");
    this.name = "BackgroundJobIdempotencyConflictError";
  }
}

export class BackgroundJobExecutionError extends Error {
  constructor(
    readonly code: string,
    readonly safeMessage: string,
    readonly retryable: boolean
  ) {
    super(safeMessage);
    this.name = "BackgroundJobExecutionError";
  }
}

export function isBackgroundJobType(value: string): value is BackgroundJobType {
  return (BACKGROUND_JOB_TYPES as readonly string[]).includes(value);
}
