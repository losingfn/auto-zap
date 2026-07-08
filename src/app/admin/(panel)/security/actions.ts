"use server";

import { redirect } from "next/navigation";
import { changeAdminPassword, requireAdminSession } from "@/features/admin/auth";

export async function changePasswordAction(formData: FormData) {
  const session = await requireAdminSession();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const repeatPassword = String(formData.get("repeatPassword") ?? "");
  let target = "/admin/security?saved=1";

  try {
    if (newPassword !== repeatPassword) {
      throw new Error("Пароли не совпадают.");
    }

    await changeAdminPassword({
      adminUserId: session.user.id,
      currentSessionId: session.id,
      currentPassword,
      newPassword
    });
  } catch {
    target = "/admin/security?error=1";
  }

  redirect(target);
}
