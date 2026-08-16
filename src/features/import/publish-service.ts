import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getPublicTaxonomyTargets } from "@/config/public-taxonomy";
import { db } from "@/db/client";
import { backgroundJobs, catalogVersions, categories, importBatches, products, subcategories } from "@/db/schema";
import { isBlockingImportDraft } from "@/features/import/import-state";
import { assertImportSafety, evaluateImportSafety } from "@/features/import/safety";
import type { ImportPerfLogger } from "@/lib/server/import-perf";
import type { ImportPreviewReport, ImportSafetyReport } from "@/features/import/types";
import {
  activatePreparedCatalogSearchIndex,
  prepareSearchIndexForCatalogVersion,
  syncSearchIndexForCatalogVersion
} from "@/features/search/indexing";

export interface PublishCatalogVersionInput {
  catalogVersionId: string;
  report: ImportPreviewReport;
  perf?: ImportPerfLogger;
  activation?: CatalogVersionActivationInput;
  onCheckpoint?: (
    checkpoint: "prepared" | "search_index_built" | "search_swap_started" | "search_swapped" | "catalog_activated"
  ) => Promise<void>;
}

export type CatalogVersionActivationInput = {
  importBatchId?: string;
  publishJob?: {
    id: string;
    workerId: string;
    leaseToken: string;
  };
};

export class CatalogActivationGuardError extends Error {
  constructor(message = "Состояние публикации изменилось до переключения каталога.") {
    super(message);
    this.name = "CatalogActivationGuardError";
  }
}

export async function publishCatalogVersion({
  catalogVersionId,
  report,
  perf,
  activation,
  onCheckpoint
}: PublishCatalogVersionInput) {
  const safety = await getPublishSafetyReport({ catalogVersionId, report });
  assertImportSafety(safety);

  const previousActiveVersionId = await getActiveCatalogVersionId(catalogVersionId);
  await onCheckpoint?.("prepared");
  const preparedSearchIndex = await prepareSearchIndexForCatalogVersion(catalogVersionId, perf);
  await onCheckpoint?.("search_index_built");
  await onCheckpoint?.("search_swap_started");
  const searchResult = await activatePreparedCatalogSearchIndex(preparedSearchIndex, perf);
  await onCheckpoint?.("search_swapped");

  try {
    const switchActiveCatalogVersion = () =>
      activateCatalogVersionInDatabase(catalogVersionId, activation);

    if (perf) {
      await perf.measure("switch_active_catalog_version", switchActiveCatalogVersion);
    } else {
      await switchActiveCatalogVersion();
    }
  } catch (error) {
    if (previousActiveVersionId) {
      await syncSearchIndexForCatalogVersion(previousActiveVersionId, perf).catch((restoreError) => {
        console.error("[import/publish] failed to restore previous search index", {
          previousActiveVersionId,
          error: restoreError instanceof Error ? restoreError.message : String(restoreError)
        });
      });
    }

    throw error;
  }

  // PostgreSQL is now the source of truth. A failed post-commit checkpoint
  // must never restore an older search index.
  await onCheckpoint?.("catalog_activated");

  return {
    ...searchResult,
    previousActiveVersionId,
    safety
  };
}

export async function activateCatalogVersionInDatabase(
  catalogVersionId: string,
  activation: CatalogVersionActivationInput = {}
) {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [batch] = await tx
      .select({
        id: importBatches.id,
        status: importBatches.status,
        catalogVersionId: importBatches.catalogVersionId,
        publishJobId: importBatches.publishJobId,
        phase: importBatches.phase
      })
      .from(importBatches)
      .where(
        and(
          eq(importBatches.catalogVersionId, catalogVersionId),
          ...(activation.importBatchId ? [eq(importBatches.id, activation.importBatchId)] : [])
        )
      )
      .for("update")
      .limit(1);

    if (!batch || batch.status !== "analyzed" || batch.catalogVersionId !== catalogVersionId) {
      throw new CatalogActivationGuardError();
    }

    if (activation.publishJob) {
      if (
        batch.publishJobId !== activation.publishJob.id ||
        !["publish_queued", "publishing", "publish_retrying"].includes(batch.phase ?? "")
      ) {
        throw new CatalogActivationGuardError();
      }
      const [job] = await tx
        .select({
          id: backgroundJobs.id,
          status: backgroundJobs.status,
          lockedBy: backgroundJobs.lockedBy,
          leaseToken: backgroundJobs.leaseToken,
          type: backgroundJobs.type
        })
        .from(backgroundJobs)
        .where(eq(backgroundJobs.id, activation.publishJob.id))
        .for("update")
        .limit(1);
      if (
        !job ||
        job.type !== "publish_import" ||
        job.status !== "running" ||
        job.lockedBy !== activation.publishJob.workerId ||
        job.leaseToken !== activation.publishJob.leaseToken
      ) {
        throw new CatalogActivationGuardError();
      }
    } else if (batch.publishJobId) {
      // Legacy publishing is never allowed to race a reserved worker publish.
      throw new CatalogActivationGuardError();
    }

    const [publishedVersion] = await tx
      .update(catalogVersions)
      .set({ status: "active", publishedAt: now })
      .where(and(eq(catalogVersions.id, catalogVersionId), eq(catalogVersions.status, "draft")))
      .returning({ id: catalogVersions.id });
    if (!publishedVersion) throw new CatalogActivationGuardError();

    await tx
      .update(catalogVersions)
      .set({ status: "archived" })
      .where(and(eq(catalogVersions.status, "active"), ne(catalogVersions.id, catalogVersionId)));
    const [publishedBatch] = await tx
      .update(importBatches)
      .set({
        status: "published",
        phase: "published",
        stage: "Опубликовано",
        progress: 100,
        publishCheckpoint: "catalog_activated",
        lastErrorCode: null,
        lastErrorMessage: null,
        processingUpdatedAt: now,
        publishedAt: now
      })
      .where(and(eq(importBatches.id, batch.id), eq(importBatches.status, "analyzed")))
      .returning({ id: importBatches.id });
    if (!publishedBatch) throw new CatalogActivationGuardError();
  });
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
    missingProductIdentityCount,
    hasBlockingImport
  ] = await Promise.all([
      getActiveCatalogVersionId(catalogVersionId),
      countActiveProductsInCurrentCatalog(catalogVersionId),
      countActiveProducts(catalogVersionId),
      countInvalidActiveCategories(catalogVersionId),
      countActiveProductsMissingIdentity(catalogVersionId),
      hasOtherBlockingImport(catalogVersionId)
    ]);

  return evaluateImportSafety({
    report,
    activeProductCount,
    draftActiveProductCount,
    invalidCategoryCount,
    missingProductIdentityCount,
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
  const rows = await db
    .select({
      id: importBatches.id,
      catalogVersionId: importBatches.catalogVersionId,
      status: importBatches.status,
      versionStatus: catalogVersions.status
    })
    .from(importBatches)
    .innerJoin(catalogVersions, eq(catalogVersions.id, importBatches.catalogVersionId))
    .where(
      and(
        eq(catalogVersions.status, "draft"),
        ne(catalogVersions.id, catalogVersionId)
      )
    )
    .limit(100);

  return rows.some((row) => isBlockingImportDraft(row));
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
        sql`(
          ${categories.id} is null
          or ${subcategories.id} is null
          or ${categories.isActive} is distinct from true
          or ${subcategories.isActive} is distinct from true
          or not ${publicTaxonomyTargetCondition()}
        )`
      )
    );

  return Number(row?.count ?? 0);
}

async function countActiveProductsMissingIdentity(catalogVersionId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(
      and(
        eq(products.catalogVersionId, catalogVersionId),
        eq(products.status, "active"),
        sql`${products.productIdentityId} is null`
      )
    );

  return Number(row?.count ?? 0);
}

function publicTaxonomyTargetCondition() {
  const targets = getPublicTaxonomyTargets();

  return sql<boolean>`(${sql.join(
    targets.map(
      (target) =>
        sql`(${categories.slug} = ${target.categorySlug} AND ${subcategories.slug} = ${target.subcategorySlug})`
    ),
    sql` OR `
  )})`;
}
