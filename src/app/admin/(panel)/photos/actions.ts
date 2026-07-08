"use server";

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import { setAdminAssetActive, uploadAdminStorePhoto } from "@/features/admin/content/management";

export async function uploadStorePhotoAction(formData: FormData) {
  const session = await requireAdminSession();
  const file = formData.get("file");
  let target = "/admin/photos?saved=1";

  try {
    await uploadAdminStorePhoto({
      file: file instanceof File ? file : null,
      altText: String(formData.get("altText") ?? "").trim(),
      sortOrder: Number(formData.get("sortOrder") ?? 0),
      adminUserId: session.user.id
    });
  } catch {
    target = "/admin/photos?error=upload";
  }

  redirect(target);
}

export async function deactivateStorePhotoAction(formData: FormData) {
  const session = await requireAdminSession();
  const assetId = String(formData.get("assetId") ?? "");
  let target = "/admin/photos?disabled=1";

  try {
    await setAdminAssetActive({
      assetId,
      isActive: false,
      adminUserId: session.user.id,
      action: "content.photo.deactivate"
    });
  } catch {
    target = "/admin/photos?error=disable";
  }

  redirect(target);
}
