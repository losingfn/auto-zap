import "server-only";
import { randomUUID } from "node:crypto";

type AdminReviewPerfMetrics = {
  duration_ms?: number;
  error?: number;
  rows?: number;
  rules?: number;
  default_rules?: number;
  families?: number;
  total_rules?: number;
  total?: number;
  calls?: number;
  avg_ms?: number;
  max_ms?: number;
  page_rows_reused?: number;
  page_rows_classified?: number;
  page_rows_cache_miss?: number;
  prefetched_rows?: number;
  similar_group_rows?: number;
  remaining?: number;
};

type AdminReviewPerfTimer = {
  startedAt: number;
};

export type AdminReviewPerfLogger = {
  readonly requestId: string;
  start: () => AdminReviewPerfTimer | undefined;
  elapsed: (timer: AdminReviewPerfTimer | undefined) => number | undefined;
  log: (stage: string, metrics?: AdminReviewPerfMetrics) => void;
  measure: <T>(
    stage: string,
    operation: () => Promise<T>,
    metrics?: (value: T) => AdminReviewPerfMetrics | undefined
  ) => Promise<T>;
  observe: <T>(
    stage: string,
    timer: AdminReviewPerfTimer | undefined,
    operation: PromiseLike<T>,
    metrics?: (value: T) => AdminReviewPerfMetrics | undefined
  ) => Promise<T>;
  measureSync: <T>(
    stage: string,
    operation: () => T,
    metrics?: (value: T) => AdminReviewPerfMetrics | undefined
  ) => T;
};

const metricOrder = [
  "duration_ms",
  "error",
  "rows",
  "rules",
  "default_rules",
  "families",
  "total_rules",
  "total",
  "calls",
  "avg_ms",
  "max_ms",
  "page_rows_reused",
  "page_rows_classified",
  "page_rows_cache_miss",
  "prefetched_rows",
  "similar_group_rows",
  "remaining"
] as const;

export function createAdminReviewPerfLogger(): AdminReviewPerfLogger | undefined {
  if (process.env.ADMIN_PERF_LOGS !== "1") {
    return undefined;
  }

  let requestId: string;
  try {
    requestId = randomUUID().slice(0, 8);
  } catch {
    return undefined;
  }

  const now = () => {
    try {
      return typeof performance === "undefined" ? undefined : performance.now();
    } catch {
      return undefined;
    }
  };
  const start = (): AdminReviewPerfTimer | undefined => {
    const startedAt = now();
    return typeof startedAt === "number" && Number.isFinite(startedAt) ? { startedAt } : undefined;
  };
  const elapsed = (timer: AdminReviewPerfTimer | undefined) => {
    const finishedAt = now();
    return timer && typeof finishedAt === "number" && Number.isFinite(finishedAt)
      ? Math.max(0, finishedAt - timer.startedAt)
      : undefined;
  };

  const log = (stage: string, metrics: AdminReviewPerfMetrics = {}) => {
    try {
      const metricFields = metricOrder.flatMap((key) => {
        const value = metrics[key];
        return typeof value === "number" && Number.isFinite(value)
          ? [`${key}=${Math.round(value)}`]
          : [];
      });
      globalThis.console?.info(
        [
          "[admin-review-perf]",
          `request=${requestId}`,
          `stage=${stage}`,
          ...metricFields
        ].join(" ")
      );
    } catch {
      // Диагностическое логирование не должно влиять на запрос страницы.
    }
  };

  const safeMetrics = <T>(
    metrics: ((value: T) => AdminReviewPerfMetrics | undefined) | undefined,
    value: T
  ) => {
    try {
      return metrics?.(value);
    } catch {
      return undefined;
    }
  };
  const logMeasurement = (
    stage: string,
    timer: AdminReviewPerfTimer | undefined,
    metrics?: AdminReviewPerfMetrics,
    error?: number
  ) => {
    try {
      const payload: AdminReviewPerfMetrics = {};
      const durationMs = elapsed(timer);
      if (typeof durationMs === "number") payload.duration_ms = durationMs;
      if (error) payload.error = error;
      for (const key of metricOrder) {
        const value = metrics?.[key];
        if (typeof value === "number" && Number.isFinite(value)) {
          payload[key] = value;
        }
      }
      log(stage, payload);
    } catch {
      // Все ошибки в формировании диагностических метрик подавляются.
    }
  };

  const measure = async <T>(
    stage: string,
    operation: () => Promise<T>,
    metrics?: (value: T) => AdminReviewPerfMetrics | undefined
  ) => {
    const timer = start();
    try {
      const value = await operation();
      logMeasurement(stage, timer, safeMetrics(metrics, value));
      return value;
    } catch (error) {
      logMeasurement(stage, timer, undefined, 1);
      throw error;
    }
  };

  const observe = async <T>(
    stage: string,
    timer: AdminReviewPerfTimer | undefined,
    operation: PromiseLike<T>,
    metrics?: (value: T) => AdminReviewPerfMetrics | undefined
  ) => {
    try {
      const value = await operation;
      logMeasurement(stage, timer, safeMetrics(metrics, value));
      return value;
    } catch (error) {
      logMeasurement(stage, timer, undefined, 1);
      throw error;
    }
  };

  const measureSync = <T>(
    stage: string,
    operation: () => T,
    metrics?: (value: T) => AdminReviewPerfMetrics | undefined
  ) => {
    const timer = start();
    try {
      const value = operation();
      logMeasurement(stage, timer, safeMetrics(metrics, value));
      return value;
    } catch (error) {
      logMeasurement(stage, timer, undefined, 1);
      throw error;
    }
  };

  return { requestId, start, elapsed, log, measure, observe, measureSync };
}
