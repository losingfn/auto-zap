"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import {
  AdminImportError,
  cancelAdminImportBatch,
  createAdminDraftImportFromUpload,
  enqueueAdminImportFromUpload,
  enqueueAdminImportPublish,
  publishAdminImportBatch
} from "@/features/admin/imports";
import { getFeatureFlags } from "@/lib/feature-flags";
import { createImportPerfLogger } from "@/lib/server/import-perf";

export async function uploadImportAction(formData: FormData) {
  const perf = createImportPerfLogger();
  const actionMeasurement = perf?.start();
  const session = await requireAdminSession();
  const file = formData.get("file");
  let target = "/admin/import";
  let importBatchId: string | null = null;
  let actionStatus: "success" | "error" = "success";

  try {
    if (getFeatureFlags().importViaWorker) {
      const result = await enqueueAdminImportFromUpload({
        file: file instanceof File ? file : null,
        adminUserId: session.user.id
      });
      importBatchId = result.importBatchId;
      target = `/admin/import?batch=${encodeURIComponent(result.importBatchId)}&accepted=1`;
    } else {
      const result = await createAdminDraftImportFromUpload({
        file: file instanceof File ? file : null,
        adminUserId: session.user.id,
        perf
      });
      importBatchId = result.importBatchId;
      perf?.setImportBatchId(importBatchId);
      target = `/admin/import?batch=${encodeURIComponent(result.importBatchId)}&analyzed=1`;
    }
    revalidatePath("/admin");
    revalidatePath("/admin/import");
  } catch (error) {
    actionStatus = "error";
    const errorCode = getErrorCode(error, importBatchId ? "publish_failed" : "analysis_failed");
    const batchId = importBatchId ?? getErrorBatchId(error);
    const batchParam = batchId ? `batch=${encodeURIComponent(batchId)}&` : "";
    target = `/admin/import?${batchParam}error=${errorCode}`;
  } finally {
    if (perf && actionMeasurement) {
      await perf.finish("upload_action", actionMeasurement, { status: actionStatus });
    }
  }

  redirect(target);
}

export async function publishImportAction(formData: FormData) {
  const perf = createImportPerfLogger();
  const session = await requireAdminSession();
  const importBatchId = String(formData.get("batchId") ?? "");
  perf?.setImportBatchId(importBatchId);
  let target = `/admin/import?batch=${encodeURIComponent(importBatchId)}`;

  try {
    if (getFeatureFlags().importViaWorker) {
      await enqueueAdminImportPublish({ importBatchId, adminUserId: session.user.id });
      target = `/admin/import?batch=${encodeURIComponent(importBatchId)}&publish_requested=1`;
    } else {
      await publishAdminImportBatch({
        importBatchId,
        adminUserId: session.user.id,
        perf
      });
      target = `/admin/import?batch=${encodeURIComponent(importBatchId)}&published=1`;
    }
    revalidatePath("/admin/import");
    revalidatePath("/admin");
  } catch (error) {
    target = `/admin/import?batch=${encodeURIComponent(importBatchId)}&error=${getErrorCode(error, "publish_failed")}`;
  }

  redirect(target);
}

export async function cancelImportAction(formData: FormData) {
  const session = await requireAdminSession();
  const importBatchId = String(formData.get("batchId") ?? "");
  let target = `/admin/import?batch=${encodeURIComponent(importBatchId)}`;

  try {
    await cancelAdminImportBatch({
      importBatchId,
      adminUserId: session.user.id
    });

    revalidatePath("/admin/import");
    revalidatePath("/admin");
    target = `/admin/import?batch=${encodeURIComponent(importBatchId)}&cancelled=1`;
  } catch (error) {
    target = `/admin/import?batch=${encodeURIComponent(importBatchId)}&error=${getErrorCode(error, "cancel_failed")}`;
  }

  redirect(target);
}

function getErrorCode(error: unknown, fallback: string) {
  if (error instanceof AdminImportError) {
    return error.code;
  }

  return fallback;
}

function getErrorBatchId(error: unknown) {
  if (!(error instanceof AdminImportError)) {
    return null;
  }

  return error.details.blockingBatchId ?? error.details.duplicateBatchId ?? null;
}
