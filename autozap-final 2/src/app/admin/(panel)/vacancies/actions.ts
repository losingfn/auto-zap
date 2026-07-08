"use server";

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import { updateAdminVacancyContent } from "@/features/admin/content/management";

export async function updateVacancyAction(formData: FormData) {
  const session = await requireAdminSession();
  const file = formData.get("image");
  let target = "/admin/vacancies?saved=1";

  try {
    await updateAdminVacancyContent({
      input: {
        title: String(formData.get("title") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim(),
        isPublished: formData.get("isPublished") === "1"
      },
      imageFile: file instanceof File && file.size > 0 ? file : null,
      adminUserId: session.user.id
    });
  } catch {
    target = "/admin/vacancies?error=1";
  }

  redirect(target);
}
