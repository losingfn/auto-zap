"use server";

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import { updateAdminHoursContent } from "@/features/admin/content/management";

export async function updateHoursAction(formData: FormData) {
  const session = await requireAdminSession();
  let target = "/admin/hours?saved=1";

  try {
    const hours = Array.from({ length: 7 }, (_, index) => {
      const day = index + 1;
      return {
        dayOfWeek: day,
        opensAt: String(formData.get(`opensAt-${day}`) ?? "09:00"),
        closesAt: String(formData.get(`closesAt-${day}`) ?? "18:00"),
        isClosed: formData.get(`isClosed-${day}`) === "1"
      };
    });

    await updateAdminHoursContent(hours, session.user.id);
  } catch {
    target = "/admin/hours?error=1";
  }

  redirect(target);
}
