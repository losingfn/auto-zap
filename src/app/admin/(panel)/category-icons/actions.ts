"use server";

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import { uploadAdminCategoryIcon } from "@/features/admin/content/management";

export async function uploadCategoryIconAction(formData: FormData) {
  const session = await requireAdminSession();
  const file = formData.get("file");
  const categoryId = String(formData.get("categoryId") ?? "");
  let target = "/admin/category-icons?saved=1";

  try {
    await uploadAdminCategoryIcon({
      categoryId,
      file: file instanceof File ? file : null,
      adminUserId: session.user.id
    });
  } catch {
    target = "/admin/category-icons?error=1";
  }

  redirect(target);
}
