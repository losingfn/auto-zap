"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import { updateAdminProductCategory } from "@/features/admin/catalog-management";

export async function updateProductCategoryAction(formData: FormData) {
  const session = await requireAdminSession();
  const productId = String(formData.get("productId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const subcategoryId = String(formData.get("subcategoryId") ?? "");
  let target = "/admin/catalog?saved=1";

  try {
    await updateAdminProductCategory({
      productId,
      categoryId,
      subcategoryId,
      adminUserId: session.user.id
    });
    revalidatePath("/admin/catalog");
  } catch {
    target = "/admin/catalog?error=1";
  }

  redirect(target);
}
