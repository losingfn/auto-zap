import {
  BackgroundJobExecutionError,
  isBackgroundJobType,
  type BackgroundJobHandlerContext,
  type BackgroundJobHandlerDefinition,
  type BackgroundJobHandlerResult
} from "./types";

const healthCheckHandler: BackgroundJobHandlerDefinition = {
  payloadVersion: "health_check:v1",
  validatePayload(payload) {
    const keys = Object.keys(payload);
    if (keys.some((key) => key !== "testOnly" && key !== "delayMs")) {
      throw new BackgroundJobExecutionError("invalid_payload", "Background job payload is invalid.", false);
    }
    if (payload.testOnly !== undefined && typeof payload.testOnly !== "boolean") {
      throw new BackgroundJobExecutionError("invalid_payload", "Background job payload is invalid.", false);
    }
    const delayMs = payload.delayMs;
    if (
      delayMs !== undefined &&
      (typeof delayMs !== "number" || !Number.isInteger(delayMs) || delayMs < 0 || delayMs > 30_000 || payload.testOnly !== true)
    ) {
      throw new BackgroundJobExecutionError("invalid_payload", "Background job payload is invalid.", false);
    }
  },
  async execute(context) {
    const delayMs = typeof context.job.payload.delayMs === "number" ? context.job.payload.delayMs : 0;
    await abortableDelay(delayMs, context.signal);
    await context.assertLease();
    return {
      kind: "health_check",
      testOnly: context.job.payload.testOnly === true,
      completedAt: new Date().toISOString()
    };
  }
};

const handlerRegistry: Record<string, BackgroundJobHandlerDefinition> = {
  health_check: healthCheckHandler
};

export function getBackgroundJobHandler(type: string) {
  return isBackgroundJobType(type) ? handlerRegistry[type] : undefined;
}

export function validateBackgroundJobPayload(type: string, payload: Record<string, unknown>) {
  const handler = getBackgroundJobHandler(type);
  if (!handler) {
    throw new BackgroundJobExecutionError(
      "unknown_job_type",
      "Background job type is not registered.",
      false
    );
  }
  handler.validatePayload(payload);
  return handler.payloadVersion;
}

export async function executeBackgroundJob(context: BackgroundJobHandlerContext): Promise<BackgroundJobHandlerResult> {
  const handler = getBackgroundJobHandler(context.job.type);
  if (!handler) {
    throw new BackgroundJobExecutionError(
      "unknown_job_type",
      "Background job type is not registered.",
      false
    );
  }
  handler.validatePayload(context.job.payload);
  return handler.execute(context);
}

function abortableDelay(delayMs: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(abortedError());
  if (delayMs === 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(abortedError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortedError() {
  return new BackgroundJobExecutionError("job_aborted", "Background job was aborted during shutdown.", true);
}
