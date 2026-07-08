"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import { applyManualCategorizationCorrection } from "@/features/categorization/learning";

export async function resolveReviewItemAction(formData: FormData) {
  const session = await requireAdminSession();
  const reviewQueueId = String(formData.get("reviewQueueId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const subcategoryId = String(formData.get("subcategoryId") ?? "");
  const learnRule = formData.get("learnRule") === "1";
  const rulePattern = String(formData.get("rulePattern") ?? "").trim();
  let target = "/admin/review";

  try {
    const result = await applyManualCategorizationCorrection({
      reviewQueueId,
      productId,
      categoryId,
      subcategoryId,
      adminUserId: session.user.id,
      learnRule,
      rulePattern: learnRule ? rulePattern : undefined
    });

    revalidatePath("/admin/review");
    revalidatePath("/admin");

    const params = new URLSearchParams({ resolved: "1" });
    if (result.learnedRuleId) {
      params.set("rule", "1");
    } else if (result.learnedRuleSkippedReason && result.learnedRuleSkippedReason !== "disabled") {
      params.set("ruleSkipped", result.learnedRuleSkippedReason);
    }

    target = `/admin/review?${params.toString()}`;
  } catch {
    target = "/admin/review?error=save_failed";
  }

  redirect(target);
}
