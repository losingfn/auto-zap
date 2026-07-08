"use server";

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import { uploadAdminBrandAsset } from "@/features/admin/content/management";

const allowedKinds = new Set(["logo", "favicon", "og_image"]);

export async function uploadBrandAssetAction(formData: FormData) {
  const session = await requireAdminSession();
  const kind = String(formData.get("kind") ?? "");
  const file = formData.get("file");
  let target = "/admin/brand?saved=1";

  try {
    if (!allowedKinds.has(kind)) {
      throw new Error("Unsupported brand asset kind.");
    }

    await uploadAdminBrandAsset({
      file: file instanceof File ? file : null,
      kind: kind as "logo" | "favicon" | "og_image",
      adminUserId: session.user.id
    });
  } catch {
    target = "/admin/brand?error=1";
  }

  redirect(target);
}
