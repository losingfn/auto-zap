import { randomUUID } from "node:crypto";

export type ImportPerfStage =
  | "upload_action"
  | "publish_action"
  | "save_uploaded_file"
  | "prepare_input_data"
  | "parse_excel"
  | "classification"
  | "similarity_fallback"
  | "create_report"
  | "create_preview"
  | "draft_transaction"
  | "insert_import_rows"
  | "insert_products"
  | "insert_review_queue"
  | "prepare_meilisearch_documents"
  | "upload_meilisearch_batch"
  | "wait_meilisearch_task"
  | "swap_meilisearch_index"
  | "switch_active_catalog_version";

type ImportPerfMeasurement = {
  startedAt: number;
  eventLoopLag: Promise<number | undefined>;
};

type ImportPerfLogInput = {
  durationMs?: number;
  rows?: number;
  eventLoopLagMs?: number;
  status: "success" | "error";
};

type ImportPerfMeasureOptions<T> = {
  rows?: number | ((value: T) => number | undefined);
};

export type ImportClassificationPerfObserver = {
  measureSimilarityFallback: <T>(operation: () => T) => T;
  log: (status: "success" | "error") => Promise<void>;
};

export type ImportPerfLogger = {
  readonly correlationId: string;
  setImportBatchId: (importBatchId: string) => void;
  start: () => ImportPerfMeasurement;
  finish: (
    stage: ImportPerfStage,
    measurement: ImportPerfMeasurement,
    input: Omit<ImportPerfLogInput, "durationMs" | "eventLoopLagMs">
  ) => Promise<void>;
  measure: <T>(
    stage: ImportPerfStage,
    operation: () => T | Promise<T>,
    options?: ImportPerfMeasureOptions<T>
  ) => Promise<T>;
  createClassificationObserver: () => ImportClassificationPerfObserver;
};

export function createImportPerfLogger(): ImportPerfLogger | undefined {
  if (process.env.ADMIN_IMPORT_PERF_LOGS !== "1") {
    return undefined;
  }

  let correlationId: string;
  try {
    correlationId = randomUUID().slice(0, 12);
  } catch {
    return undefined;
  }

  let importBatchId: string | undefined;

  const now = () => {
    try {
      return performance.now();
    } catch {
      return Date.now();
    }
  };
  const start = (): ImportPerfMeasurement => ({
    startedAt: now(),
    eventLoopLag: measureEventLoopLag()
  });
  const write = (stage: ImportPerfStage, input: ImportPerfLogInput) => {
    try {
      const memory = process.memoryUsage();
      const values = [
        "[admin-import-perf]",
        `correlation=${correlationId}`,
        ...(importBatchId ? [`batch=${importBatchId}`] : []),
        `stage=${stage}`,
        `status=${input.status}`,
        ...(numberField("duration_ms", input.durationMs)),
        ...(numberField("rows", input.rows)),
        `rss=${memory.rss}`,
        `heap_used=${memory.heapUsed}`,
        `heap_total=${memory.heapTotal}`,
        ...(numberField("event_loop_lag_ms", input.eventLoopLagMs))
      ];
      globalThis.console?.info(values.join(" "));
    } catch {
      // Диагностика не должна менять поведение рабочего запроса.
    }
  };
  const finish = async (
    stage: ImportPerfStage,
    measurement: ImportPerfMeasurement,
    input: Omit<ImportPerfLogInput, "durationMs" | "eventLoopLagMs">
  ) => {
    let eventLoopLagMs: number | undefined;
    try {
      eventLoopLagMs = await measurement.eventLoopLag;
    } catch {
      eventLoopLagMs = undefined;
    }
    write(stage, {
      ...input,
      durationMs: Math.max(0, now() - measurement.startedAt),
      eventLoopLagMs
    });
  };
  const measure = async <T>(
    stage: ImportPerfStage,
    operation: () => T | Promise<T>,
    options: ImportPerfMeasureOptions<T> = {}
  ) => {
    const measurement = start();
    try {
      const value = await operation();
      await finish(stage, measurement, { rows: resolveRows(options.rows, value), status: "success" });
      return value;
    } catch (error) {
      await finish(stage, measurement, {
        rows: typeof options.rows === "number" ? options.rows : undefined,
        status: "error"
      });
      throw error;
    }
  };

  return {
    correlationId,
    setImportBatchId(value) {
      importBatchId = value;
    },
    start,
    finish,
    measure,
    createClassificationObserver() {
      let fallbackCount = 0;
      let fallbackDurationMs = 0;
      const eventLoopLag = measureEventLoopLag();

      return {
        measureSimilarityFallback<T>(operation: () => T) {
          const startedAt = now();
          try {
            return operation();
          } finally {
            fallbackCount += 1;
            fallbackDurationMs += Math.max(0, now() - startedAt);
          }
        },
        async log(status) {
          let eventLoopLagMs: number | undefined;
          try {
            eventLoopLagMs = await eventLoopLag;
          } catch {
            eventLoopLagMs = undefined;
          }
          write("similarity_fallback", {
            status,
            rows: fallbackCount,
            durationMs: fallbackDurationMs,
            eventLoopLagMs
          });
        }
      };
    }
  };
}

function measureEventLoopLag() {
  return new Promise<number | undefined>((resolve) => {
    try {
      const scheduledAt = performance.now();
      setImmediate(() => {
        try {
          resolve(Math.max(0, performance.now() - scheduledAt));
        } catch {
          resolve(undefined);
        }
      });
    } catch {
      resolve(undefined);
    }
  });
}

function numberField(name: string, value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? [`${name}=${Math.round(value)}`]
    : [];
}

function resolveRows<T>(
  value: number | ((result: T) => number | undefined) | undefined,
  result: T
) {
  try {
    return typeof value === "function" ? value(result) : value;
  } catch {
    return undefined;
  }
}
