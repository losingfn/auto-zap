"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import { createAdminCategory, updateAdminCategory } from "@/features/admin/catalog-management";

export async function createCategoryAction(formData: FormData) {
  const session = await requireAdminSession();
  let target = "/admin/categories?saved=1";
  try {
    await createAdminCategory({
      name: String(formData.get("name") ?? "").trim(),
      slug: String(formData.get("slug") ?? "").trim(),
      sortOrder: Number(formData.get("sortOrder") ?? 0),
      isActive: formData.get("isActive") === "1",
      adminUserId: session.user.id
    });
    revalidatePath("/admin/categories");
    revalidatePath("/");
  } catch {
    target = "/admin/categories?error=1";
  }
  redirect(target);
}

export async function updateCategoryAction(formData: FormData) {
  const session = await requireAdminSession();
  let target = "/admin/categories?saved=1";
  try {
    await updateAdminCategory({
      categoryId: String(formData.get("categoryId") ?? ""),
      name: String(formData.get("name") ?? "").trim(),
      slug: String(formData.get("slug") ?? "").trim(),
      sortOrder: Number(formData.get("sortOrder") ?? 0),
      isActive: formData.get("isActive") === "1",
      adminUserId: session.user.id
    });
    revalidatePath("/admin/categories");
    revalidatePath("/");
  } catch {
    target = "/admin/categories?error=protected";
  }
  redirect(target);
}
