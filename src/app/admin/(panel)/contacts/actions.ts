"use server";

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import { updateAdminContactsContent } from "@/features/admin/content/management";

export async function updateContactsAction(formData: FormData) {
  const session = await requireAdminSession();
  let target = "/admin/contacts?saved=1";

  try {
    await updateAdminContactsContent(
      {
        name: String(formData.get("name") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
        address: String(formData.get("address") ?? "").trim(),
        latitude: Number(formData.get("latitude")),
        longitude: Number(formData.get("longitude")),
        yandexMapsUrl: String(formData.get("yandexMapsUrl") ?? "").trim()
      },
      session.user.id
    );
  } catch {
    target = "/admin/contacts?error=1";
  }

  redirect(target);
}
