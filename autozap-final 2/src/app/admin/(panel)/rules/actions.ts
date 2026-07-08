"use server";

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import { createAdminRule, updateAdminRule } from "@/features/admin/catalog-management";

function readRuleForm(formData: FormData) {
  return {
    pattern: String(formData.get("pattern") ?? "").trim(),
    matchType: String(formData.get("matchType") ?? "contains") as "contains" | "starts_with" | "exact" | "regex",
    categoryId: String(formData.get("categoryId") ?? ""),
    subcategoryId: String(formData.get("subcategoryId") ?? ""),
    priority: Number(formData.get("priority") ?? 100),
    isActive: formData.get("isActive") === "1"
  };
}

export async function createRuleAction(formData: FormData) {
  const session = await requireAdminSession();
  let target = "/admin/rules?saved=1";
  try {
    await createAdminRule({ ...readRuleForm(formData), adminUserId: session.user.id });
  } catch {
    target = "/admin/rules?error=generic";
  }
  redirect(target);
}

export async function updateRuleAction(formData: FormData) {
  const session = await requireAdminSession();
  let target = "/admin/rules?saved=1";
  try {
    await updateAdminRule({
      ruleId: String(formData.get("ruleId") ?? ""),
      ...readRuleForm(formData),
      adminUserId: session.user.id
    });
  } catch {
    target = "/admin/rules?error=generic";
  }
  redirect(target);
}
