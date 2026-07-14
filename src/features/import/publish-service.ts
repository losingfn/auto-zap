import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { catalogVersions, categories, importBatches, products, subcategories } from "@/db/schema";
import { assertImportSafety, evaluateImportSafety } from "@/features/import/safety";
import type { ImportPreviewReport, ImportSafetyReport } from "@/features/import/types";
import { syncSearchIndexForCatalogVersion } from "@/features/search/indexing";

export interface PublishCatalogVersionInput {
  catalogVersionId: string;
  report: ImportPreviewReport;
}

export async function publishCatalogVersion({ catalogVersionId, report }: PublishCatalogVersionInput) {
  const safety = await getPublishSafetyReport({ catalogVersionId, report });
  assertImportSafety(safety);

  const previousActiveVersionId = await getActiveCatalogVersionId(catalogVersionId);
  const searchResult = await syncSearchIndexForCatalogVersion(catalogVersionId);

  try {
    await db.transaction(async (tx) => {
      const now = new Date();

      await tx
        .update(catalogVersions)
        .set({
          status: "archived"
        })
        .where(and(eq(catalogVersions.status, "active"), ne(catalogVersions.id, catalogVersionId)));

      const [publishedVersion] = await tx
        .update(catalogVersions)
        .set({
          status: "active",
          publishedAt: now
        })
        .where(eq(catalogVersions.id, catalogVersionId))
        .returning({ id: catalogVersions.id });

      if (!publishedVersion) {
        throw new Error("Версия каталога для публикации не найдена.");
      }

      await tx
        .update(importBatches)
        .set({
          status: "published",
          publishedAt: now
        })
        .where(eq(importBatches.catalogVersionId, catalogVersionId));
    });
  } catch (error) {
    if (previousActiveVersionId) {
      await syncSearchIndexForCatalogVersion(previousActiveVersionId).catch((restoreError) => {
        console.error("[import/publish] failed to restore previous search index", {
          previousActiveVersionId,
          error: restoreError instanceof Error ? restoreError.message : String(restoreError)
        });
      });
    }

    throw error;
  }

  return {
    ...searchResult,
    previousActiveVersionId,
    safety
  };
}

export async function getPublishSafetyReport({
  catalogVersionId,
  report
}: PublishCatalogVersionInput): Promise<ImportSafetyReport> {
  const [
    activeVersionId,
    activeProductCount,
    draftActiveProductCount,
    invalidCategoryCount,
    hasBlockingImport
  ] = await Promise.all([
      getActiveCatalogVersionId(catalogVersionId),
      countActiveProductsInCurrentCatalog(catalogVersionId),
      countActiveProducts(catalogVersionId),
      countInvalidActiveCategories(catalogVersionId),
      hasOtherBlockingImport(catalogVersionId)
    ]);

  return evaluateImportSafety({
    report,
    activeProductCount,
    draftActiveProductCount,
    invalidCategoryCount,
    hasActiveVersion: Boolean(activeVersionId),
    hasBlockingImport
  });
}

async function getActiveCatalogVersionId(exceptCatalogVersionId?: string) {
  const conditions = [eq(catalogVersions.status, "active")];
  if (exceptCatalogVersionId) {
    conditions.push(ne(catalogVersions.id, exceptCatalogVersionId));
  }

  const [activeVersion] = await db
    .select({ id: catalogVersions.id })
    .from(catalogVersions)
    .where(and(...conditions))
    .orderBy(desc(catalogVersions.publishedAt), desc(catalogVersions.createdAt))
    .limit(1);

  return activeVersion?.id ?? null;
}

async function hasOtherBlockingImport(catalogVersionId: string) {
  const [row] = await db
    .select({ id: importBatches.id })
    .from(importBatches)
    .innerJoin(catalogVersions, eq(catalogVersions.id, importBatches.catalogVersionId))
    .where(
      and(
        eq(importBatches.status, "analyzed"),
        eq(catalogVersions.status, "draft"),
        ne(catalogVersions.id, catalogVersionId)
      )
    )
    .limit(1);

  return Boolean(row);
}

async function countActiveProductsInCurrentCatalog(exceptCatalogVersionId: string) {
  const activeVersionId = await getActiveCatalogVersionId(exceptCatalogVersionId);
  if (!activeVersionId) {
    return 0;
  }

  return countActiveProducts(activeVersionId);
}

async function countActiveProducts(catalogVersionId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.catalogVersionId, catalogVersionId), eq(products.status, "active")));

  return Number(row?.count ?? 0);
}

async function countInvalidActiveCategories(catalogVersionId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(
      subcategories,
      and(eq(subcategories.id, products.subcategoryId), eq(subcategories.categoryId, categories.id))
    )
    .where(
      and(
        eq(products.catalogVersionId, catalogVersionId),
        eq(products.status, "active"),
        sql`(${categories.id} is null or ${subcategories.id} is null)`
      )
    );

  return Number(row?.count ?? 0);
}
