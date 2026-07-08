import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  catalogVersions,
  importBatches,
  importErrors,
  importRows,
  products,
  reviewQueue
} from "@/db/schema";
import { categorizeProductName } from "@/features/categorization/engine";
import { getCategorizationContext } from "@/features/categorization/repository";
import type { CategorizationContext, CategorizationResult } from "@/features/categorization/types";
import { buildProductSearchText } from "@/features/search/documents";
import { getSearchSynonyms } from "@/features/search/synonyms";
import type { SearchSynonymRecord } from "@/features/search/types";
import { slugify } from "@/lib/slug";
import { analyzeImportFile } from "./analyze";
import type { AnalyzedImportRow, ExistingProductSnapshot } from "./types";

export interface CreateDraftImportInput {
  filePath: string;
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
  const analysis = analyzeImportFile(input.filePath, { existingProducts });
  const report = withCategorizationReport(analysis.report, analysis.rows, categorizationContext);

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
    await insertDraftProducts(tx, version.id, analysis.rows, categorizationContext, searchSynonyms);

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
      price: products.price
    })
    .from(products)
    .where(eq(products.catalogVersionId, activeVersion.id));

  return rows.map((row) => ({
    shopCode: row.shopCode,
    name: row.name,
    price: Number(row.price)
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
      .filter((issue) => row.status === "error")
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
  searchSynonyms: SearchSynonymRecord[]
) {
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
      categorization: categorizeProductName(
        `${row.shopCode} ${row.name || row.rawName}`,
        categorizationContext
      )
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
  categorizationContext: CategorizationContext
) {
  let matchedRows = 0;
  let unmatchedRows = 0;
  let combinedReviewRows = 0;

  for (const row of rows) {
    if (!row.shopCode || row.price === null || row.status === "error" || row.status === "skipped") {
      continue;
    }

    const categorization = categorizeProductName(
      `${row.shopCode} ${row.name || row.rawName}`,
      categorizationContext
    );
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
    }
  };
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
