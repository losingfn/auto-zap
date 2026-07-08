"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loginAdmin } from "@/features/admin/auth";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = normalizeAdminNextPath(String(formData.get("next") ?? ""));
  const headerStore = await headers();

  const result = await loginAdmin({
    email,
    password,
    ipAddress:
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip") ??
      null,
    userAgent: headerStore.get("user-agent")
  });

  if (!result.ok) {
    const params = new URLSearchParams({
      error: "invalid",
      email: email.trim(),
      next
    });

    redirect(`/admin/login?${params.toString()}`);
  }

  redirect(next);
}

function normalizeAdminNextPath(value: string) {
  if (value.startsWith("/admin") && value !== "/admin/login" && !value.startsWith("/admin/logout")) {
    return value;
  }

  return "/admin";
}
