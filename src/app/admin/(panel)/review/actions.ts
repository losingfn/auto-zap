"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import { env } from "@/lib/env";
import { createGroupApplyPerfLogger } from "@/lib/server/group-apply-perf";
import { applyReviewActionWithOptionalRule } from "@/features/admin/review-rule-fallback";
import {
  AdminReviewBulkSafetyError,
  applyManualReviewCorrection,
  applyReviewGroupCorrection,
  applySelectedReviewCorrections,
  getAdminReviewPrimaryData,
  normalizeAdminReviewParams,
  publishReviewWorkspace,
  rollbackReviewAction,
  type AdminReviewActionFilters,
  type IdentityReviewDecision
} from "@/features/admin/review";
import {
  cancelReviewReapplyRun,
  createReviewReapplyApplyRun,
  createReviewReapplyDryRun,
  pauseReviewReapplyRun,
  resumeReviewReapplyRun,
  rollbackReviewReapplyApplyRun
} from "@/features/admin/review-reapply";

type InlineReviewInput = {
  reviewQueueId: string;
  productId: string;
  categoryId: string;
  subcategoryId: string;
  learnRule: boolean;
  rulePattern?: string | null;
  identityDecision?: IdentityReviewDecision | null;
  skippedReviewQueueIds?: string[];
};

type InlineGroupInput = {
  reviewQueueIds: string[];
  categoryId: string;
  subcategoryId: string;
  learnRule: boolean;
  rulePattern?: string | null;
  skippedReviewQueueIds?: string[];
};

export async function confirmReviewItemInlineAction(input: InlineReviewInput) {
  await assertSameOriginReviewAction();
  const session = await requireAdminSession();

  try {
    const result = await applyManualReviewWithOptionalLearning({ ...input, adminUserId: session.user.id });
    revalidatePath("/admin/review");
    revalidatePath("/admin");
    const data = await getAdminReviewPrimaryData({
      adminUserId: session.user.id,
      createWorkspaceIfNeeded: true,
      skipReviewQueueIds: input.skippedReviewQueueIds
    });
    return {
      ok: true as const,
      data,
      ruleWasNotSaved: input.learnRule && !result.learnedRuleId
    };
  } catch (error) {
    return inlineReviewFailure(error, session.user.id, input.skippedReviewQueueIds);
  }
}

export async function confirmReviewGroupInlineAction(input: InlineGroupInput) {
  await assertSameOriginReviewAction();
  const session = await requireAdminSession();
  const reviewQueueIds = [...new Set(input.reviewQueueIds.filter(Boolean))];

  try {
    const result = await applySelectedReviewWithOptionalLearning({
      ...input,
      reviewQueueIds,
      adminUserId: session.user.id
    });
    revalidatePath("/admin/review");
    revalidatePath("/admin");
    const data = await getAdminReviewPrimaryData({
      adminUserId: session.user.id,
      createWorkspaceIfNeeded: true,
      skipReviewQueueIds: input.skippedReviewQueueIds
    });
    return {
      ok: true as const,
      data,
      processed: result.processed,
      ruleWasNotSaved: input.learnRule && !result.learnedRuleId
    };
  } catch (error) {
    return inlineReviewFailure(error, session.user.id, input.skippedReviewQueueIds);
  }
}

export async function loadNextReviewItemInlineAction(input: { skippedReviewQueueIds?: string[] } = {}) {
  await assertSameOriginReviewAction();
  const session = await requireAdminSession();
  return getAdminReviewPrimaryData({
    adminUserId: session.user.id,
    createWorkspaceIfNeeded: true,
    skipReviewQueueIds: input.skippedReviewQueueIds
  });
}

export async function undoLastReviewWorkspaceInlineAction(input: { skippedReviewQueueIds?: string[] } = {}) {
  await assertSameOriginReviewAction();
  const session = await requireAdminSession();
  try {
    await rollbackReviewAction({ adminUserId: session.user.id });
    revalidatePath("/admin/review");
    revalidatePath("/admin");
    return {
      ok: true as const,
      data: await getAdminReviewPrimaryData({
        adminUserId: session.user.id,
        createWorkspaceIfNeeded: true,
        skipReviewQueueIds: input.skippedReviewQueueIds
      })
    };
  } catch {
    return { ok: false as const, message: "Не удалось отменить последнее действие. Попробуйте ещё раз." };
  }
}

async function applyManualReviewWithOptionalLearning(
  input: InlineReviewInput & { adminUserId: string }
) {
  const apply = (learnRule: boolean) =>
    applyManualReviewCorrection({
      reviewQueueId: input.reviewQueueId,
      productId: input.productId,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      adminUserId: input.adminUserId,
      learnRule,
      rulePattern: learnRule ? input.rulePattern ?? undefined : undefined,
      identityDecision: input.identityDecision ?? null
    });
  return applyReviewActionWithOptionalRule(input.learnRule, apply, isRuleBlocked);
}

async function applySelectedReviewWithOptionalLearning(
  input: InlineGroupInput & { reviewQueueIds: string[]; adminUserId: string }
) {
  const apply = (learnRule: boolean) =>
    applySelectedReviewCorrections({
      filters: { scope: "workspace", issue: "all", query: "", reason: "", group: "" },
      reviewQueueIds: input.reviewQueueIds,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      adminUserId: input.adminUserId,
      learnRule,
      rulePattern: learnRule ? input.rulePattern ?? undefined : undefined,
      expectedCount: input.reviewQueueIds.length
    });

  return applyReviewActionWithOptionalRule(input.learnRule, apply, isRuleBlocked);
}

function isRuleBlocked(error: unknown) {
  return error instanceof AdminReviewBulkSafetyError && error.code === "rule_blocked";
}

async function inlineReviewFailure(error: unknown, adminUserId: string, skippedReviewQueueIds?: string[]) {
  if (error instanceof AdminReviewBulkSafetyError && error.code === "preview_stale") {
    return {
      ok: false as const,
      stale: true as const,
      message: "Данные товара изменились. Мы обновили карточку — проверьте её ещё раз.",
      data: await getAdminReviewPrimaryData({
        adminUserId,
        createWorkspaceIfNeeded: true,
        skipReviewQueueIds: skippedReviewQueueIds
      })
    };
  }

  return {
    ok: false as const,
    message:
      error instanceof AdminReviewBulkSafetyError && error.code === "identity_conflict_requires_manual_resolution"
        ? "Выберите, является ли это тем же товаром или новой позицией."
        : "Не удалось сохранить изменение. Попробуйте ещё раз."
  };
}

export async function resolveReviewItemAction(formData: FormData) {
  await assertSameOriginReviewAction();
  const session = await requireAdminSession();
  const reviewQueueId = String(formData.get("reviewQueueId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const subcategoryId = String(formData.get("subcategoryId") ?? "");
  const learnRule = formData.get("learnRule") === "1";
  const rulePattern = String(formData.get("rulePattern") ?? "").trim();
  const identityDecision = readIdentityReviewDecision(formData.get("identityDecision"));
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
      rulePattern: learnRule ? rulePattern : undefined,
      identityDecision
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
  } catch (error) {
    target = buildReviewRedirect(filters, {
      error:
        error instanceof AdminReviewBulkSafetyError &&
        error.code === "identity_conflict_requires_manual_resolution"
          ? "identity_conflict"
          : "save_failed"
    });
  }

  redirect(target);
}

export async function applyReviewGroupAction(formData: FormData) {
  const perf = createGroupApplyPerfLogger();
  const groupId = String(formData.get("group") ?? "").trim();
  perf?.setGroupId(groupId);
  perf?.measureSync("request_received", { category: "other" }, () => undefined);
  if (perf) {
    await perf.measure("request_origin_validation", { category: "other" }, assertSameOriginReviewAction);
  } else {
    await assertSameOriginReviewAction();
  }
  const session = perf
    ? await perf.measure("auth_session_validation", { category: "other" }, requireAdminSession)
    : await requireAdminSession();
  const input = perf
    ? perf.measureSync("input_validation", { category: "other" }, () => readGroupApplyInput(formData))
    : readGroupApplyInput(formData);
  const filters = input.filters;
  let target = buildReviewRedirect(filters);

  try {
    const result = await applyReviewGroupCorrection({
      filters,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      adminUserId: session.user.id,
      learnRule: input.learnRule,
      rulePattern: input.rulePattern,
      confirmationCount: input.confirmationCount,
      expectedCount: input.expectedCount,
      previewToken: input.previewToken,
      excludedProductIds: input.excludedProductIds,
      groupApplyPerf: perf
    });

    const revalidate = () => {
      revalidatePath("/admin/review");
      revalidatePath("/admin");
    };
    if (perf) {
      perf.measureSync("revalidation", { category: "revalidation" }, revalidate);
    } else {
      revalidate();
    }

    target = perf
      ? perf.measureSync("response_prepare", { category: "other", itemCount: result.processed }, () => buildGroupApplySuccessTarget(filters, result))
      : buildGroupApplySuccessTarget(filters, result);
    perf?.complete({ itemCount: result.processed, result: "success" });
  } catch (error) {
    perf?.fail(groupApplyLogError(error));
    target = buildReviewRedirect(filters, errorParamsForBulkFailure(error, "bulk_failed"));
  }

  redirect(target);
}

function readGroupApplyInput(formData: FormData) {
  return {
    filters: readReviewActionFilters(formData),
    categoryId: String(formData.get("categoryId") ?? ""),
    subcategoryId: String(formData.get("subcategoryId") ?? ""),
    learnRule: formData.get("learnRule") === "1",
    rulePattern: String(formData.get("rulePattern") ?? "").trim(),
    confirmationCount: readConfirmationCount(formData),
    expectedCount: readNumberField(formData, "expectedCount"),
    previewToken: readStringField(formData, "previewToken"),
    excludedProductIds: formData.getAll("excludedProductId").map((value) => String(value))
  };
}

function buildGroupApplySuccessTarget(
  filters: AdminReviewActionFilters,
  result: {
    processed: number;
    remaining: number;
    learnedRuleId: string | null;
    learnedRuleSkippedReason: string | null;
  }
) {
  const params = buildReviewSearchParams(filters);
  params.set("bulkProcessed", String(result.processed));
  params.set("bulkRemaining", String(result.remaining));
  params.set("bulkRule", result.learnedRuleId ? "yes" : "no");
  if (result.learnedRuleId) {
    params.set("rule", "1");
  } else if (result.learnedRuleSkippedReason && result.learnedRuleSkippedReason !== "disabled") {
    params.set("ruleSkipped", result.learnedRuleSkippedReason);
  }
  return `/admin/review?${params.toString()}`;
}

function groupApplyLogError(error: unknown) {
  if (error instanceof AdminReviewBulkSafetyError) {
    return { errorCode: error.code, safeMessage: error.message };
  }

  return {
    errorCode: "group_apply_failed",
    safeMessage: "Не удалось выполнить массовое действие."
  };
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

export async function createReviewReapplyDryRunAction() {
  await assertSameOriginReviewAction();
  const session = await requireAdminSession();
  let target = "/admin/review";

  try {
    const run = await createReviewReapplyDryRun({ adminUserId: session.user.id });

    revalidatePath("/admin/review");
    revalidatePath("/admin");

    target = `/admin/review?reapplyRun=${encodeURIComponent(run?.id ?? "")}&reapply=created`;
  } catch {
    target = "/admin/review?error=reapply_failed";
  }

  redirect(target);
}

export async function createReviewReapplyApplyRunAction(formData: FormData) {
  await assertSameOriginReviewAction();
  const session = await requireAdminSession();
  const dryRunId = readStringField(formData, "dryRunId");
  let target = "/admin/review";

  try {
    if (!dryRunId) throw new Error("Dry-run не выбран.");
    const run = await createReviewReapplyApplyRun({
      dryRunId,
      adminUserId: session.user.id
    });

    revalidatePath("/admin/review");
    revalidatePath("/admin");
    target = `/admin/review?reapplyRun=${encodeURIComponent(run?.id ?? "")}&reapply=apply_created`;
  } catch {
    target = "/admin/review?error=reapply_failed";
  }

  redirect(target);
}

export async function pauseReviewReapplyRunAction(formData: FormData) {
  await assertSameOriginReviewAction();
  await requireAdminSession();
  await pauseReviewReapplyRun(readStringField(formData, "runId") ?? "");
  revalidatePath("/admin/review");
  redirect("/admin/review?reapply=paused");
}

export async function resumeReviewReapplyRunAction(formData: FormData) {
  await assertSameOriginReviewAction();
  await requireAdminSession();
  await resumeReviewReapplyRun(readStringField(formData, "runId") ?? "");
  revalidatePath("/admin/review");
  redirect("/admin/review?reapply=resumed");
}

export async function cancelReviewReapplyRunAction(formData: FormData) {
  await assertSameOriginReviewAction();
  await requireAdminSession();
  await cancelReviewReapplyRun(readStringField(formData, "runId") ?? "");
  revalidatePath("/admin/review");
  redirect("/admin/review?reapply=cancelled");
}

export async function rollbackReviewReapplyRunAction(formData: FormData) {
  await assertSameOriginReviewAction();
  const session = await requireAdminSession();
  await rollbackReviewReapplyApplyRun({
    runId: readStringField(formData, "runId") ?? "",
    adminUserId: session.user.id
  });
  revalidatePath("/admin/review");
  revalidatePath("/admin");
  redirect("/admin/review?reapply=rolled_back");
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

function readIdentityReviewDecision(value: FormDataEntryValue | null) {
  return value === "same" || value === "new" ? value : null;
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
            : error.code === "identity_conflict_requires_manual_resolution"
              ? "identity_conflict"
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
