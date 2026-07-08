"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import { rollbackCatalogVersion } from "@/features/admin/backups/service";

export async function rollbackCatalogVersionAction(formData: FormData) {
  const session = await requireAdminSession();
  const catalogVersionId = String(formData.get("catalogVersionId") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  let target = "/admin/backups?rolledBack=1";

  try {
    await rollbackCatalogVersion({
      catalogVersionId,
      confirmation,
      adminUserId: session.user.id
    });
    revalidatePath("/admin/backups");
    revalidatePath("/");
  } catch {
    target = "/admin/backups?error=rollback";
  }

  redirect(target);
}
