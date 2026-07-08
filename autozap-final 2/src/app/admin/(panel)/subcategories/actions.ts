"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import { createAdminSubcategory, updateAdminSubcategory } from "@/features/admin/catalog-management";

export async function createSubcategoryAction(formData: FormData) {
  const session = await requireAdminSession();
  let target = "/admin/subcategories?saved=1";
  try {
    await createAdminSubcategory({
      categoryId: String(formData.get("categoryId") ?? ""),
      name: String(formData.get("name") ?? "").trim(),
      slug: String(formData.get("slug") ?? "").trim(),
      sortOrder: Number(formData.get("sortOrder") ?? 0),
      isActive: formData.get("isActive") === "1",
      adminUserId: session.user.id
    });
    revalidatePath("/admin/subcategories");
    revalidatePath("/");
  } catch {
    target = "/admin/subcategories?error=1";
  }
  redirect(target);
}

export async function updateSubcategoryAction(formData: FormData) {
  const session = await requireAdminSession();
  let target = "/admin/subcategories?saved=1";
  try {
    await updateAdminSubcategory({
      subcategoryId: String(formData.get("subcategoryId") ?? ""),
      categoryId: String(formData.get("categoryId") ?? ""),
      name: String(formData.get("name") ?? "").trim(),
      slug: String(formData.get("slug") ?? "").trim(),
      sortOrder: Number(formData.get("sortOrder") ?? 0),
      isActive: formData.get("isActive") === "1",
      adminUserId: session.user.id
    });
    revalidatePath("/admin/subcategories");
    revalidatePath("/");
  } catch {
    target = "/admin/subcategories?error=protected";
  }
  redirect(target);
}
