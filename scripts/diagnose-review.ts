import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import {
  catalogVersions,
  categorizationRules,
  products,
  reviewQueue,
  reviewWorkspaceActions,
  reviewWorkspaceItems,
  reviewWorkspaces
} from "../src/db/schema";
import { getAdminReviewPageData } from "../src/features/admin/review";

const COMMON_RISK_WORDS = new Set([
  "болт",
  "гайка",
  "шайба",
  "кольцо",
  "комплект",
  "кронштейн",
  "трубка",
  "втулка",
  "палец",
  "ремкомплект",
  "корпус",
  "крышка",
  "датчик",
  "клапан",
  "подшипник",
  "сальник"
]);

async function main() {
  const data = await getAdminReviewPageData({ scope: "workspace", pageSize: "100" });
  const [
    activeRuleRows,
    nonActiveOpenReviewRows,
    workspaceRows,
    pendingActionRows,
    pendingItemRows,
    activeNeedsReviewRows,
    activeProductsRows
  ] = await Promise.all([
    db
      .select({
        id: categorizationRules.id,
        pattern: categorizationRules.pattern,
        matchType: categorizationRules.matchType,
        priority: categorizationRules.priority
      })
      .from(categorizationRules)
      .where(eq(categorizationRules.isActive, true)),
    db
      .select({
        count: sql<number>`count(*)::int`
      })
      .from(reviewQueue)
      .innerJoin(catalogVersions, eq(catalogVersions.id, reviewQueue.catalogVersionId))
      .where(
        and(
          eq(reviewQueue.status, "open"),
          inArray(catalogVersions.status, ["draft", "archived", "rolled_back"])
        )
      ),
    db
      .select({
        id: reviewWorkspaces.id,
        status: reviewWorkspaces.status,
        sourceCatalogVersionId: reviewWorkspaces.sourceCatalogVersionId,
        publishedCatalogVersionId: reviewWorkspaces.publishedCatalogVersionId,
        createdAt: reviewWorkspaces.createdAt,
        updatedAt: reviewWorkspaces.updatedAt
      })
      .from(reviewWorkspaces),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(reviewWorkspaceActions)
      .where(eq(reviewWorkspaceActions.status, "applied")),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(reviewWorkspaceItems)
      .where(eq(reviewWorkspaceItems.status, "pending")),
    data.versionContext.activeVersion
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(products)
          .where(
            and(
              eq(products.catalogVersionId, data.versionContext.activeVersion.id),
              eq(products.status, "needs_review")
            )
          )
      : Promise.resolve([{ count: 0 }]),
    data.versionContext.activeVersion
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(products)
          .where(
            and(
              eq(products.catalogVersionId, data.versionContext.activeVersion.id),
              eq(products.status, "active")
            )
          )
      : Promise.resolve([{ count: 0 }])
  ]);

  const unsafeBroadRules = activeRuleRows.filter((rule) => {
    const tokens = rule.pattern.trim().toLowerCase().replace(/ё/g, "е").split(/\s+/).filter(Boolean);
    return tokens.length === 1 && COMMON_RISK_WORDS.has(tokens[0]);
  });
  const warnings = [
    !data.versionContext.activeVersion ? "no_active_catalog_version" : null,
    data.groupsUnavailable ? "review_groups_unavailable" : null,
    activeRuleRows.length === 0 ? "no_active_categorization_rules" : null,
    unsafeBroadRules.length > 0 ? "unsafe_broad_rules_found" : null,
    Number(nonActiveOpenReviewRows[0]?.count ?? 0) > 0 ? "open_review_rows_outside_active_version" : null,
    data.summary.readyProducts === 0 && data.summary.total > 0 ? "no_ready_groups" : null
  ].filter(Boolean);

  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    activeVersionId: data.versionContext.activeVersion?.id ?? null,
    reviewVersionId: data.workspace.sourceCatalogVersionId,
    activeCatalog: {
      productCount: Number(activeProductsRows[0]?.count ?? 0),
      needsReviewCount: Number(activeNeedsReviewRows[0]?.count ?? 0),
      publishedAt: data.versionContext.activeVersion?.publishedAt ?? null
    },
    workspace: {
      id: data.workspace.id,
      status: data.workspace.status,
      preparedProductCount: data.workspace.preparedProductCount,
      excludedProductCount: data.workspace.excludedProductCount,
      actionCount: data.workspace.actionCount,
      pendingActionCount: Number(pendingActionRows[0]?.count ?? 0),
      pendingItemCount: Number(pendingItemRows[0]?.count ?? 0)
    },
    counts: {
      reviewProductCount: data.summary.total,
      readyGroupCount: data.summary.readyGroups,
      readyProductCount: data.summary.readyProducts,
      quickGroupCount: data.summary.quickGroups,
      quickProductCount: data.summary.quickProducts,
      manualOnlyProductCount: data.summary.manualProducts,
      missingCategoryCount: data.summary.missingCategory,
      missingSubcategoryCount: data.summary.missingSubcategory,
      emptyNameCount: data.summary.missingName,
      conflictingSignalCount: data.summary.conflictingProducts,
      preparedProductCount: data.summary.preparedProducts,
      excludedProductCount: data.summary.excludedProducts,
      willPublishProductCount: data.summary.willPublishProducts
    },
    reasons: data.reasonOptions,
    categorizationRules: {
      activeRuleCount: activeRuleRows.length,
      unsafeBroadRuleCount: unsafeBroadRules.length,
      unsafeBroadRules: unsafeBroadRules.slice(0, 20).map((rule) => ({
        id: rule.id,
        pattern: rule.pattern,
        matchType: rule.matchType,
        priority: rule.priority
      }))
    },
    groups: {
      proposedGroupCount: data.groups.length,
      topGroups: data.groups.slice(0, 20).map((group) => ({
        key: group.key,
        label: group.label,
        level: group.level,
        count: group.count,
        impactedProductCount: group.impactedProductCount,
        confidence: group.confidence,
        target: [group.suggestedCategoryName, group.suggestedSubcategoryName].filter(Boolean).join(" -> ") || null,
        rulePattern: group.rulePattern,
        ruleWarning: group.ruleWarning
      }))
    },
    consistency: {
      openReviewRowsOutsideActiveVersion: Number(nonActiveOpenReviewRows[0]?.count ?? 0),
      totalWorkspaceRows: workspaceRows.length,
      staleOrLegacySignals: warnings
    },
    diagnosis: warnings.length > 0 ? warnings : ["review_workspace_ready"],
    recommendedAction:
      data.summary.readyProducts > 0
        ? "Open /admin/review, preview a ready group, apply to workspace, then publish when safety checks pass."
        : "Use filters/search for manual review; no safe ready group is currently available."
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
