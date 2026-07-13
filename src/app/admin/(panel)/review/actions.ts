"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import {
  applyReviewGroupCorrection,
  applySelectedReviewCorrections,
  normalizeAdminReviewParams,
  reapplyCategorizationRulesToReviewQueue,
  type AdminReviewActionFilters
} from "@/features/admin/review";
import { applyManualCategorizationCorrection } from "@/features/categorization/learning";

export async function resolveReviewItemAction(formData: FormData) {
  const session = await requireAdminSession();
  const reviewQueueId = String(formData.get("reviewQueueId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const subcategoryId = String(formData.get("subcategoryId") ?? "");
  const learnRule = formData.get("learnRule") === "1";
  const rulePattern = String(formData.get("rulePattern") ?? "").trim();
  const filters = readReviewActionFilters(formData);
  let target = buildReviewRedirect(filters);

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

    const params = buildReviewSearchParams(filters);
    params.set("resolved", "1");
    if (result.learnedRuleId) {
      params.set("rule", "1");
    } else if (result.learnedRuleSkippedReason && result.learnedRuleSkippedReason !== "disabled") {
      params.set("ruleSkipped", result.learnedRuleSkippedReason);
    }

    target = `/admin/review?${params.toString()}`;
  } catch {
    target = buildReviewRedirect(filters, { error: "save_failed" });
  }

  redirect(target);
}

export async function applyReviewGroupAction(formData: FormData) {
  const session = await requireAdminSession();
  const filters = readReviewActionFilters(formData);
  let target = buildReviewRedirect(filters);

  try {
    const result = await applyReviewGroupCorrection({
      filters,
      categoryId: String(formData.get("categoryId") ?? ""),
      subcategoryId: String(formData.get("subcategoryId") ?? ""),
      adminUserId: session.user.id,
      learnRule: formData.get("learnRule") === "1",
      rulePattern: String(formData.get("rulePattern") ?? "").trim()
    });

    revalidatePath("/admin/review");
    revalidatePath("/admin");

    const params = buildReviewSearchParams(filters);
    params.set("bulkProcessed", String(result.processed));
    params.set("bulkRemaining", String(result.remaining));
    params.set("bulkRule", result.learnedRuleId ? "yes" : "no");
    if (result.learnedRuleId) {
      params.set("rule", "1");
    } else if (result.learnedRuleSkippedReason && result.learnedRuleSkippedReason !== "disabled") {
      params.set("ruleSkipped", result.learnedRuleSkippedReason);
    }
    target = `/admin/review?${params.toString()}`;
  } catch {
    target = buildReviewRedirect(filters, { error: "bulk_failed" });
  }

  redirect(target);
}

export async function applySelectedReviewItemsAction(formData: FormData) {
  const session = await requireAdminSession();
  const filters = readReviewActionFilters(formData);
  let target = buildReviewRedirect(filters);

  try {
    const result = await applySelectedReviewCorrections({
      reviewQueueIds: formData.getAll("reviewQueueId").map((value) => String(value)),
      categoryId: String(formData.get("categoryId") ?? ""),
      subcategoryId: String(formData.get("subcategoryId") ?? ""),
      adminUserId: session.user.id,
      learnRule: formData.get("learnRule") === "1",
      rulePattern: String(formData.get("rulePattern") ?? "").trim()
    });

    revalidatePath("/admin/review");
    revalidatePath("/admin");

    const params = buildReviewSearchParams(filters);
    params.set("bulkProcessed", String(result.processed));
    params.set("bulkRemaining", String(result.remaining));
    params.set("bulkRule", result.learnedRuleId ? "yes" : "no");
    if (result.learnedRuleId) {
      params.set("rule", "1");
    } else if (result.learnedRuleSkippedReason && result.learnedRuleSkippedReason !== "disabled") {
      params.set("ruleSkipped", result.learnedRuleSkippedReason);
    }
    target = `/admin/review?${params.toString()}`;
  } catch {
    target = buildReviewRedirect(filters, { error: "bulk_failed" });
  }

  redirect(target);
}

export async function reapplyReviewRulesAction(formData: FormData) {
  const session = await requireAdminSession();
  const filters = readReviewActionFilters(formData);
  let target = buildReviewRedirect(filters);

  try {
    const result = await reapplyCategorizationRulesToReviewQueue({
      filters,
      adminUserId: session.user.id
    });

    revalidatePath("/admin/review");
    revalidatePath("/admin");

    const params = buildReviewSearchParams(filters);
    params.set("rulesBefore", String(result.before));
    params.set("rulesResolved", String(result.resolved));
    params.set("rulesAfter", String(result.remaining));
    target = `/admin/review?${params.toString()}`;
  } catch {
    target = buildReviewRedirect(filters, { error: "rules_failed" });
  }

  redirect(target);
}

function readReviewActionFilters(formData: FormData): AdminReviewActionFilters {
  const params = normalizeAdminReviewParams({
    scope: String(formData.get("scope") ?? ""),
    issue: String(formData.get("issue") ?? ""),
    q: String(formData.get("q") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    group: String(formData.get("group") ?? "")
  });

  return {
    scope: params.scope,
    issue: params.issue,
    query: params.query,
    reason: params.reason,
    group: params.group
  };
}

function buildReviewRedirect(filters: AdminReviewActionFilters, extra?: Record<string, string>) {
  const params = buildReviewSearchParams(filters);
  for (const [key, value] of Object.entries(extra ?? {})) {
    params.set(key, value);
  }

  const search = params.toString();
  return search ? `/admin/review?${search}` : "/admin/review";
}

function buildReviewSearchParams(filters: AdminReviewActionFilters) {
  const params = new URLSearchParams();
  if (filters.scope !== "draft") params.set("scope", filters.scope);
  if (filters.issue !== "all") params.set("issue", filters.issue);
  if (filters.query) params.set("q", filters.query);
  if (filters.reason) params.set("reason", filters.reason);
  if (filters.group) params.set("group", filters.group);
  return params;
}
