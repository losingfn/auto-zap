"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import {
  AdminImportError,
  cancelAdminImportBatch,
  createAdminDraftImportFromUpload,
  publishAdminImportBatch
} from "@/features/admin/imports";

export async function uploadImportAction(formData: FormData) {
  const session = await requireAdminSession();
  const file = formData.get("file");
  let target = "/admin/import";

  try {
    const result = await createAdminDraftImportFromUpload({
      file: file instanceof File ? file : null,
      adminUserId: session.user.id
    });

    revalidatePath("/admin/import");
    target = `/admin/import?batch=${result.importBatchId}&uploaded=1`;
  } catch (error) {
    target = `/admin/import?error=${getErrorCode(error, "analysis_failed")}`;
  }

  redirect(target);
}

export async function publishImportAction(formData: FormData) {
  const session = await requireAdminSession();
  const importBatchId = String(formData.get("batchId") ?? "");
  let target = `/admin/import?batch=${encodeURIComponent(importBatchId)}`;

  try {
    await publishAdminImportBatch({
      importBatchId,
      adminUserId: session.user.id
    });

    revalidatePath("/admin/import");
    revalidatePath("/admin");
    target = `/admin/import?batch=${encodeURIComponent(importBatchId)}&published=1`;
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
