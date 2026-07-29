import "server-only";
import { randomUUID } from "node:crypto";

export type GroupApplyPerfCategory = "database" | "indexing" | "revalidation" | "other";

type GroupApplyPerfStage = {
  name: string;
  category: GroupApplyPerfCategory;
  durationMs: number;
  itemCount?: number;
  sqlOperations?: number;
  status: "success" | "error";
};

export type GroupApplyPerfLogger = {
  readonly correlationId: string;
  setGroupId: (groupId: string | null | undefined) => void;
  measure: <T>(
    name: string,
    options: {
      category: GroupApplyPerfCategory;
      itemCount?: number;
      sqlOperations?: number;
    },
    operation: () => T | Promise<T>
  ) => Promise<T>;
  measureSync: <T>(
    name: string,
    options: {
      category: GroupApplyPerfCategory;
      itemCount?: number;
      sqlOperations?: number;
    },
    operation: () => T
  ) => T;
  complete: (input: { itemCount: number; result: string }) => void;
  fail: (input: { errorCode: string; safeMessage: string }) => void;
};

export function createGroupApplyPerfLogger(): GroupApplyPerfLogger | undefined {
  if (process.env.ADMIN_REVIEW_GROUP_APPLY_PERF_LOGS !== "1") {
    return undefined;
  }

  let correlationId: string;
  try {
    correlationId = randomUUID().slice(0, 12);
  } catch {
    return undefined;
  }
  const startedAt = now();
  const stages: GroupApplyPerfStage[] = [];
  let groupId: string | null = null;

  const record = (stage: GroupApplyPerfStage) => {
    stages.push(stage);
    log({
      event: "group_apply_stage",
      correlationId,
      groupId,
      stage: stage.name,
      category: stage.category,
      durationMs: stage.durationMs,
      itemCount: stage.itemCount,
      sqlOperations: stage.sqlOperations,
      result: stage.status
    });
  };

  const measure = async <T>(
    name: string,
    options: {
      category: GroupApplyPerfCategory;
      itemCount?: number;
      sqlOperations?: number;
    },
    operation: () => T | Promise<T>
  ) => {
    const stageStartedAt = now();
    try {
      const value = await operation();
      record({
        name,
        ...options,
        durationMs: elapsed(stageStartedAt),
        status: "success"
      });
      return value;
    } catch (error) {
      record({
        name,
        ...options,
        durationMs: elapsed(stageStartedAt),
        status: "error"
      });
      throw error;
    }
  };

  const measureSync = <T>(
    name: string,
    options: {
      category: GroupApplyPerfCategory;
      itemCount?: number;
      sqlOperations?: number;
    },
    operation: () => T
  ) => {
    const stageStartedAt = now();
    try {
      const value = operation();
      record({
        name,
        ...options,
        durationMs: elapsed(stageStartedAt),
        status: "success"
      });
      return value;
    } catch (error) {
      record({
        name,
        ...options,
        durationMs: elapsed(stageStartedAt),
        status: "error"
      });
      throw error;
    }
  };

  const summary = () => {
    const totalDurationMs = elapsed(startedAt);
    const databaseDurationMs = sumStageDuration(stages, "database");
    const indexingDurationMs = sumStageDuration(stages, "indexing");
    const revalidationDurationMs = sumStageDuration(stages, "revalidation");
    const measuredBreakdownMs = databaseDurationMs + indexingDurationMs + revalidationDurationMs;
    return {
      totalDurationMs,
      databaseDurationMs,
      indexingDurationMs,
      revalidationDurationMs,
      otherDurationMs: Math.max(0, totalDurationMs - measuredBreakdownMs),
      sqlOperations: stages.reduce((sum, stage) => sum + (stage.sqlOperations ?? 0), 0)
    };
  };

  return {
    correlationId,
    setGroupId(value) {
      groupId = value || null;
    },
    measure,
    measureSync,
    complete(input) {
      log({
        event: "group_apply_completed",
        correlationId,
        groupId,
        itemCount: input.itemCount,
        ...summary(),
        result: input.result
      });
    },
    fail(input) {
      log({
        event: "group_apply_failed",
        correlationId,
        groupId,
        ...summary(),
        stage: stages.at(-1)?.name ?? "request_received",
        errorCode: input.errorCode,
        errorMessage: input.safeMessage,
        result: "error"
      });
    }
  };
}

function now() {
  try {
    return performance.now();
  } catch {
    return Date.now();
  }
}

function elapsed(startedAt: number) {
  return Math.max(0, Math.round(now() - startedAt));
}

function sumStageDuration(stages: GroupApplyPerfStage[], category: GroupApplyPerfCategory) {
  return stages
    .filter((stage) => stage.category === category)
    .reduce((sum, stage) => sum + stage.durationMs, 0);
}

function log(input: Record<string, unknown>) {
  try {
    console.info("[admin-review-group-apply]", JSON.stringify(input));
  } catch {
    // Diagnostics must not change the group-apply result.
  }
}
