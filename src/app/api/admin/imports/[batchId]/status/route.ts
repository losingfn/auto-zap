import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { backgroundJobs, catalogVersions, importBatches } from "@/db/schema";
import { getCurrentAdminSession } from "@/features/admin/auth";
import { canPublishImport } from "@/features/import/import-state";

type RouteContext = { params: Promise<{ batchId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { batchId } = await context.params;
  const [batch] = await db
    .select({
      id: importBatches.id,
      status: importBatches.status,
      catalogVersionId: importBatches.catalogVersionId,
      versionStatus: catalogVersions.status,
      report: importBatches.report,
      publishJobId: importBatches.publishJobId,
      phase: importBatches.phase,
      stage: importBatches.stage,
      progress: importBatches.progress,
      lastErrorCode: importBatches.lastErrorCode,
      lastErrorMessage: importBatches.lastErrorMessage,
      analyzeJobStatus: backgroundJobs.status,
      analyzeJobAttempt: backgroundJobs.attemptCount
    })
    .from(importBatches)
    .leftJoin(backgroundJobs, eq(backgroundJobs.id, importBatches.analyzeJobId))
    .leftJoin(catalogVersions, eq(catalogVersions.id, importBatches.catalogVersionId))
    .where(eq(importBatches.id, batchId))
    .limit(1);

  if (!batch) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const [publishJob] = await db
    .select({ status: backgroundJobs.status, attempt: backgroundJobs.attemptCount })
    .from(backgroundJobs)
    .where(eq(backgroundJobs.id, batch.publishJobId ?? "00000000-0000-0000-0000-000000000000"))
    .limit(1);
  const job = batch.publishJobId
    ? publishJob
    : { status: batch.analyzeJobStatus, attempt: batch.analyzeJobAttempt };
  const report = isRecord(batch.report) ? batch.report : null;
  const canRetryPublishedSearch =
    batch.status === "published" &&
    batch.versionStatus === "active" &&
    Boolean(batch.publishJobId) &&
    batch.phase === "failed" &&
    job?.status === "failed";
  const canPublish =
    (canPublishImport(batch.status, batch.versionStatus, report) || canRetryPublishedSearch) &&
    (!batch.publishJobId || (batch.phase === "failed" && job?.status === "failed"));
  const terminal = batch.status === "published" || batch.status === "cancelled" || batch.status === "failed" || job?.status === "failed";

  return NextResponse.json({
    batchId: batch.id,
    phase: toUserPhase(batch.status, batch.phase, job?.status),
    status: batch.status,
    progress: batch.progress ?? 0,
    stage: batch.stage ?? toFallbackStage(batch.status),
    message: terminal ? batch.lastErrorMessage ?? null : null,
    attempt: job?.attempt ?? 0,
    canPublish,
    reviewCount: numberValue(report?.reviewRows),
    errorCode: batch.lastErrorCode ?? (job?.status === "failed" ? "ANALYSIS_FAILED" : null),
    errorMessage: batch.lastErrorMessage ?? null
  });
}

function isPublishingPhase(phase: string | null) {
  return phase === "publish_queued" || phase === "publishing" || phase === "publish_retrying" || phase === "published";
}

function toUserPhase(status: string, phase: string | null, jobStatus: string | null | undefined) {
  if (status === "cancelled") return "cancelled";
  if (status === "failed" || jobStatus === "failed" || phase === "failed") return "failed";
  if (jobStatus === "retry_wait" || phase === "retrying" || phase === "publish_retrying") return "retrying";
  if (status === "published" || phase === "published") return "published";
  if (isPublishingPhase(phase)) return "publishing";
  if (status === "analyzed" || phase === "analyzed") return "ready";
  return "analyzing";
}

function toFallbackStage(status: string) {
  return status === "analyzed" ? "Готово" : status === "published" ? "Опубликовано" : "Файл принят";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
