import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogTaxonomy, defaultCategorizationRules } from "../src/config/catalog-taxonomy";
import {
  ALL_ASSORTMENT_CATEGORY_SLUG,
  ALL_PRODUCTS_SUBCATEGORY_SLUG,
  OTHER_PRODUCTS_SUBCATEGORY_SLUG,
  isHiddenPublicSubcategory,
  isPublicNavigationTaxonomyTarget,
  isPublicTaxonomyTarget
} from "../src/config/public-taxonomy";
import { buildDefaultCategorizationContext, categorizeProductName } from "../src/features/categorization/engine";
import { validateRulePattern } from "../src/features/categorization/learning";
import { normalizeProductName } from "../src/features/categorization/normalization";
import type { CategorizationResult } from "../src/features/categorization/types";
import { createAdminRedirectUrlFromParts } from "../src/middleware";
import {
  AdminImportError,
  canCancelImport,
  canCancelImportForUi,
  canCancelImportStrict,
  canPublishImport,
  isBlockingDuplicateFileImport,
  isBlockingImportDraft,
  isFinalizedImport,
  normalizeStoredImportReport
} from "../src/features/admin/imports";
import {
  buildImportCancelledRedirect,
  handleCancelImportRequest,
  isSameOriginAdminMutation
} from "../src/features/admin/import-cancel-endpoint";
import { getStaticPublicCategories } from "../src/features/catalog/data";
import { diagnoseImportDeadlock } from "../src/features/import/import-diagnostics";
import {
  selectImportBatchForAdminPage,
  type ImportStateBatch
} from "../src/features/import/import-state";
import {
  needsProductReview,
  resolveDraftProductStatus,
  resolveImportProductName
} from "../src/features/import/automation";
import { buildImportReport, buildPriceChangeReport } from "../src/features/import/report";
import { evaluateImportSafety } from "../src/features/import/safety";
import { SEARCH_INDEX_PREPARE_FAILED_MESSAGE } from "../src/features/search/indexing";
import { isAllowedPublicSearchFilter } from "../src/features/search/service";
import {
  prepareSearchIndexDocumentsWithClient,
  replaceSearchIndexDocumentsWithClient,
  SEARCH_INDEX_UID,
  swapPreparedSearchIndexWithClient,
  type SearchIndex,
  type SearchIndexClient
} from "../src/features/search/meilisearch";
import { buildSearchDocument } from "../src/features/search/documents";
import { documentMatchesQuery, rankSearchHits } from "../src/features/search/ranking";
import {
  buildProductSeoDescription,
  buildProductSeoTitle,
  buildPublicPageMetadata,
  formatSeoPrice,
  normalizeSeoText
} from "../src/features/seo/metadata";
import {
  buildCategorySuggestion,
  getReviewDiagnosticFromRows
} from "../src/features/admin/review";
import type {
  AnalyzedImportRow,
  ExistingProductSnapshot,
  ImportPreviewReport
} from "../src/features/import/types";
import type { SearchProductDocument, SearchSynonymRecord } from "../src/features/search/types";

const target = {
  categoryId: "cat-1",
  categorySlug: "filtry-i-masla",
  categoryName: "Фильтры и масла",
  subcategoryId: "sub-1",
  subcategorySlug: "maslyanye-filtry",
  subcategoryName: "Масляные фильтры"
};

run("existing product keeps category and skips review", () => {
  const context = buildDefaultCategorizationContext();
  const result = categorizeProductName("A-1 неизвестный товар", context, {
    existingProduct: {
      ...target,
      status: "active"
    }
  });

  assert.equal(result.source, "existing_product_category");
  assert.equal(result.confidence, 1);
  assert.deepEqual(result.target, target);
  assert.equal(needsProductReview(row(), result), false);
});

run("previous needs_review product does not become trusted existing category", () => {
  const context = buildDefaultCategorizationContext();
  const result = categorizeProductName("A-1 неизвестный товар", context, {
    existingProduct: {
      ...target,
      status: "needs_review"
    }
  });

  assert.notEqual(result.source, "existing_product_category");
  assert.equal(needsProductReview(row(), result), true);
});

run("existing product updates price and preserves name fallback", () => {
  const existing = new Map<string, ExistingProductSnapshot>([
    ["A-1", { shopCode: "A-1", name: "Старое название", price: 100 }]
  ]);
  const priceChanges = buildPriceChangeReport([row({ price: 125 })], existing);

  assert.equal(priceChanges.existingPriceUpdatedCount, 1);
  assert.equal(priceChanges.increasedCount, 1);
  assert.equal(priceChanges.maxIncreaseAmount, 25);
  assert.equal(resolveImportProductName(row({ name: null }), existing.get("A-1")), "Старое название");
});

run("legacy stored import report gets safe PR10 defaults", () => {
  const normalized = normalizeStoredImportReport(legacyStoredReport());

  assert.ok(normalized);
  assert.equal(normalized.priceChanges.existingWithPriceCount, 0);
  assert.equal(normalized.priceChanges.existingPriceUpdatedCount, 0);
  assert.equal(normalized.priceChanges.increasedCount, 0);
  assert.equal(normalized.priceChanges.decreasedCount, 0);
  assert.equal(normalized.priceChanges.unchangedCount, 0);
  assert.deepEqual(normalized.examples.needsReview, []);
  assert.equal(normalized.autoCategorizationPreview?.existingCategoryPreserved, 0);
  assert.equal(normalized.autoCategorizationPreview?.wouldAutoPublish, 0);
});

run("stored import report preserves new price and automation summaries", () => {
  const normalized = normalizeStoredImportReport({
    ...legacyStoredReport(),
    existingWithPriceCount: 7,
    pricesChanged: 4,
    pricesIncreased: 3,
    pricesDecreased: 1,
    pricesUnchanged: 2,
    maxIncrease: 150,
    maxDecrease: -40,
    averagePercentChange: 0.12,
    existingInherited: 5,
    newHighConfidence: 6,
    newNeedsReview: 2,
    expectedPublicCount: 9
  });

  assert.ok(normalized);
  assert.equal(normalized.priceChanges.existingWithPriceCount, 7);
  assert.equal(normalized.priceChanges.existingPriceUpdatedCount, 4);
  assert.equal(normalized.priceChanges.increasedCount, 3);
  assert.equal(normalized.priceChanges.decreasedCount, 1);
  assert.equal(normalized.priceChanges.unchangedCount, 2);
  assert.equal(normalized.priceChanges.maxIncreaseAmount, 150);
  assert.equal(normalized.priceChanges.maxDecreaseAmount, -40);
  assert.equal(normalized.priceChanges.averageChangePercent, 0.12);
  assert.equal(normalized.autoCategorizationPreview?.existingCategoryPreserved, 5);
  assert.equal(normalized.autoCategorizationPreview?.shadowHigh, 6);
  assert.equal(normalized.autoCategorizationPreview?.wouldRequireReview, 2);
  assert.equal(normalized.autoCategorizationPreview?.wouldAutoPublish, 9);
});

run("legacy import report cannot publish but can be cancelled", () => {
  const normalized = normalizeStoredImportReport(legacyStoredReport());

  assert.ok(normalized);
  assert.equal(canPublishImport("analyzed", "draft", normalized), false);
  assert.equal(canCancelImportForUi(importState({ status: "analyzed" })), true);
  assert.equal(canCancelImportForUi(importState({ status: "failed" })), true);
  assert.equal(canCancelImportForUi(importState({ status: "published", versionStatus: "active" })), false);
});

run("legacy unfinished import statuses can be cancelled", () => {
  assert.equal(canCancelImportForUi(importState({ status: "analyzed" })), true);
  assert.equal(canCancelImportForUi(importState({ status: "uploaded" })), true);
  assert.equal(canCancelImportForUi(importState({ status: "failed" })), true);
  assert.equal(canCancelImportForUi(importState({ status: "safety_blocked" })), true);
  assert.equal(canCancelImportForUi(importState({ status: "processing" })), true);
  assert.equal(canCancelImportForUi(importState({ status: "legacy_review_blocked" })), true);
  assert.equal(canCancelImport("published", "active"), false);
  assert.equal(canCancelImportForUi(importState({ status: "analyzed", versionStatus: "active" })), false);
  assert.equal(canCancelImportForUi(importState({ status: "analyzed", versionStatus: "archived" })), false);
});

run("cancelled imports do not block the next import", () => {
  assert.equal(isBlockingImportDraft(importState({ status: "analyzed" })), true);
  assert.equal(isBlockingImportDraft(importState({ status: "failed" })), true);
  assert.equal(isBlockingImportDraft(importState({ status: "cancelled" })), false);
  assert.equal(isBlockingImportDraft(importState({ status: "cancelled", versionStatus: "rolled_back" })), false);
});

run("same file hash from cancelled import does not block new upload", () => {
  assert.equal(
    isBlockingDuplicateFileImport(importState({ status: "cancelled", versionStatus: "rolled_back" })),
    false
  );
  assert.equal(isBlockingDuplicateFileImport(importState({ status: "cancelled" })), false);
});

run("same file hash from published import does not block new upload", () => {
  assert.equal(
    isBlockingDuplicateFileImport(importState({ status: "published", versionStatus: "active" })),
    false
  );
  assert.equal(
    isBlockingDuplicateFileImport(importState({ status: "published", versionStatus: "archived" })),
    false
  );
});

run("same file hash from active unfinished draft still blocks duplicate upload", () => {
  assert.equal(isBlockingDuplicateFileImport(importState({ status: "uploaded" })), true);
  assert.equal(isBlockingDuplicateFileImport(importState({ status: "analyzed" })), true);
  assert.equal(
    isBlockingDuplicateFileImport(importState({ status: "uploaded", versionStatus: "rolled_back" })),
    false
  );
  assert.equal(
    isBlockingDuplicateFileImport(importState({ status: "analyzed", versionStatus: "active" })),
    false
  );
  assert.equal(isBlockingDuplicateFileImport(importState({ status: "failed" })), false);
});

run("cancelled and rolled back draft state is no longer blocking", () => {
  const before = importState({ status: "analyzed", versionStatus: "draft" });
  const after = importState({ status: "cancelled", versionStatus: "rolled_back" });

  assert.equal(isBlockingImportDraft(before), true);
  assert.equal(canCancelImportStrict(before), true);
  assert.equal(isBlockingImportDraft(after), false);
  assert.equal(canCancelImportForUi(after), false);
});

run("active published and archived imports cannot be cancelled", () => {
  assert.equal(
    canCancelImportStrict(importState({ status: "published", versionStatus: "active" })),
    false
  );
  assert.equal(
    canCancelImportStrict(importState({ status: "analyzed", versionStatus: "archived" })),
    false
  );
  assert.equal(
    canCancelImportStrict(importState({ status: "archived", versionStatus: "draft" })),
    false
  );
});

run("admin import selection prefers hidden blocking draft over newer finalized import", () => {
  const blocking = importState({ id: "old-blocking", status: "legacy_unknown" });
  const finalized = importState({
    id: "new-finalized",
    status: "published",
    versionStatus: "active"
  });

  assert.equal(
    selectImportBatchForAdminPage({
      blockingDraft: blocking,
      recentBatches: [finalized, blocking]
    })?.id,
    "old-blocking"
  );
  assert.equal(isFinalizedImport(finalized), true);
});

run("requested import stays selected but hidden blocking draft is diagnosable", () => {
  const blocking = importState({ id: "old-blocking", status: "analyzed" });
  const finalized = importState({
    id: "new-finalized",
    status: "published",
    versionStatus: "active"
  });

  assert.equal(
    selectImportBatchForAdminPage({
      blockingDraft: blocking,
      recentBatches: [finalized, blocking],
      requestedBatch: finalized
    })?.id,
    "new-finalized"
  );
  assert.equal(
    diagnoseImportDeadlock({
      rows: [
        diagnosticRow(blocking, { isBlockingDraft: true, canCancelForUi: true, canCancelStrict: true }),
        diagnosticRow(finalized)
      ],
      selectedBatchId: "new-finalized"
    }),
    "hidden_blocking_draft"
  );
});

run("upload import_in_progress redirect carries blocking batch id", () => {
  const actionSource = readFileSync(
    new URL("../src/app/admin/(panel)/import/actions.ts", import.meta.url),
    "utf8"
  );

  assert.match(actionSource, /getErrorBatchId\(error\)/);
  assert.match(actionSource, /details\.blockingBatchId/);
  assert.match(actionSource, /batch=\$\{encodeURIComponent\(batchId\)\}&/);
});

run("blocking draft cancel availability ignores publish and legacy report state", () => {
  const legacyReport = normalizeStoredImportReport(legacyStoredReport());
  const legacyDraft = importState({ status: "legacy_unknown", report: legacyReport });

  assert.equal(canPublishImport(legacyDraft.status, legacyDraft.versionStatus, legacyReport), false);
  assert.equal(canCancelImportStrict(legacyDraft), true);
  assert.equal(canCancelImportForUi(legacyDraft), true);
});

run("diagnostic classifier identifies cancel-disabled and duplicate-only states", () => {
  assert.equal(
    diagnoseImportDeadlock({
      rows: [
        {
          id: "blocking",
          status: "legacy_unknown",
          isBlockingDraft: true,
          isDuplicateHashBlocker: false,
          canCancelForUi: false,
          canCancelStrict: true
        }
      ],
      selectedBatchId: "blocking"
    }),
    "cancel_disabled_for_blocking_draft"
  );
  assert.equal(
    diagnoseImportDeadlock({
      rows: [
        {
          id: "same-file",
          status: "uploaded",
          isBlockingDraft: false,
          isDuplicateHashBlocker: true,
          canCancelForUi: false,
          canCancelStrict: false
        }
      ],
      selectedBatchId: null
    }),
    "duplicate_hash_only"
  );
});

run("diagnostic blocker script is read-only and reports selected/blocking ids", () => {
  const source = readFileSync(
    new URL("../scripts/diagnose-import-blockers.ts", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(/);
  assert.match(source, /blockingDraftCount/);
  assert.match(source, /selectedBatchId/);
  assert.match(source, /blockingBatchId/);
  assert.match(source, /recommendedSafeAction/);
});

run("review diagnostic script is read-only and reports workspace signals", () => {
  const source = readFileSync(
    new URL("../scripts/diagnose-review.ts", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(/);
  assert.match(source, /activeVersionId/);
  assert.match(source, /reviewVersionId/);
  assert.match(source, /preparedProductCount/);
  assert.match(source, /unsafeBroadRuleCount/);
  assert.match(source, /recommendedAction/);
});

run("review workspace migration has production concurrency guards", () => {
  const source = readFileSync(
    new URL("../db/migrations/0005_review_workspaces.sql", import.meta.url),
    "utf8"
  );

  assert.match(source, /review_workspaces_one_open_source_idx/);
  assert.match(source, /status IN \('open', 'publishing'\)/);
  assert.match(source, /review_workspace_actions_preview_token_idx/);
  assert.match(source, /WHERE preview_token IS NOT NULL/);
  assert.doesNotMatch(source, /\bDELETE\s+FROM\b|\bDROP TABLE\b|\bTRUNCATE\b/i);
});

run("review workflow source has signed preview and publish guards", () => {
  const source = readFileSync(
    new URL("../src/features/admin/review.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /createHmac\("sha256", getAdminSessionSecret\(\)\)/);
  assert.match(source, /workspaceId/);
  assert.match(source, /excludedProductIds/);
  assert.match(source, /onConflictDoNothing\(\)/);
  assert.match(source, /status: "publishing"/);
  assert.match(source, /search_index\.prepare_failed/);
  assert.match(source, /search_index\.swap_failed/);
});

run("review write actions have same-origin guard", () => {
  const source = readFileSync(
    new URL("../src/app/admin/(panel)/review/actions.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /assertSameOriginReviewAction/);
  assert.match(source, /headers\(\)/);
  assert.match(source, /Cross-origin admin review action rejected/);
});

run("public taxonomy excludes fasteners category and rules", () => {
  assert.equal(getStaticPublicCategories().some((category) => category.slug === "krepezh"), false);
  assert.equal(catalogTaxonomy.some((category) => String(category.slug) === "krepezh"), false);
  assert.equal(
    defaultCategorizationRules.some((rule) => rule.categorySlug === "krepezh"),
    false
  );
  assert.equal(isPublicTaxonomyTarget("krepezh", "bolty"), false);
});

run("all assortment exposes only aggregate subcategory publicly", () => {
  const allAssortment = catalogTaxonomy.find(
    (category) => category.slug === ALL_ASSORTMENT_CATEGORY_SLUG
  );

  assert.ok(allAssortment);
  assert.equal(
    allAssortment.subcategories.some(([slug]) => slug === ALL_PRODUCTS_SUBCATEGORY_SLUG),
    true
  );
  assert.equal(
    allAssortment.subcategories.some(([slug]) => slug === OTHER_PRODUCTS_SUBCATEGORY_SLUG),
    true
  );
  assert.equal(
    isPublicTaxonomyTarget(ALL_ASSORTMENT_CATEGORY_SLUG, OTHER_PRODUCTS_SUBCATEGORY_SLUG),
    true
  );
  assert.equal(
    isHiddenPublicSubcategory(ALL_ASSORTMENT_CATEGORY_SLUG, OTHER_PRODUCTS_SUBCATEGORY_SLUG),
    true
  );
  assert.equal(
    isPublicNavigationTaxonomyTarget(ALL_ASSORTMENT_CATEGORY_SLUG, OTHER_PRODUCTS_SUBCATEGORY_SLUG),
    false
  );
  assert.equal(
    isPublicNavigationTaxonomyTarget(ALL_ASSORTMENT_CATEGORY_SLUG, ALL_PRODUCTS_SUBCATEGORY_SLUG),
    true
  );
  assert.equal(
    isAllowedPublicSearchFilter({
      categorySlug: ALL_ASSORTMENT_CATEGORY_SLUG,
      subcategorySlug: OTHER_PRODUCTS_SUBCATEGORY_SLUG
    }),
    false
  );
  assert.equal(
    isAllowedPublicSearchFilter({
      categorySlug: ALL_ASSORTMENT_CATEGORY_SLUG,
      subcategorySlug: ALL_PRODUCTS_SUBCATEGORY_SLUG
    }),
    true
  );
});

run("public SEO metadata uses absolute title canonical and Open Graph fields", () => {
  const metadata = buildPublicPageMetadata({
    title: "  Каталог   автозапчастей в Талдоме | Автозапчасти  ",
    description: "  Каталог   автозапчастей  в Талдоме.  ",
    path: "/catalog"
  });

  assert.deepEqual(metadata.title, {
    absolute: "Каталог автозапчастей в Талдоме | Автозапчасти"
  });
  assert.equal(metadata.description, "Каталог автозапчастей в Талдоме.");
  assert.equal(metadata.alternates?.canonical, "https://autozapchast-taldom.ru/catalog");
  assert.equal(metadata.openGraph?.title, "Каталог автозапчастей в Талдоме | Автозапчасти");
  assert.equal(metadata.openGraph?.description, "Каталог автозапчастей в Талдоме.");
  assert.equal(metadata.openGraph?.url, "https://autozapchast-taldom.ru/catalog");
  assert.equal(metadata.openGraph?.siteName, "Автозапчасти на Салтыкова-Щедрина");
  assert.equal(metadata.openGraph?.locale, "ru_RU");
  assert.ok(metadata.openGraph && "type" in metadata.openGraph);
  assert.equal(metadata.openGraph.type, "website");
});

run("product SEO helpers trim title by word and keep valid price only", () => {
  const title = buildProductSeoTitle(
    "Амортизатор передний усиленный газомасляный для внедорожника ВАЗ Нива комплект"
  );

  assert.equal(title.endsWith(" — купить в Талдоме | Автозапчасти"), true);
  assert.equal(title.length <= 70, true);
  assert.equal(title.includes(" undefined "), false);
  assert.equal(formatSeoPrice(12500), "12\u00A0500");
  assert.equal(formatSeoPrice(0), null);
  assert.equal(formatSeoPrice(Number.NaN), null);
  assert.match(
    buildProductSeoDescription("Амортизатор   передний", 12500),
    /Амортизатор передний по цене 12\s500 ₽/
  );
  assert.match(
    buildProductSeoDescription("Амортизатор передний", 0),
    /Уточните актуальную цену/
  );
  assert.equal(normalizeSeoText(undefined, "Каталог"), "Каталог");
  assert.equal(normalizeSeoText(Number.NaN, "Каталог"), "Каталог");
  assert.equal(normalizeSeoText(" undefined ", "Каталог"), "Каталог");
});

run("long product SEO titles preserve distinguishing tail tokens", () => {
  const leftTitle = buildProductSeoTitle(
    "Амортизатор передний усиленный газомасляный для внедорожника ВАЗ Нива левый HS-00113"
  );
  const rightTitle = buildProductSeoTitle(
    "Амортизатор передний усиленный газомасляный для внедорожника ВАЗ Нива правый HS-00114"
  );

  assert.notEqual(leftTitle, rightTitle);
  assert.equal(leftTitle.length <= 70, true);
  assert.equal(rightTitle.length <= 70, true);
  assert.equal(leftTitle.includes("Амортизатор"), true);
  assert.equal(rightTitle.includes("Амортизатор"), true);
  assert.equal(leftTitle.includes("HS-00113"), true);
  assert.equal(rightTitle.includes("HS-00114"), true);
});

run("universal fasteners fall back to hidden other-products target", () => {
  const result = categorizeProductName("B-1 Болт М8x30 DIN 933", buildDefaultCategorizationContext());

  assert.equal(result.target?.categorySlug, ALL_ASSORTMENT_CATEGORY_SLUG);
  assert.equal(result.target?.subcategorySlug, OTHER_PRODUCTS_SUBCATEGORY_SLUG);
  assert.equal(result.decisionStatus, "AUTO_READY");
  assert.equal(needsProductReview(row({ shopCode: "B-1", name: "Болт М8x30 DIN 933" }), result), false);
});

run("normalizer preserves automotive technical tokens", () => {
  const result = normalizeProductName("Лампа диодная Т10 W5W H7 12В DOT4 5W-30");

  for (const token of ["t10", "w5w", "h7", "12v", "dot4", "5w-30"]) {
    assert.ok(result.technicalTokens.includes(token), token);
  }
});

run("compressor does not match suspension spring by substring", () => {
  const result = categorizeProductName("A-2 Компрессор малый", buildDefaultCategorizationContext());

  assert.notEqual(result.target?.subcategorySlug, "ressory");
});

run("t10 bulb becomes auto-ready while broad sensor stays grouped for review", () => {
  const context = buildDefaultCategorizationContext();
  const bulb = categorizeProductName("A-3 Лампа диодная Т10 12В", context);
  const sensor = categorizeProductName("A-4 Датчик кислорода", context);

  assert.equal(bulb.target?.categorySlug, "elektrika");
  assert.equal(bulb.target?.subcategorySlug, "lampy");
  assert.equal(bulb.decisionStatus, "AUTO_READY");
  assert.equal(needsProductReview(row({ shopCode: "A-3", name: "Лампа диодная Т10 12В" }), bulb), false);
  assert.equal(sensor.target?.subcategorySlug, "datchiki");
  assert.equal(sensor.decisionStatus, "GROUP_REVIEW");
  assert.equal(needsProductReview(row({ shopCode: "A-4", name: "Датчик кислорода" }), sensor), true);
});

run("residual context families group without reopening generic fasteners", () => {
  const context = buildDefaultCategorizationContext();
  const seatBelt = categorizeProductName("A-5 Ремни безопасности 2101-07", context);
  const copperTube = categorizeProductName("A-6 Трубки медные д.5 для иномарок 50 см", context);
  const pneumaticFitting = categorizeProductName("A-7 Фурнитура наружная резьба D=6 М 20*1.5", context);
  const valveBushing = categorizeProductName("A-8 Втулки клапанов 2101-08", context);
  const heaterValve = categorizeProductName("A-9 Кран печки 2108", context);
  const genericDin = categorizeProductName("A-10 DIN912 M10*25 с внутренним шестигранником", context);

  assert.equal(seatBelt.decisionStatus, "GROUP_REVIEW");
  assert.equal(seatBelt.target?.subcategorySlug, "bezopasnost");
  assert.equal(copperTube.decisionStatus, "GROUP_REVIEW");
  assert.equal(copperTube.target?.subcategorySlug, "tormoznye-trubki");
  assert.equal(pneumaticFitting.decisionStatus, "GROUP_REVIEW");
  assert.equal(pneumaticFitting.target?.subcategorySlug, "prochaya-tormoznaya-sistema");
  assert.equal(valveBushing.decisionStatus, "AUTO_READY");
  assert.equal(valveBushing.target?.subcategorySlug, "detali-dvigatelya");
  assert.equal(heaterValve.decisionStatus, "AUTO_READY");
  assert.equal(heaterValve.target?.subcategorySlug, "ohlazhdenie");
  assert.equal(genericDin.decisionStatus, "MANUAL_REVIEW");
  assert.equal(genericDin.target, null);
});

run("confirmed residual categorization rules auto-ready only their safe examples", () => {
  const context = buildDefaultCategorizationContext();
  const rules = [
    {
      name: "power steering hoses",
      familyId: "power_steering_hoses",
      target: ["podveska", "shlangi-gur"],
      positives: [
        "ХСГ-01364 Шланг ГУР NEXT, Е-5",
        "ХСГ-01335 Шланги Гура д.16",
        "ХС-00394 Шланги ГУРа 2110 ст. обр. (2 шт)",
        "ХСГ-00979 Шланг ГУР ГАЗ-3302 Б+ сливной с након.",
        "ХСГ-00928 Шланг ГУРа Бычок",
        "ХСГ-00481 Шланг ГУР УАЗ",
        "ХСГ-00511 Трубка КАМАЗ ГУР низкого давления",
        "ХСГ-01144 Шланг ГУР УАЗ-Патриот",
        "ХСГ-01409 Шланг ГУР ГАЗ-3308 нагнетательный",
        "ХСГ-01363 Шланг ГУР Иватек дв.274"
      ],
      negatives: [
        "ХСГ-01180 Бак масляный ГУР МАЗ",
        "ХСГ-00899 Бачок масляного ГУРа ГАЗ-3302",
        "РГ-00218 Рем.к-т ГУР КАМАЗ",
        "ХСГ-00001 Штуцер шланга ГУР"
      ]
    },
    {
      name: "wheel fasteners",
      familyId: "wheel_fasteners",
      target: ["aksessuary", "shiny-i-diski"],
      positives: [
        "КГ-00771 Гайка колёс М12х1,5 ключ 19",
        "ЗЧМ-00041 Гайка колес Москвич 2140",
        "ХСГ-00121 Шпилька колес Волга 2410",
        "ХСГ-00018 Шпилька колёс ЗИЛ",
        "ХСГ-00315 Шпилька колес Зил-Бычок перед.- зад.",
        "КГ-00904 Гайка колёс 12х1.25 шестигр.",
        "КР-00409 Болт крепления запасного колеса 2108",
        "КР-00408 Болт крепления запасного колеса 2104",
        "КГ-00687 Гайка колёс 12х1,5 ключ 21 закр.",
        "КГ-00820 Гайка колёс М12х1.25"
      ],
      negatives: [
        "ХС-00190 Пыльник колес Нива",
        "К-00380 Колпачки колёс пластмасса",
        "ХСГ-00238 Прижим колес КАМАЗ",
        "ОК-00028 Ось заднего колеса"
      ]
    },
    {
      name: "heater core parts",
      familyId: "heater_cooling_parts",
      target: ["dvigatel-i-transmissiya", "ohlazhdenie"],
      positives: [
        "ДВ-00361 Кожух печки 2108",
        "ДВ-00102 Заслонка печки 2110",
        "ЗЧМ-00651 Кран печки 2141",
        "ДВ-00008 Корпус печки 2101-2105",
        "КР-00334 Печка в сборе 2108",
        "КР-00414 Печка в сборе 2110",
        "А-01669 Крышка печки 2105",
        "ЗЧМ-00528 Кран печки Москвич 2140",
        "КР-00019 Отвод печки бол.",
        "К-00321 Тяжка печки 2108"
      ],
      negatives: [
        "ИН-00626 Сопротивление печки Рено",
        "ОК-00325 Патрубок печки Ока",
        "КР-00641 К-т трубок печки Веста",
        "ИН-00644 Мотор печки Рено Логан"
      ]
    },
    {
      name: "engine valve parts",
      familyId: "engine_valves",
      target: ["dvigatel-i-transmissiya", "detali-dvigatelya"],
      positives: [
        "КГ-00081 Сухарики клапанов Волга",
        "ДВ-00629 Тарелки клапанов 2101-07",
        "ДВ-00314 Клапан 2108 выпуск.",
        "ДВ-00447 Крышка клапанов 2108 инжектор",
        "ДВ-00692 Клапаны 2101 АВТОВАЗ",
        "ДВ-00631 Клапаны 2108 SM-1500",
        "ИН-01417 К-т клапанов Дэу-Нексиа 16 кл.",
        "ДВ-00720 К-т клапанов ВАЗ 11182",
        "ЗЧМ-00461 Клапаны впускные Таврия",
        "ДВ-00439 Крышка клапанов Нива 21214"
      ],
      negatives: [
        "ИН-00623 Клапан хол. хода Рено Логан",
        "КГ-01292 Клапан обратный д.6 метал.",
        "КГ-01293 Клапан обратный д.8 метал",
        "ДВ-00001 Клапан топливный форсунки"
      ]
    },
    {
      name: "explicit fuel system",
      familyId: "fuel_system",
      target: ["dvigatel-i-transmissiya", "toplivnaya-sistema"],
      positives: [
        "ИН-01406 Форсунки Рено Логан 8 кл. длинные",
        "ДВ-00730 Штуцер топливных трубок Гранта прямой",
        "КГ-00498 Гайка топливная упорная М24",
        "ДВ-00588 Трубки топливные Нива 2131",
        "ДВ-00253 Кольцо топливное ВАЗ 2110",
        "ОК-00246 Пробка топливного бака с ключом",
        "ДВ-00771 Шланг Ларгус длинный топливный",
        "ДВ-00704 Скоба крепления форсунки Vesta",
        "КГ-00497 Гайка топливная упорная М18",
        "ДВ-00460 Трубки топливные магистральные 2108"
      ],
      negatives: [
        "ДВ-00254 Кольцо форсунки ВАЗ 2110",
        "А-02266 Стробоскоп СТ-03 бензин",
        "А-01663 Индикатор качества топливной смеси",
        "К-00913 Форсунка омывателя стекла Peugeot"
      ]
    },
    {
      name: "car audio",
      familyId: "car_audio",
      target: ["aksessuary", "prochie-aksessuary"],
      positives: [
        "А-00512 Колонки автомобильные MRM 16 см",
        "А-01304 Магнитола № 8059",
        "А-01288 Магнитола АМ7010",
        "А-00489 Колонки PIONEER 1320",
        "А-02080 Автомагнитола Eplutus СА712",
        "А-01447 Автомагнитола Eplutus CA304 24V",
        "А-00694 Автомагнитола AM Eplutus СА310",
        "А-00443 Автомагнитола МОК-4041",
        "А-00741 Колонки FV 16 см",
        "А-01507 Савбуфер SONY 121"
      ],
      negatives: [
        "А-00898 Накладка динамика 2109 левая",
        "А-01893 Кольца простав. динамиков 16 см",
        "А-00506 Накладка динамика 2107",
        "А-01891 Сетка для динамиков"
      ]
    },
    {
      name: "driver electronics",
      familyId: "driver_electronics",
      target: ["aksessuary", "prochie-aksessuary"],
      positives: [
        "А-01028 Алкотестер",
        "А-01373 Мультитроник VS 731",
        "А-01326 Антирадар Кобра",
        "А-01283 Борт. компьютер Мультитроник Х 2110",
        "А-01032 Алкотестер 3000",
        "А-01986 Антирадар Кармера GPS 330",
        "А-00835 Антирадар SHO-ME",
        "А-01282 Борт. компьютер Мультитроник ГАЗЕЛЬ",
        "А-01633 Автомобильный инвертор 12-220В",
        "А-02193 Алкотестер AD 2600"
      ],
      negatives: ["А-00001 Датчик генератора", "А-00002 Стартер инверторный стенд"]
    },
    {
      name: "specific interior",
      familyId: "interior_specific",
      target: ["kuzov-i-optika", "elementy-salona"],
      positives: [
        "А-00552 Пепельница 2105-06-09",
        "КР-00326 Обшивка пола Нива средняя",
        "КР-00319 Комплект задней обшивки 2108",
        "А-00379 Полка зад. 21099",
        "А-00236 Пепельница ВАЗ",
        "КР-00303 Обшивка перед. Нива 21213",
        "КР-00331 Комплект задней обшивки 21099",
        "А-01229 Пепельница-стакан",
        "А-00028 Полка задняя Нива",
        "А-00263 Накладка торпеды 2106"
      ],
      negatives: [
        "А-00001 Сиденье детское",
        "А-00002 Подогрев сиденья",
        "А-00003 Полка акустическая",
        "А-00004 Накладка сиденья"
      ]
    },
    {
      name: "body glass",
      familyId: "body_glass",
      target: ["kuzov-i-optika", "stekla"],
      positives: [
        "ЗЧМ-00645 Уплотнитель зад. стекла 2141",
        "О-00427 Стекло ветр. КАМАЗ",
        "О-00074 Стекло на метал. крышу УАЗ-469 боковое",
        "ОК-00273 Уплотнитель лобового стекла ОКА",
        "О-00426 Стекло ветр. УАЗ-452 полоса",
        "О-00722 Стекло-уголок зад. 2109",
        "О-00425 Стекло ветр. УАЗ-3160",
        "О-00553 Стекло ветр. ГАЗ-3307",
        "А-01509 Уплотнитель стекла 21213 низ. хром",
        "О-00903 Стекло Лада Ларгус заднее левое"
      ],
      negatives: [
        "О-00001 Стекло повторителя УАЗ",
        "О-00002 Стекло маяка",
        "О-00003 Стекло поворота 2140",
        "О-00004 Трапеция стеклоочистителя"
      ]
    },
    {
      name: "wheel caps",
      familyId: "wheel_caps",
      target: ["aksessuary", "shiny-i-diski"],
      positives: [
        "А-00001 Колпаки колесные 13 VERSACO",
        "А-00002 Колпаки колесные 14 SKS",
        "А-00003 Колпаки колесные 15 Star",
        "А-00004 Колпаки колесные 16 Jestic",
        "А-00005 Колпаки колесные 13 Гранта",
        "А-00006 Колпаки колесные 14 Логан",
        "А-00007 Колпаки колесные 15 универсальные",
        "А-00008 Колпак колеса",
        "А-00009 Колпаки декоративные колесные",
        "А-00010 Колпаки хром Волга"
      ],
      negatives: [
        "К-00380 Колпачки колёс пластмасса",
        "А-00011 Колпачок вентиля",
        "А-00012 Колпачки маслосъемные",
        "А-00013 Колпак фары"
      ]
    },
    {
      name: "wipers",
      familyId: "wiper",
      target: ["aksessuary", "prochie-aksessuary"],
      positives: [
        "ИН-01062 Трапеция стеклоочистителя Матиз",
        "К-00531 Рем.к-т стеклоочистителя Приора",
        "ЗЧМ-00611 Мотор стеклоочистителя 2140-412",
        "ИН-00198 Переключатель стеклоочистителя Дэу-Нексиа",
        "КР-00117 Трапеция стеклоочистителя Lada Largus",
        "К-00165 Гайка поводка стеклоочистителя 2101-07",
        "А-00350 Лента стеклоочистителя ХОРС 54см",
        "КР-00156 Ремкомплект трапеции стеклоочистителя 210",
        "КР-00460 Трапеция стеклоочистителя в сборе 2110",
        "А-01342 Лента стеклоочистителя Хорс 51 см"
      ],
      negatives: [
        "К-00280 Планка воздухоочистителя 2101-07",
        "ДВ-00280 Отвод воздухоочистителя 2108-09",
        "ЗЧМ-00177 Крышка воздухоочистителя 2141",
        "А-00001 Форсунка стеклоомывателя"
      ]
    },
    {
      name: "jabo",
      familyId: "body_jabo",
      target: ["kuzov-i-optika", "kuzovnye-detali"],
      positives: [
        "КР-00001 Жабо 2108",
        "КР-00002 Жабо 2110",
        "КР-00003 Жабо Приора",
        "КР-00004 Жабо Калина",
        "КР-00005 Жабо Гранта",
        "КР-00006 Жабо Нива",
        "КР-00007 Жабо Ларгус",
        "КР-00008 Жабо Веста",
        "КР-00009 Жабо УАЗ",
        "КР-00010 Жабо Газель"
      ],
      negatives: ["КР-00011 Штуцер латунь"]
    },
    {
      name: "recorders and rear cameras",
      familyId: "accessory_recorders",
      target: ["aksessuary", "prochie-aksessuary"],
      positives: [
        "А-00001 Видеорегистратор",
        "А-00002 Видеорегистратор зеркало",
        "А-00003 Видеорегистратор 2 камеры",
        "А-00004 Видеорегистратор автомобильный",
        "А-00005 Видеорегистратор Full HD",
        "А-00006 Камера заднего вида",
        "А-00007 Камера з/в",
        "А-00008 Камера заднего вида универсальная",
        "А-00009 Камера заднего вида рамка",
        "А-00010 Камера з/в врезная"
      ],
      negatives: ["А-02346 Камера М-892", "А-02347 Камера Wi-Fi", "А-00011 Камера сгорания"]
    },
    {
      name: "adhesive tapes",
      familyId: "adhesive_tapes",
      target: ["aksessuary", "prochie-aksessuary"],
      positives: [
        "А-00001 Скотч 2-х сторонний",
        "А-00002 Скотч двухсторонний 3М",
        "А-00003 Скотч прозрачный",
        "А-00004 Скотч армированный",
        "А-00005 Скотч малярный",
        "А-00006 Лента двухсторонняя",
        "А-00007 Лента клейкая",
        "А-00008 Лента клейкая декоративная",
        "А-00009 Скотч черный",
        "А-00010 Скотч упаковочный"
      ],
      negatives: [
        "А-00011 Изолента",
        "А-00350 Лента стеклоочистителя ХОРС",
        "А-00012 Лента светодиодная",
        "А-00013 Стропа"
      ]
    }
  ] as const;

  for (const rule of rules) {
    for (const title of rule.positives) {
      assertAutoReadyTarget(context, title, rule.target[0], rule.target[1], rule.name, rule.familyId);
    }

    for (const title of rule.negatives) {
      assertNotAutoReadyTarget(context, title, rule.target[0], rule.target[1], rule.name, rule.familyId);
    }
  }
});

run("other-products fallback never overrides exact automotive context", () => {
  const context = buildDefaultCategorizationContext();
  const wheelBolt = categorizeProductName("A-12 Болт колеса М12x1,5", context);
  const brakeFitting = categorizeProductName("A-13 Фитинг тормозной трубки М10", context);
  const exhaustClamp = categorizeProductName("A-14 Хомут глушителя 50 мм", context);
  const straightFitting = categorizeProductName("A-15 Фитинг прямой 8 мм", context);
  const genericClamp = categorizeProductName("A-16 Хомут 20-32 мм", context);

  assert.notEqual(wheelBolt.target?.subcategorySlug, OTHER_PRODUCTS_SUBCATEGORY_SLUG);
  assert.equal(wheelBolt.target?.categorySlug, "aksessuary");
  assert.notEqual(brakeFitting.target?.subcategorySlug, OTHER_PRODUCTS_SUBCATEGORY_SLUG);
  assert.equal(brakeFitting.target?.categorySlug, "tormoznaya-sistema");
  assert.notEqual(exhaustClamp.target?.subcategorySlug, OTHER_PRODUCTS_SUBCATEGORY_SLUG);
  assert.equal(exhaustClamp.target?.subcategorySlug, "vyhlopnaya-sistema");
  assert.equal(straightFitting.target?.categorySlug, ALL_ASSORTMENT_CATEGORY_SLUG);
  assert.equal(straightFitting.target?.subcategorySlug, OTHER_PRODUCTS_SUBCATEGORY_SLUG);
  assert.equal(genericClamp.target?.categorySlug, ALL_ASSORTMENT_CATEGORY_SLUG);
  assert.equal(genericClamp.target?.subcategorySlug, OTHER_PRODUCTS_SUBCATEGORY_SLUG);
});

run("code-only and size-only rows become do-not-publish draft products", () => {
  const context = buildDefaultCategorizationContext();
  const codeOnly = categorizeProductName("123456789", context);
  const duplicatedCode = categorizeProductName("К-00535 К-00535", context);
  const sizeOnly = categorizeProductName("M8 20мм", context);

  assert.equal(codeOnly.decisionStatus, "DO_NOT_PUBLISH");
  assert.equal(codeOnly.reviewReasonCode, "CODE_ONLY");
  assert.equal(codeOnly.target, null);
  assert.equal(duplicatedCode.decisionStatus, "DO_NOT_PUBLISH");
  assert.equal(duplicatedCode.reviewReasonCode, "CODE_ONLY");
  assert.equal(resolveDraftProductStatus(row({ name: "123456789" }), codeOnly), "invalid");
  assert.equal(sizeOnly.decisionStatus, "DO_NOT_PUBLISH");
  assert.equal(sizeOnly.reviewReasonCode, "SIZE_ONLY");
  assert.equal(resolveDraftProductStatus(row({ name: "M8 20мм" }), sizeOnly), "invalid");
});

run("slash wiper abbreviation normalizes to a safe glass-cleaner signal", () => {
  const normalized = normalizeProductName("Щетки с/о 60+55");
  const result = categorizeProductName("A-11 Щетки с/о 60+55", buildDefaultCategorizationContext());

  assert.ok(normalized.tokens.includes("стеклоочистителя"));
  assert.equal(result.target?.categorySlug, "aksessuary");
  assert.equal(result.target?.subcategorySlug, "prochie-aksessuary");
  assert.notEqual(result.target?.subcategorySlug, "ressory");
});

run("broad review rule words are rejected across casing punctuation and forms", () => {
  for (const pattern of [
    "БОЛТ",
    "гайка",
    "шайба!!!",
    "кольца",
    "комплект",
    "кронштейн",
    "трубки",
    "втулка",
    "пальцы",
    "ремкомплекты",
    "корпуса",
    "крышка",
    "датчики",
    "клапан",
    "подшипник",
    "сальники"
  ]) {
    assert.equal(validateRulePattern(pattern).ok, false, pattern);
  }

  assert.equal(validateRulePattern("болт суппорт").ok, true);
});

run("review suggestion uses contextual group instead of broad single word", () => {
  const context = buildDefaultCategorizationContext();
  const targetBySlug = new Map([
    [
      "tormoznaya-sistema/supporty",
      {
        categoryId: "cat-brakes",
        categorySlug: "tormoznaya-sistema",
        categoryName: "Тормозная система",
        subcategoryId: "sub-calipers",
        subcategorySlug: "supporty",
        subcategoryName: "Суппорты"
      }
    ]
  ]);

  const suggestion = buildCategorySuggestion(
    {
      shopCode: "ТС-1",
      name: "Болт суппорт передний",
      rawName: "Болт суппорт передний",
      suggestedCategoryId: null,
      suggestedSubcategoryId: null
    },
    context,
    targetBySlug
  );

  assert.equal(suggestion.level, "ready");
  assert.equal(suggestion.categoryId, "cat-brakes");
  assert.equal(suggestion.subcategoryId, "sub-calipers");
  assert.equal(suggestion.rulePattern, "болт суппорт");
});

run("review diagnostics count prepared excluded and manual rows", () => {
  const rows = [
    reviewDiagnosticRow({ level: "ready", currentCategoryId: null, currentSubcategoryId: null }),
    reviewDiagnosticRow({ level: "quick", workspaceItemStatus: "pending" }),
    reviewDiagnosticRow({ level: "manual", workspaceItemStatus: "excluded", conflictingSignals: ["conflict"] })
  ];
  const diagnostic = getReviewDiagnosticFromRows(rows);

  assert.equal(diagnostic.reviewProductCount, 3);
  assert.equal(diagnostic.preparedProductCount, 1);
  assert.equal(diagnostic.excludedProductCount, 1);
  assert.equal(diagnostic.missingCategoryCount, 1);
  assert.equal(diagnostic.missingSubcategoryCount, 1);
  assert.equal(diagnostic.conflictingSignalCount, 1);
  assert.equal(diagnostic.highConfidenceCount, 1);
  assert.equal(diagnostic.mediumConfidenceCount, 1);
  assert.equal(diagnostic.manualOnlyProductCount, 1);
});

run("new high-confidence product becomes active", () => {
  assert.equal(needsProductReview(row(), categorization({ confidence: 0.92 })), false);
});

run("new low-confidence product becomes needs_review", () => {
  assert.equal(needsProductReview(row(), categorization({ confidence: 0.88 })), true);
});

run("row-level review item is not publishable", () => {
  assert.equal(
    needsProductReview(row({ status: "needs_review" }), categorization({ confidence: 0.98 })),
    true
  );
});

run("missing item becomes archive candidate", () => {
  const report = buildImportReport({
    fileName: "catalog.xls",
    selectedSheetName: "Sheet1",
    sheets: [],
    rows: [row()],
    existingProducts: [
      { shopCode: "A-1", name: "Existing A", price: 100 },
      { shopCode: "B-2", name: "Existing B", price: 200 }
    ]
  });

  assert.equal(report.archivedCount, 1);
});

run("anomalous archive blocks publish", () => {
  const safety = evaluateImportSafety({
    report: report({ archivedCount: 4 }),
    activeProductCount: 10,
    draftActiveProductCount: 6,
    hasActiveVersion: true
  });

  assert.equal(safety.canPublish, false);
  assert.ok(safety.checks.some((check) => check.code === "archive_ratio" && check.status === "blocked"));
});

run("duplicate shopCode blocks publish", () => {
  const safety = evaluateImportSafety({
    report: report({ issueCounts: { duplicate_code: 1 } }),
    activeProductCount: 10,
    draftActiveProductCount: 10,
    hasActiveVersion: true
  });

  assert.equal(safety.canPublish, false);
  assert.ok(safety.checks.some((check) => check.code === "duplicate_shop_code" && check.status === "blocked"));
});

run("empty name is not published for new product", () => {
  const result = categorization({
    target: null,
    confidence: 0,
    source: "empty_name",
    needsReview: true
  });

  assert.equal(needsProductReview(row({ name: null, status: "needs_review" }), result), true);
});

run("invalid category blocks publish", () => {
  const safety = evaluateImportSafety({
    report: report(),
    activeProductCount: 10,
    draftActiveProductCount: 10,
    invalidCategoryCount: 1,
    hasActiveVersion: true
  });

  assert.equal(safety.canPublish, false);
  assert.ok(safety.checks.some((check) => check.code === "invalid_category" && check.status === "blocked"));
});

run("parallel import blocks publish", () => {
  const safety = evaluateImportSafety({
    report: report(),
    activeProductCount: 10,
    draftActiveProductCount: 10,
    hasActiveVersion: true,
    hasBlockingImport: true
  });

  assert.equal(safety.canPublish, false);
  assert.ok(safety.checks.some((check) => check.code === "no_parallel_import" && check.status === "blocked"));
});

run("admin redirect uses forwarded production origin", () => {
  const url = createAdminRedirectUrlFromParts({
    requestUrl: "http://localhost:3000/admin/import",
    pathname: "/admin/login",
    forwardedHost: "autozap.example",
    forwardedProto: "https"
  });
  url.searchParams.set("next", "/admin/import");

  assert.equal(url.origin, "https://autozap.example");
  assert.equal(url.pathname, "/admin/login");
  assert.equal(url.searchParams.get("next"), "/admin/import");
  assert.equal(url.toString().includes("localhost"), false);
});

run("search documents query filters active products and public taxonomy", () => {
  const source = readFileSync(new URL("../src/features/search/documents.ts", import.meta.url), "utf8");

  assert.match(source, /eq\(products\.status,\s*"active"\)/);
  assert.match(source, /publicTaxonomyTargetCondition/);
});

run("search t10 uses exact technical token and lamp subject", () => {
  const synonyms: SearchSynonymRecord[] = [];
  const documents = [
    searchDocument({
      id: "lamp-t10",
      shopCode: "L-1",
      shopCodeCompact: "L1",
      name: "Лампа диодная T10 12V",
      categorySlug: "elektrika",
      categoryName: "Электрика",
      subcategorySlug: "lampy",
      subcategoryName: "Лампы",
      searchText: "лампа диодная t10 12v"
    }),
    searchDocument({
      id: "lamp-w5w",
      shopCode: "L-2",
      shopCodeCompact: "L2",
      name: "Лампа W5W",
      categorySlug: "elektrika",
      categoryName: "Электрика",
      subcategorySlug: "lampy",
      subcategoryName: "Лампы",
      searchText: "лампа w5w"
    }),
    searchDocument({
      id: "tire-t1001",
      shopCode: "T1001",
      shopCodeCompact: "T1001",
      name: "Шина T1001",
      categorySlug: "aksessuary",
      categoryName: "Аксессуары",
      subcategorySlug: "shiny-i-diski",
      subcategoryName: "Шины и диски",
      searchText: "шина t1001"
    }),
    searchDocument({
      id: "tool-t10",
      shopCode: "I-1",
      shopCodeCompact: "I1",
      name: "Ключ TORX T10",
      categorySlug: "aksessuary",
      categoryName: "Аксессуары",
      subcategorySlug: "instrumenty",
      subcategoryName: "Инструменты",
      searchText: "ключ torx t10"
    })
  ];

  const lampCandidates = documents.filter((document) => documentMatchesQuery(document, "лампа t10", synonyms));
  const t10Candidates = documents.filter((document) => documentMatchesQuery(document, "t10", synonyms));
  const t10Hits = rankSearchHits(t10Candidates, "t10", synonyms);

  assert.deepEqual(lampCandidates.map((document) => document.id).sort(), ["lamp-t10", "lamp-w5w"]);
  assert.equal(t10Candidates.some((document) => document.id === "tire-t1001"), false);
  assert.equal(t10Hits[0]?.id, "lamp-t10");
});

run("other-products search document uses aggregate public URL", () => {
  const document = buildSearchDocument(
    {
      id: "other-1",
      catalogVersionId: "active",
      shopCode: "B-100",
      rawName: "Болт М8x30 DIN 933",
      name: "Болт М8x30 DIN 933",
      slug: "b-100-bolt-m8x30-din-933",
      price: 25,
      categorySlug: ALL_ASSORTMENT_CATEGORY_SLUG,
      categoryName: "Весь ассортимент",
      subcategorySlug: OTHER_PRODUCTS_SUBCATEGORY_SLUG,
      subcategoryName: "Прочие товары"
    },
    []
  );

  assert.equal(
    document.url,
    `/catalog/${ALL_ASSORTMENT_CATEGORY_SLUG}/${ALL_PRODUCTS_SUBCATEGORY_SLUG}/b-100-bolt-m8x30-din-933`
  );
  assert.match(document.searchText, /Болт М8x30 DIN 933/);
  assert.match(document.searchText, /Прочие товары/);
});

run("publish prepares search index before active DB transaction", () => {
  const source = readFileSync(
    new URL("../src/features/import/publish-service.ts", import.meta.url),
    "utf8"
  );
  const searchSyncIndex = source.indexOf("syncSearchIndexForCatalogVersion(catalogVersionId)");
  const transactionIndex = source.indexOf("db.transaction");

  assert.ok(searchSyncIndex > -1);
  assert.ok(transactionIndex > -1);
  assert.ok(searchSyncIndex < transactionIndex);
});

run("search indexing failure message keeps old search explicit", () => {
  assert.match(SEARCH_INDEX_PREPARE_FAILED_MESSAGE, /Старый поиск сохранён/);
});

run("cancel action uses stable API button instead of server action form", () => {
  const pageSource = readFileSync(
    new URL("../src/app/admin/(panel)/import/page.tsx", import.meta.url),
    "utf8"
  );
  const buttonSource = readFileSync(
    new URL("../src/app/admin/(panel)/import/import-cancel-button.tsx", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(pageSource, /action=\{cancelImportAction\}/);
  assert.match(pageSource, /ImportCancelButton/);
  assert.match(buttonSource, /fetch\(\s*`\/api\/admin\/imports\/\$\{encodeURIComponent\(batchId\)\}\/cancel`/);
  assert.match(buttonSource, /Отмена…/);
  assert.match(buttonSource, /role="alert"/);
  assert.match(buttonSource, /router\.replace/);
});

run("cancel business logic does not touch active catalog or Meilisearch", () => {
  const source = readFileSync(new URL("../src/features/admin/imports.ts", import.meta.url), "utf8");
  const cancelSource = extractFunctionSource(source, "cancelAdminImportBatch", "function validateImportFile");

  assert.match(cancelSource, /set\(\{\s*status:\s*"cancelled"\s*\}\)/s);
  assert.match(cancelSource, /status:\s*"rolled_back"/);
  assert.doesNotMatch(cancelSource, /syncSearch|Meili|meili/i);
  assert.doesNotMatch(cancelSource, /status:\s*"active"/);
});

function run(name: string, test: () => void) {
  try {
    test();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function runAsync(name: string, test: () => Promise<void>) {
  try {
    await test();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function assertAutoReadyTarget(
  context: ReturnType<typeof buildDefaultCategorizationContext>,
  title: string,
  categorySlug: string,
  subcategorySlug: string,
  label: string,
  familyId?: string
) {
  const result = categorizeProductName(title, context);
  assert.equal(result.decisionStatus, "AUTO_READY", `${label}: ${title}`);
  assert.equal(result.target?.categorySlug, categorySlug, `${label}: ${title}`);
  assert.equal(result.target?.subcategorySlug, subcategorySlug, `${label}: ${title}`);
  if (familyId) {
    assert.equal(result.familyId, familyId, `${label}: ${title}`);
  }
}

function assertNotAutoReadyTarget(
  context: ReturnType<typeof buildDefaultCategorizationContext>,
  title: string,
  categorySlug: string,
  subcategorySlug: string,
  label: string,
  familyId?: string
) {
  const result = categorizeProductName(title, context);
  assert.notDeepEqual(
    [result.decisionStatus, result.target?.categorySlug, result.target?.subcategorySlug, result.familyId],
    ["AUTO_READY", categorySlug, subcategorySlug, familyId],
    `${label}: ${title}`
  );
}

async function runSearchIndexChecks() {
  await runImportCancelEndpointChecks();

  await runAsync("failed staging add keeps active search index intact", async () => {
    const oldDocument = searchDocument({ id: "old-product", name: "Old product" });
    const newDocument = searchDocument({ id: "new-product", name: "New product" });
    const stagingIndexUid = `${SEARCH_INDEX_UID}__staging__failed-add`;
    const client = new FakeSearchIndexClient([oldDocument]);
    client.failAddForUid.add(stagingIndexUid);

    await assert.rejects(
      () =>
        replaceSearchIndexDocumentsWithClient(client, [newDocument], [], {
          expectedDocumentCount: 1,
          stagingIndexUid
        }),
      /add failed/
    );

    assert.deepEqual(getFakeIndex(client, SEARCH_INDEX_UID).documents.map((document) => document.id), [
      "old-product"
    ]);
    assert.equal(getFakeIndex(client, SEARCH_INDEX_UID).deleteAllDocumentsCount, 0);
    assert.equal(client.swaps.length, 0);
  });

  await runAsync("successful staging index swaps active search index", async () => {
    const oldDocument = searchDocument({ id: "old-product", name: "Old product" });
    const newDocuments = [
      searchDocument({ id: "new-product-1", name: "New product 1" }),
      searchDocument({ id: "new-product-2", name: "New product 2" })
    ];
    const stagingIndexUid = `${SEARCH_INDEX_UID}__staging__success`;
    const client = new FakeSearchIndexClient([oldDocument]);

    const result = await replaceSearchIndexDocumentsWithClient(client, newDocuments, [], {
      expectedDocumentCount: newDocuments.length,
      stagingIndexUid
    });

    assert.equal(result.indexUid, SEARCH_INDEX_UID);
    assert.equal(result.stagingIndexUid, stagingIndexUid);
    assert.equal(result.indexedCount, 2);
    assert.deepEqual(getFakeIndex(client, SEARCH_INDEX_UID).documents.map((document) => document.id), [
      "new-product-1",
      "new-product-2"
    ]);
    assert.deepEqual(getFakeIndex(client, stagingIndexUid).documents.map((document) => document.id), [
      "old-product"
    ]);
    assert.deepEqual(client.swaps, [[SEARCH_INDEX_UID, stagingIndexUid]]);
  });

  await runAsync("prepared staging index does not change active search until swap", async () => {
    const oldDocument = searchDocument({ id: "old-product", name: "Old product" });
    const newDocument = searchDocument({ id: "new-product", name: "New product" });
    const stagingIndexUid = `${SEARCH_INDEX_UID}__staging__prepared`;
    const client = new FakeSearchIndexClient([oldDocument]);

    const prepared = await prepareSearchIndexDocumentsWithClient(client, [newDocument], [], {
      expectedDocumentCount: 1,
      stagingIndexUid
    });

    assert.deepEqual(getFakeIndex(client, SEARCH_INDEX_UID).documents.map((document) => document.id), [
      "old-product"
    ]);
    assert.deepEqual(getFakeIndex(client, stagingIndexUid).documents.map((document) => document.id), [
      "new-product"
    ]);
    assert.equal(client.swaps.length, 0);

    await swapPreparedSearchIndexWithClient(client, prepared);

    assert.deepEqual(getFakeIndex(client, SEARCH_INDEX_UID).documents.map((document) => document.id), [
      "new-product"
    ]);
    assert.deepEqual(client.swaps, [[SEARCH_INDEX_UID, stagingIndexUid]]);
  });

  await runAsync("staging count mismatch blocks swap and keeps active search index", async () => {
    const oldDocument = searchDocument({ id: "old-product", name: "Old product" });
    const newDocument = searchDocument({ id: "new-product", name: "New product" });
    const stagingIndexUid = `${SEARCH_INDEX_UID}__staging__count-mismatch`;
    const client = new FakeSearchIndexClient([oldDocument]);
    client.statsOverrideByUid.set(stagingIndexUid, 0);

    await assert.rejects(
      () =>
        replaceSearchIndexDocumentsWithClient(client, [newDocument], [], {
          expectedDocumentCount: 1,
          stagingIndexUid
        }),
      /ожидалось 1, получено 0/
    );

    assert.deepEqual(getFakeIndex(client, SEARCH_INDEX_UID).documents.map((document) => document.id), [
      "old-product"
    ]);
    assert.equal(client.swaps.length, 0);
  });

  console.log("import automation checks passed");
}

async function runImportCancelEndpointChecks() {
  await runAsync("cancel endpoint without admin session returns unauthorized", async () => {
    let called = false;
    const response = await handleCancelImportRequest(
      cancelRequest(),
      { batchId: "batch-1" },
      {
        getSession: async () => null,
        cancelImportBatch: async () => {
          called = true;
        }
      }
    );
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "unauthorized");
    assert.equal(called, false);
  });

  await runAsync("cancel endpoint with valid session calls shared business function", async () => {
    let calledWith: { importBatchId: string; adminUserId: string } | null = null;
    const response = await handleCancelImportRequest(
      cancelRequest(),
      { batchId: "batch-1" },
      {
        getSession: async () => testSession(),
        cancelImportBatch: async (input) => {
          calledWith = input;
        }
      }
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(calledWith, { importBatchId: "batch-1", adminUserId: "admin-1" });
    assert.deepEqual(payload, {
      ok: true,
      status: "cancelled",
      redirectTo: buildImportCancelledRedirect("batch-1")
    });
  });

  await runAsync("cancel endpoint rejects cross-origin mutation", async () => {
    let called = false;
    const response = await handleCancelImportRequest(
      cancelRequest("https://evil.example"),
      { batchId: "batch-1" },
      {
        getSession: async () => testSession(),
        cancelImportBatch: async () => {
          called = true;
        }
      }
    );
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.equal(payload.ok, false);
    assert.equal(called, false);
  });

  await runAsync("cancel endpoint surfaces business errors as JSON", async () => {
    const response = await handleCancelImportRequest(
      cancelRequest(),
      { batchId: "batch-1" },
      {
        getSession: async () => testSession(),
        cancelImportBatch: async () => {
          throw new Error("database unavailable");
        },
        logger: { error: () => undefined }
      }
    );
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.message, "database unavailable");
  });

  await runAsync("cancel endpoint returns clear error for finalized import", async () => {
    const response = await handleCancelImportRequest(
      cancelRequest(),
      { batchId: "active-batch" },
      {
        getSession: async () => testSession(),
        cancelImportBatch: async () => {
          throw new AdminImportError("already_finalized", "Этот импорт уже нельзя отменить.");
        },
        logger: { error: () => undefined }
      }
    );
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "already_finalized");
    assert.equal(payload.error.message, "Этот импорт уже нельзя отменить.");
  });

  await runAsync("same-origin cancel request allows forwarded production origin", async () => {
    const request = new Request("http://127.0.0.1:3000/api/admin/imports/batch-1/cancel", {
      method: "POST",
      headers: {
        origin: "https://autozap.example",
        "x-forwarded-host": "autozap.example",
        "x-forwarded-proto": "https"
      }
    });

    assert.equal(isSameOriginAdminMutation(request), true);
  });
}

function row(overrides: Partial<AnalyzedImportRow> = {}): AnalyzedImportRow {
  return {
    sheetName: "Sheet1",
    rowNumber: 2,
    rowIndex: 1,
    rawName: "A-1 Фильтр масляный",
    stockQuantity: 1,
    price: 100,
    stockSum: 100,
    shopCode: "A-1",
    name: "Фильтр масляный",
    status: "valid",
    issues: [],
    ...overrides
  };
}

function categorization(overrides: Partial<CategorizationResult> = {}): CategorizationResult {
  return {
    target,
    matchedRule: null,
    confidence: 0.98,
    source: "strong_multi_token",
    reason: "test",
    matchedSignals: [],
    needsReview: false,
    reviewReason: null,
    ...overrides
  };
}

function reviewDiagnosticRow(overrides: {
  level: "ready" | "quick" | "manual";
  workspaceItemStatus?: string | null;
  currentCategoryId?: string | null;
  currentSubcategoryId?: string | null;
  conflictingSignals?: string[];
}) {
  return {
    suggestion: {
      level: overrides.level,
      confidence: overrides.level === "ready" ? 0.95 : overrides.level === "quick" ? 0.88 : 0,
      categoryId: overrides.level === "manual" ? null : "cat-1",
      subcategoryId: overrides.level === "manual" ? null : "sub-1",
      categoryName: overrides.level === "manual" ? null : "Категория",
      subcategoryName: overrides.level === "manual" ? null : "Подкатегория",
      explanation: "test",
      matchedSignals: [],
      conflictingSignals: overrides.conflictingSignals ?? [],
      rulePattern: null
    },
    workspaceItemStatus: overrides.workspaceItemStatus ?? null,
    currentCategoryId: "currentCategoryId" in overrides ? overrides.currentCategoryId ?? null : "cat-1",
    currentSubcategoryId: "currentSubcategoryId" in overrides ? overrides.currentSubcategoryId ?? null : "sub-1",
    name: "Товар",
    rawName: "Товар",
    shopCode: "A-1"
  };
}

function report(overrides: Partial<ImportPreviewReport> = {}): ImportPreviewReport {
  return {
    fileName: "catalog.xls",
    selectedSheetName: "Sheet1",
    sheets: [],
    totalRows: 10,
    productCandidateRows: 10,
    parsedRows: 10,
    validRows: 10,
    reviewRows: 0,
    errorRows: 0,
    skippedRows: 0,
    addedCount: 0,
    updatedCount: 10,
    archivedCount: 0,
    unchangedCount: 0,
    issueCounts: {},
    priceChanges: {
      existingWithPriceCount: 10,
      existingPriceUpdatedCount: 1,
      increasedCount: 1,
      decreasedCount: 0,
      unchangedCount: 9,
      maxIncreaseAmount: 10,
      maxIncreasePercent: 0.1,
      maxDecreaseAmount: 0,
      maxDecreasePercent: 0,
      averageChangeAmount: 1,
      averageChangePercent: 0.01
    },
    examples: {
      valid: [],
      needsReview: [],
      errors: []
    },
    autoCategorizationPreview: {
      totalProducts: 10,
      legacyMatched: 10,
      legacyNeedsReview: 0,
      existingCategoryPreserved: 10,
      shadowHigh: 10,
      shadowMedium: 0,
      shadowLow: 0,
      wouldAutoPublish: 10,
      wouldRequireReview: 0,
      highConfidence: 10,
      mediumConfidence: 0,
      lowConfidence: 0,
      needsReview: 0,
      emptyName: 0,
      averageConfidence: 0.98,
      automationPotential: 1,
      threshold: 0.92,
      sources: [],
      topUnresolvedGroups: [],
      highConfidenceExamples: [],
      lowConfidenceExamples: [],
      dangerousGroups: []
    },
    ...overrides
  };
}

function legacyStoredReport() {
  return {
    fileName: "old-catalog.xls",
    selectedSheetName: "Sheet1",
    sheets: [],
    totalRows: 10,
    productCandidateRows: 10,
    parsedRows: 10,
    validRows: 9,
    reviewRows: 1,
    errorRows: 0,
    skippedRows: 0,
    addedCount: 2,
    updatedCount: 3,
    archivedCount: 0,
    unchangedCount: 4,
    issueCounts: {}
  };
}

function searchDocument(overrides: Partial<SearchProductDocument> = {}): SearchProductDocument {
  return {
    id: "product",
    catalogVersionId: "catalog-version",
    status: "active",
    shopCode: "A-1",
    shopCodeNormalized: "a-1",
    shopCodeCompact: "a1",
    name: "Product",
    rawName: "Product",
    slug: "product",
    price: 100,
    categorySlug: "dvigatel",
    categoryName: "Двигатель",
    subcategorySlug: "filtry",
    subcategoryName: "Фильтры",
    url: "/catalog/dvigatel/filtry/product",
    searchText: "Product",
    normalizedText: "product",
    synonymText: "",
    translitText: "product",
    brandText: "",
    ...overrides
  };
}

function getFakeIndex(client: FakeSearchIndexClient, indexUid: string) {
  const index = client.indexes.get(indexUid);
  assert.ok(index, `Expected fake index ${indexUid} to exist`);
  return index;
}

function cancelRequest(origin = "https://autozap.example") {
  return new Request("https://autozap.example/api/admin/imports/batch-1/cancel", {
    method: "POST",
    headers: { origin }
  });
}

function testSession() {
  return {
    user: {
      id: "admin-1",
      email: "admin@example.com",
      fullName: "Admin",
      role: "owner" as const
    }
  };
}

function importState(overrides: Partial<ImportStateBatch> = {}): ImportStateBatch {
  return {
    id: "batch-1",
    catalogVersionId: "version-1",
    status: "analyzed",
    versionStatus: "draft",
    fileHash: "hash-1",
    report: null,
    ...overrides
  };
}

function diagnosticRow(
  state: ImportStateBatch,
  overrides: Partial<{
    isBlockingDraft: boolean;
    isDuplicateHashBlocker: boolean;
    canCancelForUi: boolean;
    canCancelStrict: boolean;
  }> = {}
) {
  return {
    id: state.id ?? "batch-1",
    status: state.status,
    isBlockingDraft: isBlockingImportDraft(state),
    isDuplicateHashBlocker: isBlockingDuplicateFileImport(state),
    canCancelForUi: canCancelImportForUi(state),
    canCancelStrict: canCancelImportStrict(state),
    ...overrides
  };
}

function extractFunctionSource(source: string, startPattern: string, endPattern: string) {
  const start = source.indexOf(startPattern);
  const end = source.indexOf(endPattern, start);
  assert.ok(start >= 0, `Missing source start ${startPattern}`);
  assert.ok(end > start, `Missing source end ${endPattern}`);

  return source.slice(start, end);
}

class FakeSearchIndexClient implements SearchIndexClient {
  readonly indexes = new Map<string, FakeSearchIndex<SearchProductDocument>>();
  readonly failAddForUid = new Set<string>();
  readonly statsOverrideByUid = new Map<string, number>();
  readonly swaps: Array<[string, string]> = [];
  readonly tasks = {
    waitForTask: async (task: unknown) => task
  };

  constructor(activeDocuments: SearchProductDocument[]) {
    this.indexes.set(SEARCH_INDEX_UID, new FakeSearchIndex(SEARCH_INDEX_UID, activeDocuments));
  }

  async getRawIndex(uid: string) {
    const index = this.indexes.get(uid);
    if (!index) {
      throw { cause: { code: "index_not_found" } };
    }

    return index;
  }

  async createIndex(uid: string) {
    const index = new FakeSearchIndex<SearchProductDocument>(uid);
    index.failOnAddMessage = this.failAddForUid.has(uid) ? "add failed" : null;
    index.statsOverride = this.statsOverrideByUid.get(uid) ?? null;
    this.indexes.set(uid, index);

    return { taskUid: `create:${uid}` };
  }

  async deleteIndex(uid: string) {
    if (!this.indexes.has(uid)) {
      throw { cause: { code: "index_not_found" } };
    }

    this.indexes.delete(uid);
    return { taskUid: `delete:${uid}` };
  }

  index<T>(uid: string): SearchIndex<T> {
    let index = this.indexes.get(uid);
    if (!index) {
      index = new FakeSearchIndex<SearchProductDocument>(uid);
      this.indexes.set(uid, index);
    }

    return index as unknown as SearchIndex<T>;
  }

  async swapIndexes(params: Array<{ indexes: [string, string] }>) {
    for (const { indexes } of params) {
      const [firstUid, secondUid] = indexes;
      const firstIndex = getFakeIndex(this, firstUid);
      const secondIndex = getFakeIndex(this, secondUid);
      const firstDocuments = firstIndex.documents;

      firstIndex.documents = secondIndex.documents;
      secondIndex.documents = firstDocuments;
      this.swaps.push([firstUid, secondUid]);
    }

    return { taskUid: "swap" };
  }
}

class FakeSearchIndex<T extends { id: string }> implements SearchIndex<T> {
  documents: T[];
  deleteAllDocumentsCount = 0;
  updateSettingsCount = 0;
  failOnAddMessage: string | null = null;
  statsOverride: number | null = null;

  constructor(readonly uid: string, documents: T[] = []) {
    this.documents = [...documents];
  }

  async updateSettings() {
    this.updateSettingsCount += 1;
    return { taskUid: `settings:${this.uid}` };
  }

  async deleteAllDocuments() {
    this.deleteAllDocumentsCount += 1;
    this.documents = [];
    return { taskUid: `delete-documents:${this.uid}` };
  }

  async addDocuments(documents: T[]) {
    if (this.failOnAddMessage) {
      throw new Error(this.failOnAddMessage);
    }

    this.documents.push(...documents);
    return { taskUid: `add-documents:${this.uid}` };
  }

  async getStats() {
    return {
      numberOfDocuments: this.statsOverride ?? this.documents.length
    };
  }
}

void runSearchIndexChecks().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
