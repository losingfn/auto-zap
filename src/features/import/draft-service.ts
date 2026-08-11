import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  categories,
  catalogVersions,
  importBatches,
  importErrors,
  importRows,
  productIdentities,
  products,
  reviewQueue,
  subcategories
} from "@/db/schema";
import { getCategorizationConfidenceBucket, normalizeForCategorization } from "@/features/categorization/engine";
import { getCategorizationContext } from "@/features/categorization/repository";
import {
  AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD,
  type CategorizationResult,
  type CategorizationSource,
} from "@/features/categorization/types";
import { buildProductSearchText } from "@/features/search/documents";
import { getSearchSynonyms } from "@/features/search/synonyms";
import type { SearchSynonymRecord } from "@/features/search/types";
import { slugify } from "@/lib/slug";
import type { ImportPerfLogger } from "@/lib/server/import-perf";
import { analyzeImportFile } from "./analyze";
import { needsProductReview, resolveDraftProductStatus, resolveImportProductName } from "./automation";
import {
  createDraftClassificationRun,
  isImportProductCandidate,
  type DraftClassificationRun
} from "./draft-classification";
import {
  buildIdentityConflictReason,
  createProductIdentityResolutionRun,
  type ProductIdentityResolutionRun
} from "./product-identity-resolver";
import { evaluateImportSafety } from "./safety";
import type {
  AnalyzedImportRow,
  AutoCategorizationDecisionPreview,
  AutoCategorizationGroupPreview,
  ExistingProductSnapshot
} from "./types";

export interface CreateDraftImportInput {
  filePath: string;
  fileBuffer?: Buffer | Uint8Array;
  sourceFileName: string;
  fileHash?: string;
  uploadedBy?: string;
  storagePath?: string;
  perf?: ImportPerfLogger;
}

export interface CreateDraftImportResult {
  catalogVersionId: string;
  importBatchId: string;
  report: ReturnType<typeof analyzeImportFile>["report"];
}

export async function createDraftImport(
  input: CreateDraftImportInput
): Promise<CreateDraftImportResult> {
  const perf = input.perf;
  const prepared = perf
    ? await perf.measure("prepare_input_data", async () => {
        const existingProducts = await getActiveProducts();
        const [categorizationContext, searchSynonyms] = await Promise.all([
          getCategorizationContext(),
          getSearchSynonyms()
        ]);
        return { existingProducts, categorizationContext, searchSynonyms };
      })
    : {
        existingProducts: await getActiveProducts(),
        ...(await Promise.all([getCategorizationContext(), getSearchSynonyms()]).then(
          ([categorizationContext, searchSynonyms]) => ({ categorizationContext, searchSynonyms })
        ))
      };
  const analysis = perf
    ? await perf.measure(
        "parse_excel",
        () =>
          analyzeImportFile(input.filePath, {
            existingProducts: prepared.existingProducts,
            fileBuffer: input.fileBuffer,
            fileName: input.sourceFileName
          }),
        { rows: (value) => value.rows.length }
      )
    : analyzeImportFile(input.filePath, {
        existingProducts: prepared.existingProducts,
        fileBuffer: input.fileBuffer,
        fileName: input.sourceFileName
      });
  const identityResolutionRun = createProductIdentityResolutionRun({
    rows: analysis.rows,
    existingProducts: prepared.existingProducts
  });
  const identityConflictRows = new Set(
    analysis.rows.filter((row) => identityResolutionRun.isIdentityConflict(row))
  );
  const classificationRows = perf
    ? analysis.rows.filter(isImportProductCandidate).length
    : undefined;
  const classificationObserver = perf?.createClassificationObserver();
  let classificationRun: DraftClassificationRun;

  try {
    classificationRun = perf
      ? await perf.measure(
          "classification",
          () =>
            createDraftClassificationRun({
              rows: analysis.rows,
              categorizationContext: prepared.categorizationContext,
              existingProducts: prepared.existingProducts,
              identityConflictRows,
              observer: classificationObserver
            }),
          { rows: classificationRows }
        )
      : createDraftClassificationRun({
          rows: analysis.rows,
          categorizationContext: prepared.categorizationContext,
          existingProducts: prepared.existingProducts,
          identityConflictRows
        });
    await classificationObserver?.log("success");
  } catch (error) {
    await classificationObserver?.log("error");
    throw error;
  }

  const reportMeasurement = perf?.start();
  let reportStatus: "success" | "error" = "success";
  let report: ReturnType<typeof analyzeImportFile>["report"];

  try {
    const categorizationSummary = buildCategorizationSummary(
      analysis.rows,
      classificationRun,
      identityConflictRows
    );
    const autoCategorizationPreview = perf
      ? await perf.measure(
          "create_preview",
          () => buildAutoCategorizationPreview(analysis.rows, classificationRun, identityConflictRows),
          { rows: classificationRows }
        )
      : buildAutoCategorizationPreview(analysis.rows, classificationRun, identityConflictRows);
    report = withCategorizationReport(
      analysis.report,
      categorizationSummary,
      autoCategorizationPreview,
      prepared.existingProducts
    );
  } catch (error) {
    reportStatus = "error";
    throw error;
  } finally {
    if (perf && reportMeasurement) {
      await perf.finish("create_report", reportMeasurement, {
        rows: classificationRows,
        status: reportStatus
      });
    }
  }

  const createDraft = () => db.transaction(async (tx) => {
    const [version] = await tx
      .insert(catalogVersions)
      .values({
        status: "draft",
        sourceFileName: input.sourceFileName,
        sourceFileHash: input.fileHash,
        totalRows: report.totalRows,
        parsedRows: report.parsedRows,
        addedCount: report.addedCount,
        updatedCount: report.updatedCount,
        archivedCount: report.archivedCount,
        reviewCount: report.reviewRows,
        errorCount: report.errorRows,
        createdBy: input.uploadedBy
      })
      .returning({ id: catalogVersions.id });

    const [batch] = await tx
      .insert(importBatches)
      .values({
        catalogVersionId: version.id,
        status: "analyzed",
        sourceFileName: input.sourceFileName,
        storagePath: input.storagePath,
        fileHash: input.fileHash,
        uploadedBy: input.uploadedBy,
        report,
        analyzedAt: new Date()
      })
      .returning({ id: importBatches.id });

    await insertImportRows(tx, batch.id, analysis.rows, perf);
    await insertImportErrors(tx, batch.id, analysis.rows);
    await insertDraftProducts(
      tx,
      version.id,
      analysis.rows,
      classificationRun,
      prepared.searchSynonyms,
      prepared.existingProducts,
      identityResolutionRun,
      perf
    );

    return {
      catalogVersionId: version.id,
      importBatchId: batch.id,
      report
    };
  });

  return perf
    ? perf.measure("draft_transaction", createDraft, { rows: analysis.rows.length })
    : createDraft();
}

async function getActiveProducts(): Promise<ExistingProductSnapshot[]> {
  const [activeVersion] = await db
    .select({ id: catalogVersions.id })
    .from(catalogVersions)
    .where(eq(catalogVersions.status, "active"))
    .orderBy(desc(catalogVersions.publishedAt))
    .limit(1);

  if (!activeVersion) {
    return [];
  }

  const rows = await db
    .select({
      productIdentityId: products.productIdentityId,
      shopCode: products.shopCode,
      name: products.name,
      price: products.price,
      categoryId: products.categoryId,
      categorySlug: categories.slug,
      categoryName: categories.name,
      subcategoryId: products.subcategoryId,
      subcategorySlug: subcategories.slug,
      subcategoryName: subcategories.name,
      status: products.status
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(subcategories, eq(subcategories.id, products.subcategoryId))
    .where(and(eq(products.catalogVersionId, activeVersion.id), eq(products.status, "active")));

  return rows.map((row) => ({
    productIdentityId: row.productIdentityId,
    shopCode: row.shopCode,
    name: row.name,
    price: Number(row.price),
    categoryId: row.categoryId,
    categorySlug: row.categorySlug,
    categoryName: row.categoryName,
    subcategoryId: row.subcategoryId,
    subcategorySlug: row.subcategorySlug,
    subcategoryName: row.subcategoryName,
    status: row.status
  }));
}

async function insertImportRows(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  importBatchId: string,
  rows: AnalyzedImportRow[],
  perf?: ImportPerfLogger
) {
  const values = rows
    .filter((row) => row.status !== "skipped")
    .map((row) => ({
      importBatchId,
      rowNumber: row.rowNumber,
      rawName: row.rawName,
      parsedShopCode: row.shopCode,
      parsedName: row.name,
      stockQuantity: toNumericString(row.stockQuantity),
      price: toNumericString(row.price),
      stockSum: toNumericString(row.stockSum),
      validationStatus: row.status,
      errorMessages: row.issues
    }));

  const insertRows = async () => {
    for (const chunk of chunked(values, 1000)) {
      if (chunk.length > 0) {
        await tx.insert(importRows).values(chunk);
      }
    }
  };

  return perf
    ? perf.measure("insert_import_rows", insertRows, { rows: values.length })
    : insertRows();
}

async function insertImportErrors(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  importBatchId: string,
  rows: AnalyzedImportRow[]
) {
  const values = rows.flatMap((row) =>
    row.issues
      .filter(() => row.status === "error")
      .map((issue) => ({
        importBatchId,
        rowNumber: row.rowNumber,
        fieldName: issue.field,
        code: issue.code,
        message: issue.message
      }))
  );

  for (const chunk of chunked(values, 1000)) {
    if (chunk.length > 0) {
      await tx.insert(importErrors).values(chunk);
    }
  }
}

async function insertDraftProducts(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  catalogVersionId: string,
  rows: AnalyzedImportRow[],
  classificationRun: DraftClassificationRun,
  searchSynonyms: SearchSynonymRecord[],
  existingProducts: ExistingProductSnapshot[],
  identityResolutionRun: ProductIdentityResolutionRun,
  perf?: ImportPerfLogger
) {
  const existingByCode = buildExistingByCode(existingProducts);
  const productRows = rows.filter(
    (row) =>
      row.shopCode &&
      row.price !== null &&
      (row.status === "valid" || row.status === "needs_review")
  );

  const insertProducts = async () => {
    for (const chunk of chunked([...identityResolutionRun.newProductIdentityIds], 1000)) {
      if (chunk.length > 0) {
        await tx.insert(productIdentities).values(chunk.map((id) => ({ id })));
      }
    }

    for (const chunk of chunked(productRows, 1000)) {
      if (chunk.length === 0) {
        continue;
      }

      const categorizedChunk = chunk.map((row) => {
        const identityResolution = identityResolutionRun.resolutionFor(row);
        if (!identityResolution) {
          throw new Error(`Не удалось определить постоянную identity для артикула ${row.shopCode}.`);
        }

        return {
          row,
          categorization: classificationRun.categorizationFor(row)!,
          identityResolution
        };
      });

      const inserted = await tx
        .insert(products)
        .values(
          categorizedChunk.map(({ row, categorization, identityResolution }) => {
            const hasIdentityConflict = identityResolution.kind === "conflict";
            const status = resolveDraftProductStatus(row, categorization, {
              requiresIdentityReview: hasIdentityConflict
            });
            const productName = resolveImportProductName(
              row,
              existingByCode.get(row.shopCode!)
            );
            const reviewReason =
              hasIdentityConflict
                ? buildIdentityConflictReason(row, identityResolution)
                : status === "needs_review" || status === "invalid"
                ? buildReviewReason(row, categorization)
                : null;

            return {
              catalogVersionId,
              productIdentityId:
                identityResolution.kind === "conflict"
                  ? null
                  : identityResolution.productIdentityId,
              shopCode: row.shopCode!,
              rawName: row.rawName,
              name: productName,
              slug: slugify(`${row.shopCode}-${productName}`),
              price: toNumericString(row.price)!,
              stockQuantity: toNumericString(row.stockQuantity),
              stockSum: toNumericString(row.stockSum),
              categoryId: categorization.target?.categoryId,
              subcategoryId: categorization.target?.subcategoryId,
              status,
              reviewReason,
              searchText: buildProductSearchText({
                shopCode: row.shopCode!,
                name: productName,
                rawName: row.rawName,
                categoryName: categorization.target?.categoryName,
                subcategoryName: categorization.target?.subcategoryName,
                synonyms: searchSynonyms
              })
            };
          })
        )
        .returning({
          id: products.id,
          shopCode: products.shopCode
        });

      const insertedByCode = new Map(inserted.map((row) => [row.shopCode, row.id]));
      const reviewValues = categorizedChunk
        .filter(
          ({ row, categorization, identityResolution }) =>
            identityResolution.kind === "conflict" || needsProductReview(row, categorization)
        )
        .map(({ row, categorization, identityResolution }) => ({
          catalogVersionId,
          productId: insertedByCode.get(row.shopCode!),
          identityCandidateId:
            identityResolution.kind === "conflict"
              ? identityResolution.existingProductIdentityId
              : null,
          reason:
            identityResolution.kind === "conflict"
              ? buildIdentityConflictReason(row, identityResolution)
              : buildReviewReason(row, categorization) || "Товар требует проверки.",
          suggestedCategoryId: categorization.target?.categoryId,
          suggestedSubcategoryId: categorization.target?.subcategoryId
        }))
        .filter(
          (
            row
          ): row is {
            catalogVersionId: string;
            productId: string;
            identityCandidateId: string | null;
            reason: string;
            suggestedCategoryId: string | undefined;
            suggestedSubcategoryId: string | undefined;
          } => Boolean(row.productId)
        );

      if (reviewValues.length > 0) {
        if (perf) {
          await perf.measure("insert_review_queue", () => tx.insert(reviewQueue).values(reviewValues), {
            rows: reviewValues.length
          });
        } else {
          await tx.insert(reviewQueue).values(reviewValues);
        }
      }
    }
  };

  return perf
    ? perf.measure("insert_products", insertProducts, { rows: productRows.length })
    : insertProducts();
}

function buildCategorizationSummary(
  rows: AnalyzedImportRow[],
  classificationRun: DraftClassificationRun,
  identityConflictRows: ReadonlySet<AnalyzedImportRow>
) {
  let matchedRows = 0;
  let unmatchedRows = 0;
  let combinedReviewRows = 0;

  for (const row of rows) {
    if (!row.shopCode || row.price === null || row.status === "error" || row.status === "skipped") {
      continue;
    }

    const categorization = classificationRun.categorizationFor(row)!;
    if (categorization.target) {
      matchedRows += 1;
    } else {
      unmatchedRows += 1;
    }

    if (identityConflictRows.has(row) || needsProductReview(row, categorization)) {
      combinedReviewRows += 1;
    }
  }

  return {
    matchedRows,
    unmatchedRows,
    combinedReviewRows,
    ruleCount: classificationRun.ruleCount
  };
}

function withCategorizationReport(
  report: ReturnType<typeof analyzeImportFile>["report"],
  categorizationSummary: ReturnType<typeof buildCategorizationSummary>,
  autoCategorizationPreview: ReturnType<typeof buildAutoCategorizationPreview>,
  existingProducts: ExistingProductSnapshot[]
) {
  const activeProductCount = existingProducts.filter((product) => product.status === "active").length;
  const safety = evaluateImportSafety({
    report: {
      ...report,
      reviewRows: categorizationSummary.combinedReviewRows,
      autoCategorizationPreview
    },
    activeProductCount,
    draftActiveProductCount: autoCategorizationPreview.wouldAutoPublish,
    invalidCategoryCount: 0,
    hasActiveVersion: existingProducts.length > 0,
    hasBlockingImport: false
  });

  return {
    ...report,
    reviewRows: categorizationSummary.combinedReviewRows,
    categorization: {
      matchedRows: categorizationSummary.matchedRows,
      unmatchedRows: categorizationSummary.unmatchedRows,
      activeRules: categorizationSummary.ruleCount
    },
    autoCategorizationPreview,
    safety
  };
}

function buildAutoCategorizationPreview(
  rows: AnalyzedImportRow[],
  classificationRun: DraftClassificationRun,
  identityConflictRows: ReadonlySet<AnalyzedImportRow> = new Set()
) {
  const sourceCounts = new Map<CategorizationSource, number>();
  const unresolvedGroups = new Map<string, AutoCategorizationGroupPreview>();
  const dangerousGroups = new Map<string, AutoCategorizationGroupPreview>();
  const highConfidenceExamples: AutoCategorizationDecisionPreview[] = [];
  const lowConfidenceExamples: AutoCategorizationDecisionPreview[] = [];

  let totalProducts = 0;
  let legacyMatched = 0;
  let legacyNeedsReview = 0;
  let existingCategoryPreserved = 0;
  let shadowHigh = 0;
  let shadowMedium = 0;
  let shadowLow = 0;
  let wouldAutoPublish = 0;
  let wouldRequireReview = 0;
  let emptyName = 0;
  let confidenceSum = 0;

  for (const row of rows) {
    if (!isImportProductCandidate(row)) {
      continue;
    }

    const categorization = classificationRun.categorizationFor(row)!;
    const decision = toDecisionPreview(row, categorization);
    totalProducts += 1;
    confidenceSum += categorization.confidence;
    sourceCounts.set(categorization.source, (sourceCounts.get(categorization.source) ?? 0) + 1);

    if (categorization.target) {
      legacyMatched += 1;
    } else {
      legacyNeedsReview += 1;
    }

    if (row.issues.some((issue) => issue.code === "missing_name")) {
      emptyName += 1;
    }

    const bucket = getCategorizationConfidenceBucket(categorization);
    if (bucket === "high") {
      shadowHigh += 1;
      pushPreviewExample(highConfidenceExamples, decision, 8);
    } else if (bucket === "medium") {
      shadowMedium += 1;
    } else {
      shadowLow += 1;
      pushPreviewExample(lowConfidenceExamples, decision, 8);
    }

    if (categorization.source === "existing_product_category") {
      existingCategoryPreserved += 1;
    }

    if (!identityConflictRows.has(row) && shouldAutoPublishInShadow(row, categorization)) {
      wouldAutoPublish += 1;
    } else {
      wouldRequireReview += 1;
      pushGroup(unresolvedGroups, buildUnresolvedGroup(row, categorization));
      pushPreviewExample(lowConfidenceExamples, decision, 8);
    }

    if (isDangerousCategorization(categorization)) {
      pushGroup(dangerousGroups, buildDangerousGroup(row, categorization));
    }
  }

  return {
    totalProducts,
    legacyMatched,
    legacyNeedsReview,
    existingCategoryPreserved,
    shadowHigh,
    shadowMedium,
    shadowLow,
    wouldAutoPublish,
    wouldRequireReview,
    highConfidence: shadowHigh,
    mediumConfidence: shadowMedium,
    lowConfidence: shadowLow,
    needsReview: wouldRequireReview,
    emptyName,
    averageConfidence: totalProducts > 0 ? confidenceSum / totalProducts : 0,
    automationPotential: totalProducts > 0 ? wouldAutoPublish / totalProducts : 0,
    threshold: AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD,
    sources: [...sourceCounts.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
    topUnresolvedGroups: topGroups(unresolvedGroups, 12),
    highConfidenceExamples,
    lowConfidenceExamples,
    dangerousGroups: topGroups(dangerousGroups, 12)
  };
}

function buildExistingByCode(existingProducts: ExistingProductSnapshot[]) {
  return new Map(existingProducts.map((product) => [product.shopCode, product]));
}

function toDecisionPreview(
  row: AnalyzedImportRow,
  categorization: CategorizationResult
): AutoCategorizationDecisionPreview {
  return {
    rowNumber: row.rowNumber,
    shopCode: row.shopCode ?? "",
    name: row.name ?? "",
    rawName: row.rawName,
    confidence: categorization.confidence,
    source: categorization.source,
    decisionStatus: categorization.decisionStatus,
    reviewReasonCode: categorization.reviewReasonCode,
    reason: categorization.reason,
    needsReview: needsProductReview(row, categorization),
    wouldAutoPublish: shouldAutoPublishInShadow(row, categorization),
    wouldRequireReview: !shouldAutoPublishInShadow(row, categorization),
    categorySlug: categorization.target?.categorySlug,
    categoryName: categorization.target?.categoryName,
    subcategorySlug: categorization.target?.subcategorySlug,
    subcategoryName: categorization.target?.subcategoryName,
    matchedRule: categorization.matchedRule
      ? {
          id: categorization.matchedRule.id,
          pattern: categorization.matchedRule.pattern,
          matchType: categorization.matchedRule.matchType,
          categorySlug: categorization.matchedRule.categorySlug,
          subcategorySlug: categorization.matchedRule.subcategorySlug,
          priority: categorization.matchedRule.priority
        }
      : null,
    matchedSignals: categorization.matchedSignals
  };
}

function buildUnresolvedGroup(
  row: AnalyzedImportRow,
  categorization: CategorizationResult
): AutoCategorizationGroupPreview {
  if (categorization.matchedRule) {
    const key = `rule:${categorization.matchedRule.pattern}`;
    return {
      key,
      label: `Правило: ${categorization.matchedRule.pattern}`,
      count: 0,
      examples: [formatRowExample(row)]
    };
  }

  const prefix = row.shopCode?.split("-")[0]?.trim().toUpperCase();
  if (prefix) {
    return {
      key: `prefix:${prefix}`,
      label: `Префикс артикула: ${prefix}`,
      count: 0,
      examples: [formatRowExample(row)]
    };
  }

  const token = firstMeaningfulToken(row.name || row.rawName) ?? "unknown";
  return {
    key: `token:${token}`,
    label: `Сигнал: ${token}`,
    count: 0,
    examples: [formatRowExample(row)]
  };
}

function buildDangerousGroup(
  row: AnalyzedImportRow,
  categorization: CategorizationResult
): AutoCategorizationGroupPreview {
  const signal = categorization.matchedRule?.pattern ?? categorization.source;
  return {
    key: `dangerous:${signal}`,
    label: `Опасный сигнал: ${signal}`,
    count: 0,
    examples: [formatRowExample(row)]
  };
}

function isDangerousCategorization(categorization: CategorizationResult) {
  return (
    categorization.source === "ambiguous_token" ||
    (Boolean(categorization.matchedRule) &&
      categorization.confidence < AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD)
  );
}

function pushGroup(
  groups: Map<string, AutoCategorizationGroupPreview>,
  next: AutoCategorizationGroupPreview
) {
  const current = groups.get(next.key) ?? { ...next, count: 0, examples: [] };
  current.count += 1;
  for (const example of next.examples) {
    if (current.examples.length < 5 && !current.examples.includes(example)) {
      current.examples.push(example);
    }
  }
  groups.set(next.key, current);
}

function topGroups(groups: Map<string, AutoCategorizationGroupPreview>, limit: number) {
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru"))
    .slice(0, limit);
}

function pushPreviewExample(
  examples: AutoCategorizationDecisionPreview[],
  example: AutoCategorizationDecisionPreview,
  limit: number
) {
  if (
    examples.length < limit &&
    !examples.some((current) => current.rowNumber === example.rowNumber)
  ) {
    examples.push(example);
  }
}

function firstMeaningfulToken(value: string) {
  return normalizeForCategorization(value)
    .split(/\s+/)
    .map((token) => token.replace(/^\d+|\d+$/g, ""))
    .find((token) => token.length >= 3 && !/^\d+$/.test(token));
}

function formatRowExample(row: AnalyzedImportRow) {
  return `${row.shopCode ?? "NO_CODE"} ${row.name || row.rawName}`.trim();
}

function shouldAutoPublishInShadow(
  row: AnalyzedImportRow,
  categorization: CategorizationResult
) {
  return isImportProductCandidate(row) && !needsProductReview(row, categorization);
}

function buildReviewReason(row: AnalyzedImportRow, categorization: CategorizationResult) {
  return [
    ...row.issues.map((issue) => issue.message),
    categorization.reviewReason,
    buildCategorizationReviewReason(categorization)
  ]
    .filter(Boolean)
    .join("; ");
}

function buildCategorizationReviewReason(categorization: CategorizationResult) {
  if (categorization.source === "existing_product_category") {
    return null;
  }

  if (categorization.decisionStatus === "DO_NOT_PUBLISH") {
    return `DO_NOT_PUBLISH${
      categorization.reviewReasonCode ? `/${categorization.reviewReasonCode}` : ""
    }: ${categorization.reason}`;
  }

  if (!categorization.target) {
    return categorization.reviewReason ?? "Категория не определена.";
  }

  if (!categorization.target.categoryId || !categorization.target.subcategoryId) {
    return "Категория или подкатегория не найдена в базе данных.";
  }

  if (categorization.confidence < AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD) {
    return `Низкая уверенность автоматической категоризации: ${Math.round(
      categorization.confidence * 100
    )}%.`;
  }

  return null;
}

function toNumericString(value: number | null) {
  return value === null ? null : String(value);
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
