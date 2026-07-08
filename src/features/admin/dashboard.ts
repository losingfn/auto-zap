import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  adminUsers,
  auditLogs,
  catalogVersions,
  categories,
  importBatches,
  products,
  reviewQueue,
  subcategories
} from "@/db/schema";

export type AdminDashboardStats = Awaited<ReturnType<typeof getAdminDashboardStats>>;

export async function getAdminDashboardStats() {
  const [activeVersion] = await db
    .select({
      id: catalogVersions.id,
      publishedAt: catalogVersions.publishedAt,
      createdAt: catalogVersions.createdAt,
      updatedAt: catalogVersions.updatedAt
    })
    .from(catalogVersions)
    .where(eq(catalogVersions.status, "active"))
    .orderBy(desc(catalogVersions.publishedAt), desc(catalogVersions.createdAt))
    .limit(1);

  const productWhere = activeVersion
    ? and(eq(products.catalogVersionId, activeVersion.id), eq(products.status, "active"))
    : eq(products.status, "active");

  const reviewWhere = activeVersion
    ? and(eq(reviewQueue.catalogVersionId, activeVersion.id), eq(reviewQueue.status, "open"))
    : eq(reviewQueue.status, "open");

  const [productCount, categoryCount, subcategoryCount, reviewCount, auditLogRows, importRows] =
    await Promise.all([
      countRows(products, productWhere),
      countRows(categories, eq(categories.isActive, true)),
      countRows(subcategories, eq(subcategories.isActive, true)),
      countRows(reviewQueue, reviewWhere),
      db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          createdAt: auditLogs.createdAt,
          adminEmail: adminUsers.email,
          adminName: adminUsers.fullName
        })
        .from(auditLogs)
        .leftJoin(adminUsers, eq(adminUsers.id, auditLogs.adminUserId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(8),
      db
        .select({
          id: importBatches.id,
          sourceFileName: importBatches.sourceFileName,
          status: importBatches.status,
          createdAt: importBatches.createdAt,
          analyzedAt: importBatches.analyzedAt,
          publishedAt: importBatches.publishedAt,
          uploadedByEmail: adminUsers.email,
          uploadedByName: adminUsers.fullName
        })
        .from(importBatches)
        .leftJoin(adminUsers, eq(adminUsers.id, importBatches.uploadedBy))
        .orderBy(desc(importBatches.createdAt))
        .limit(6)
    ]);

  return {
    productCount,
    categoryCount,
    subcategoryCount,
    lastCatalogUpdate: activeVersion?.publishedAt ?? activeVersion?.updatedAt ?? null,
    reviewQueueCount: reviewCount,
    auditLogs: auditLogRows,
    recentImports: importRows
  };
}

async function countRows(table: AnyPgTable, where: SQL | undefined) {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(where);

  return Number(result?.count ?? 0);
}
