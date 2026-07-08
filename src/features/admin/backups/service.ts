import { and, desc, eq, inArray, ne } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/db/client";
import {
  adminUsers,
  auditLogs,
  catalogVersions,
  categories,
  importBatches,
  products,
  subcategories
} from "@/db/schema";
import { syncSearchIndexForCatalogVersion } from "@/features/search/indexing";

export const ROLLBACK_CONFIRMATION = "ОТКАТ";

export async function getAdminBackupsPageData() {
  const [versionRows, importRows, auditRows] = await Promise.all([
    db
      .select({
        id: catalogVersions.id,
        status: catalogVersions.status,
        sourceFileName: catalogVersions.sourceFileName,
        totalRows: catalogVersions.totalRows,
        parsedRows: catalogVersions.parsedRows,
        addedCount: catalogVersions.addedCount,
        updatedCount: catalogVersions.updatedCount,
        archivedCount: catalogVersions.archivedCount,
        reviewCount: catalogVersions.reviewCount,
        errorCount: catalogVersions.errorCount,
        publishedAt: catalogVersions.publishedAt,
        createdAt: catalogVersions.createdAt,
        createdByEmail: adminUsers.email,
        createdByName: adminUsers.fullName
      })
      .from(catalogVersions)
      .leftJoin(adminUsers, eq(adminUsers.id, catalogVersions.createdBy))
      .orderBy(desc(catalogVersions.createdAt))
      .limit(30),
    db
      .select({
        id: importBatches.id,
        catalogVersionId: importBatches.catalogVersionId,
        status: importBatches.status,
        sourceFileName: importBatches.sourceFileName,
        createdAt: importBatches.createdAt,
        analyzedAt: importBatches.analyzedAt,
        publishedAt: importBatches.publishedAt,
        uploadedByEmail: adminUsers.email,
        uploadedByName: adminUsers.fullName
      })
      .from(importBatches)
      .leftJoin(adminUsers, eq(adminUsers.id, importBatches.uploadedBy))
      .orderBy(desc(importBatches.createdAt))
      .limit(30),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        adminEmail: adminUsers.email,
        adminName: adminUsers.fullName
      })
      .from(auditLogs)
      .leftJoin(adminUsers, eq(adminUsers.id, auditLogs.adminUserId))
      .where(
        inArray(auditLogs.action, [
          "import.analyze",
          "import.publish",
          "import.cancel",
          "import.publish_failed",
          "catalog.rollback",
          "catalog.export"
        ])
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(30)
  ]);

  return {
    versions: versionRows,
    imports: importRows,
    auditLogs: auditRows
  };
}

export async function rollbackCatalogVersion({
  catalogVersionId,
  confirmation,
  adminUserId
}: {
  catalogVersionId: string;
  confirmation: string;
  adminUserId: string;
}) {
  if (confirmation.trim() !== ROLLBACK_CONFIRMATION) {
    throw new Error("Откат требует подтверждения.");
  }

  const [target] = await db
    .select({
      id: catalogVersions.id,
      status: catalogVersions.status,
      sourceFileName: catalogVersions.sourceFileName
    })
    .from(catalogVersions)
    .where(eq(catalogVersions.id, catalogVersionId))
    .limit(1);

  if (!target || target.status !== "archived") {
    throw new Error("Откат доступен только к архивной версии каталога.");
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(catalogVersions)
      .set({ status: "archived", updatedAt: now })
      .where(and(eq(catalogVersions.status, "active"), ne(catalogVersions.id, catalogVersionId)));

    await tx
      .update(catalogVersions)
      .set({ status: "active", publishedAt: now, updatedAt: now })
      .where(eq(catalogVersions.id, catalogVersionId));
  });

  let searchIndex: string;
  try {
    const result = await syncSearchIndexForCatalogVersion(catalogVersionId);
    searchIndex = `synced:${result.indexedCount}`;
  } catch (error) {
    searchIndex = `sync_failed:${error instanceof Error ? error.message : "unknown"}`;
  }

  await db.insert(auditLogs).values({
    adminUserId,
    action: "catalog.rollback",
    entityType: "catalog_version",
    entityId: catalogVersionId,
    metadata: {
      sourceFileName: target.sourceFileName,
      searchIndex
    }
  });
}

export async function buildActiveCatalogExport(adminUserId: string) {
  const [activeVersion] = await db
    .select({
      id: catalogVersions.id,
      sourceFileName: catalogVersions.sourceFileName,
      publishedAt: catalogVersions.publishedAt
    })
    .from(catalogVersions)
    .where(eq(catalogVersions.status, "active"))
    .orderBy(desc(catalogVersions.publishedAt), desc(catalogVersions.createdAt))
    .limit(1);

  if (!activeVersion) {
    throw new Error("Нет активной версии каталога для экспорта.");
  }

  const rows = await db
    .select({
      shopCode: products.shopCode,
      name: products.name,
      price: products.price,
      categoryName: categories.name,
      subcategoryName: subcategories.name
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(subcategories, eq(subcategories.id, products.subcategoryId))
    .where(and(eq(products.catalogVersionId, activeVersion.id), eq(products.status, "active")))
    .orderBy(categories.name, subcategories.name, products.name);

  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      "Внутренний код": row.shopCode,
      "Название": row.name,
      "Цена": Number(row.price),
      "Категория": row.categoryName,
      "Подкатегория": row.subcategoryName
    }))
  );
  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 72 },
    { wch: 14 },
    { wch: 28 },
    { wch: 34 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Каталог");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;

  await db.insert(auditLogs).values({
    adminUserId,
    action: "catalog.export",
    entityType: "catalog_version",
    entityId: activeVersion.id,
    metadata: {
      exportedRows: rows.length,
      sourceFileName: activeVersion.sourceFileName
    }
  });

  const fileName = `catalog-active-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return {
    buffer,
    fileName,
    rowsCount: rows.length
  };
}

export async function getActiveCatalogSitemapRows() {
  const [activeVersion] = await db
    .select({ id: catalogVersions.id, updatedAt: catalogVersions.updatedAt })
    .from(catalogVersions)
    .where(eq(catalogVersions.status, "active"))
    .orderBy(desc(catalogVersions.publishedAt), desc(catalogVersions.createdAt))
    .limit(1);

  if (!activeVersion) {
    return {
      lastModified: new Date(),
      categories: [],
      subcategories: [],
      products: []
    };
  }

  const [categoryRows, subcategoryRows, productRows] = await Promise.all([
    db
      .select({
        slug: categories.slug,
        updatedAt: categories.updatedAt
      })
      .from(categories)
      .where(eq(categories.isActive, true)),
    db
      .select({
        categorySlug: categories.slug,
        slug: subcategories.slug,
        updatedAt: subcategories.updatedAt
      })
      .from(subcategories)
      .innerJoin(categories, eq(categories.id, subcategories.categoryId))
      .where(and(eq(subcategories.isActive, true), eq(categories.isActive, true))),
    db
      .select({
        categorySlug: categories.slug,
        subcategorySlug: subcategories.slug,
        slug: products.slug,
        updatedAt: products.updatedAt
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .innerJoin(subcategories, eq(subcategories.id, products.subcategoryId))
      .where(and(eq(products.catalogVersionId, activeVersion.id), eq(products.status, "active")))
  ]);

  return {
    lastModified: activeVersion.updatedAt,
    categories: categoryRows,
    subcategories: subcategoryRows,
    products: productRows
  };
}
