import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  categories,
  catalogVersions,
  importBatches,
  importErrors,
  importRows,
  products,
  reviewQueue,
  subcategories
} from "@/db/schema";
import {
  categorizeProductName,
  getCategorizationConfidenceBucket,
  normalizeForCategorization
} from "@/features/categorization/engine";
import { getCategorizationContext } from "@/features/categorization/repository";
import {
  AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD,
  type CategorizationContext,
  type CategorizationResult,
  type CategorizationSource
} from "@/features/categorization/types";
import { buildProductSearchText } from "@/features/search/documents";
import { getSearchSynonyms } from "@/features/search/synonyms";
import type { SearchSynonymRecord } from "@/features/search/types";
import { slugify } from "@/lib/slug";
import { analyzeImportFile } from "./analyze";
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
}

export interface CreateDraftImportResult {
  catalogVersionId: string;
  importBatchId: string;
  report: ReturnType<typeof analyzeImportFile>["report"];
}

export async function createDraftImport(
  input: CreateDraftImportInput
): Promise<CreateDraftImportResult> {
  const existingProducts = await getActiveProducts();
  const [categorizationContext, searchSynonyms] = await Promise.all([
    getCategorizationContext(),
    getSearchSynonyms()
  ]);
  const analysis = analyzeImportFile(input.filePath, {
    existingProducts,
    fileBuffer: input.fileBuffer,
    fileName: input.sourceFileName
  });
  const report = withCategorizationReport(
    analysis.report,
    analysis.rows,
    categorizationContext,
    existingProducts
  );

  return db.transaction(async (tx) => {
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

    await insertImportRows(tx, batch.id, analysis.rows);
    await insertImportErrors(tx, batch.id, analysis.rows);
    await insertDraftProducts(
      tx,
      version.id,
      analysis.rows,
      categorizationContext,
      searchSynonyms,
      existingProducts
    );

    return {
      catalogVersionId: version.id,
      importBatchId: batch.id,
      report
    };
  });
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
    .where(eq(products.catalogVersionId, activeVersion.id));

  return rows.map((row) => ({
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
  rows: AnalyzedImportRow[]
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

  for (const chunk of chunked(values, 1000)) {
    if (chunk.length > 0) {
      await tx.insert(importRows).values(chunk);
    }
  }
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
  categorizationContext: CategorizationContext,
  searchSynonyms: SearchSynonymRecord[],
  existingProducts: ExistingProductSnapshot[]
) {
  const existingByCode = buildExistingByCode(existingProducts);
  const productRows = rows.filter(
    (row) =>
      row.shopCode &&
      row.price !== null &&
      (row.status === "valid" || row.status === "needs_review")
  );

  for (const chunk of chunked(productRows, 1000)) {
    if (chunk.length === 0) {
      continue;
    }

    const categorizedChunk = chunk.map((row) => ({
      row,
      categorization: categorizeImportRow(row, categorizationContext, existingByCode)
    }));

    const inserted = await tx
      .insert(products)
      .values(
        categorizedChunk.map(({ row, categorization }) => {
          const status = needsProductReview(row, categorization)
            ? ("needs_review" as const)
            : ("active" as const);

          return {
            catalogVersionId,
            shopCode: row.shopCode!,
            rawName: row.rawName,
            name: row.name || row.shopCode!,
            slug: slugify(`${row.shopCode}-${row.name || "bez-nazvaniya"}`),
            price: toNumericString(row.price)!,
            stockQuantity: toNumericString(row.stockQuantity),
            stockSum: toNumericString(row.stockSum),
            categoryId: categorization.target?.categoryId,
            subcategoryId: categorization.target?.subcategoryId,
            status,
            reviewReason: buildReviewReason(row, categorization),
            searchText: buildProductSearchText({
              shopCode: row.shopCode!,
              name: row.name || row.shopCode!,
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
      .filter(({ row, categorization }) => needsProductReview(row, categorization))
      .map(({ row, categorization }) => ({
        catalogVersionId,
        productId: insertedByCode.get(row.shopCode!),
        reason: buildReviewReason(row, categorization) || "Товар требует проверки.",
        suggestedCategoryId: categorization.target?.categoryId,
        suggestedSubcategoryId: categorization.target?.subcategoryId
      }))
      .filter(
        (
          row
        ): row is {
          catalogVersionId: string;
          productId: string;
          reason: string;
          suggestedCategoryId: string | undefined;
          suggestedSubcategoryId: string | undefined;
        } => Boolean(row.productId)
      );

    if (reviewValues.length > 0) {
      await tx.insert(reviewQueue).values(reviewValues);
    }
  }
}

function withCategorizationReport(
  report: ReturnType<typeof analyzeImportFile>["report"],
  rows: AnalyzedImportRow[],
  categorizationContext: CategorizationContext,
  existingProducts: ExistingProductSnapshot[]
) {
  const existingByCode = buildExistingByCode(existingProducts);
  let matchedRows = 0;
  let unmatchedRows = 0;
  let combinedReviewRows = 0;

  for (const row of rows) {
    if (!row.shopCode || row.price === null || row.status === "error" || row.status === "skipped") {
      continue;
    }

    const categorization = categorizeImportRow(row, categorizationContext, existingByCode);
    if (categorization.needsReview) {
      unmatchedRows += 1;
    } else {
      matchedRows += 1;
    }

    if (needsProductReview(row, categorization)) {
      combinedReviewRows += 1;
    }
  }

  return {
    ...report,
    reviewRows: combinedReviewRows,
    categorization: {
      matchedRows,
      unmatchedRows,
      activeRules: categorizationContext.rules.length
    },
    autoCategorizationPreview: buildAutoCategorizationPreview(
      rows,
      categorizationContext,
      existingProducts
    )
  };
}

function buildAutoCategorizationPreview(
  rows: AnalyzedImportRow[],
  categorizationContext: CategorizationContext,
  existingProducts: ExistingProductSnapshot[]
) {
  const existingByCode = buildExistingByCode(existingProducts);
  const sourceCounts = new Map<CategorizationSource, number>();
  const unresolvedGroups = new Map<string, AutoCategorizationGroupPreview>();
  const dangerousGroups = new Map<string, AutoCategorizationGroupPreview>();
  const highConfidenceExamples: AutoCategorizationDecisionPreview[] = [];
  const lowConfidenceExamples: AutoCategorizationDecisionPreview[] = [];

  let totalProducts = 0;
  let existingCategoryPreserved = 0;
  let highConfidence = 0;
  let mediumConfidence = 0;
  let lowConfidence = 0;
  let needsReview = 0;
  let emptyName = 0;
  let confidenceSum = 0;

  for (const row of rows) {
    if (!isImportProductCandidate(row)) {
      continue;
    }

    const categorization = categorizeImportRow(row, categorizationContext, existingByCode);
    const decision = toDecisionPreview(row, categorization);
    totalProducts += 1;
    confidenceSum += categorization.confidence;
    sourceCounts.set(categorization.source, (sourceCounts.get(categorization.source) ?? 0) + 1);

    if (row.issues.some((issue) => issue.code === "missing_name")) {
      emptyName += 1;
    }

    if (categorization.source === "existing_product_category") {
      existingCategoryPreserved += 1;
    } else {
      const bucket = getCategorizationConfidenceBucket(categorization);
      if (bucket === "high") {
        highConfidence += 1;
        pushPreviewExample(highConfidenceExamples, decision, 8);
      } else if (bucket === "medium") {
        mediumConfidence += 1;
      } else {
        lowConfidence += 1;
        pushPreviewExample(lowConfidenceExamples, decision, 8);
      }
    }

    if (needsProductReview(row, categorization)) {
      needsReview += 1;
      pushGroup(unresolvedGroups, buildUnresolvedGroup(row, categorization));
      pushPreviewExample(lowConfidenceExamples, decision, 8);
    }

    if (isDangerousCategorization(categorization)) {
      pushGroup(dangerousGroups, buildDangerousGroup(row, categorization));
    }
  }

  return {
    totalProducts,
    existingCategoryPreserved,
    highConfidence,
    mediumConfidence,
    lowConfidence,
    needsReview,
    emptyName,
    averageConfidence: totalProducts > 0 ? confidenceSum / totalProducts : 0,
    automationPotential:
      totalProducts > 0 ? (existingCategoryPreserved + highConfidence) / totalProducts : 0,
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

function categorizeImportRow(
  row: AnalyzedImportRow,
  categorizationContext: CategorizationContext,
  existingByCode: Map<string, ExistingProductSnapshot>
) {
  const existingProduct = row.shopCode ? existingByCode.get(row.shopCode) : null;
  return categorizeProductName(buildCategorizationTitle(row), categorizationContext, {
    existingProduct,
    emptyName: !row.name || row.issues.some((issue) => issue.code === "missing_name")
  });
}

function buildExistingByCode(existingProducts: ExistingProductSnapshot[]) {
  return new Map(existingProducts.map((product) => [product.shopCode, product]));
}

function isImportProductCandidate(row: AnalyzedImportRow) {
  return Boolean(
    row.shopCode &&
      row.price !== null &&
      row.status !== "error" &&
      row.status !== "skipped"
  );
}

function buildCategorizationTitle(row: AnalyzedImportRow) {
  return `${row.shopCode ?? ""} ${row.name || row.rawName}`.trim();
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
    reason: categorization.reason,
    needsReview: needsProductReview(row, categorization),
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

function needsProductReview(row: AnalyzedImportRow, categorization: CategorizationResult) {
  return row.status === "needs_review" || categorization.needsReview;
}

function buildReviewReason(row: AnalyzedImportRow, categorization: CategorizationResult) {
  return [
    ...row.issues.map((issue) => issue.message),
    categorization.reviewReason
  ]
    .filter(Boolean)
    .join("; ");
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
