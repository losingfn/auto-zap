"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import { env } from "@/lib/env";
import {
  AdminReviewBulkSafetyError,
  applyManualReviewCorrection,
  applyReviewGroupCorrection,
  applySelectedReviewCorrections,
  normalizeAdminReviewParams,
  publishReviewWorkspace,
  reapplyCategorizationRulesToReviewQueue,
  rollbackReviewAction,
  type AdminReviewActionFilters
} from "@/features/admin/review";

export async function resolveReviewItemAction(formData: FormData) {
  await assertSameOriginReviewAction();
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
    const result = await applyManualReviewCorrection({
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
  await assertSameOriginReviewAction();
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
      rulePattern: String(formData.get("rulePattern") ?? "").trim(),
      confirmationCount: readConfirmationCount(formData),
      expectedCount: readNumberField(formData, "expectedCount"),
      previewToken: readStringField(formData, "previewToken"),
      excludedProductIds: formData.getAll("excludedProductId").map((value) => String(value))
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
  } catch (error) {
    target = buildReviewRedirect(filters, errorParamsForBulkFailure(error, "bulk_failed"));
  }

  redirect(target);
}

export async function applySelectedReviewItemsAction(formData: FormData) {
  await assertSameOriginReviewAction();
  const session = await requireAdminSession();
  const filters = readReviewActionFilters(formData);
  let target = buildReviewRedirect(filters);

  try {
    const result = await applySelectedReviewCorrections({
      filters,
      reviewQueueIds: formData.getAll("reviewQueueId").map((value) => String(value)),
      categoryId: String(formData.get("categoryId") ?? ""),
      subcategoryId: String(formData.get("subcategoryId") ?? ""),
      adminUserId: session.user.id,
      learnRule: formData.get("learnRule") === "1",
      rulePattern: String(formData.get("rulePattern") ?? "").trim(),
      confirmationCount: readConfirmationCount(formData),
      expectedCount: readNumberField(formData, "expectedCount")
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
  } catch (error) {
    target = buildReviewRedirect(filters, errorParamsForBulkFailure(error, "bulk_failed"));
  }

  redirect(target);
}

export async function reapplyReviewRulesAction(formData: FormData) {
  await assertSameOriginReviewAction();
  const session = await requireAdminSession();
  const filters = readReviewActionFilters(formData);
  let target = buildReviewRedirect(filters);

  try {
    const result = await reapplyCategorizationRulesToReviewQueue({
      filters,
      adminUserId: session.user.id,
      confirmationCount: readConfirmationCount(formData)
    });

    revalidatePath("/admin/review");
    revalidatePath("/admin");

    const params = buildReviewSearchParams(filters);
    params.set("rulesBefore", String(result.before));
    params.set("rulesResolved", String(result.resolved));
    params.set("rulesAfter", String(result.remaining));
    target = `/admin/review?${params.toString()}`;
  } catch (error) {
    target = buildReviewRedirect(filters, errorParamsForBulkFailure(error, "rules_failed"));
  }

  redirect(target);
}

export async function undoLastReviewWorkspaceAction() {
  await assertSameOriginReviewAction();
  const session = await requireAdminSession();
  let target = "/admin/review";

  try {
    const result = await rollbackReviewAction({ adminUserId: session.user.id });
    revalidatePath("/admin/review");
    revalidatePath("/admin");
    target = `/admin/review?undone=${encodeURIComponent(result.undoneActionId)}&undoCount=${result.productCount}`;
  } catch {
    target = "/admin/review?error=undo_failed";
  }

  redirect(target);
}

export async function publishReviewWorkspaceAction() {
  await assertSameOriginReviewAction();
  const session = await requireAdminSession();
  let target = "/admin/review";

  try {
    const result = await publishReviewWorkspace({ adminUserId: session.user.id });
    revalidatePath("/admin/review");
    revalidatePath("/admin");
    target = `/admin/review?published=${encodeURIComponent(result.catalogVersionId)}&publishedCount=${result.publishedProductCount}`;
  } catch {
    target = "/admin/review?error=publish_failed";
  }

  redirect(target);
}

async function assertSameOriginReviewAction() {
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (!origin || origin === "null") {
    return;
  }

  const allowedOrigins = new Set<string>();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");

  if (host) {
    allowedOrigins.add(`${proto}://${host}`);
  }

  if (env.APP_URL) {
    allowedOrigins.add(new URL(env.APP_URL).origin);
  }

  if (!allowedOrigins.has(new URL(origin).origin)) {
    throw new Error("Cross-origin admin review action rejected.");
  }
}

function readConfirmationCount(formData: FormData) {
  const value = String(formData.get("confirmationCount") ?? "").trim();
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function readNumberField(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readStringField(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

function errorParamsForBulkFailure(error: unknown, fallback: string) {
  if (error instanceof AdminReviewBulkSafetyError) {
    const params: Record<string, string> = {
      error:
        error.code === "scope_forbidden"
          ? "bulk_scope_forbidden"
          : error.code === "count_confirmation_required"
            ? "bulk_confirmation_required"
            : error.code === "preview_stale"
              ? "bulk_preview_stale"
              : "bulk_rule_blocked"
    };

    if (error.ruleSkippedReason) {
      params.ruleSkipped = error.ruleSkippedReason;
    }

    return params;
  }

  return { error: fallback };
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
  if (filters.scope !== "workspace") params.set("scope", filters.scope);
  if (filters.issue !== "all") params.set("issue", filters.issue);
  if (filters.query) params.set("q", filters.query);
  if (filters.reason) params.set("reason", filters.reason);
  if (filters.group) params.set("group", filters.group);
  return params;
}
