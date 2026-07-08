"use server";

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import {
  createAdminVacancyContent,
  deleteAdminVacancyContent,
  updateAdminVacancyContent
} from "@/features/admin/content/management";

export async function createVacancyAction(formData: FormData) {
  const session = await requireAdminSession();
  const file = formData.get("image");
  let target = "/admin/vacancies?saved=1";

  try {
    await createAdminVacancyContent({
      input: readVacancyForm(formData),
      imageFile: file instanceof File && file.size > 0 ? file : null,
      adminUserId: session.user.id
    });
  } catch {
    target = "/admin/vacancies?error=1";
  }

  redirect(target);
}

export async function updateVacancyAction(formData: FormData) {
  const session = await requireAdminSession();
  const file = formData.get("image");
  const vacancyId = String(formData.get("vacancyId") ?? "");
  let target = "/admin/vacancies?saved=1";

  try {
    await updateAdminVacancyContent({
      vacancyId,
      input: readVacancyForm(formData),
      imageFile: file instanceof File && file.size > 0 ? file : null,
      adminUserId: session.user.id
    });
  } catch {
    target = "/admin/vacancies?error=1";
  }

  redirect(target);
}

export async function deleteVacancyAction(formData: FormData) {
  const session = await requireAdminSession();
  const vacancyId = String(formData.get("vacancyId") ?? "");
  let target = "/admin/vacancies?deleted=1";

  try {
    await deleteAdminVacancyContent({
      vacancyId,
      adminUserId: session.user.id
    });
  } catch {
    target = "/admin/vacancies?error=1";
  }

  redirect(target);
}

function readVacancyForm(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    isPublished: formData.get("isPublished") === "1",
    sortOrder: Number(formData.get("sortOrder") ?? 100)
  };
}
