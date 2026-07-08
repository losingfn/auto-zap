import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { catalogVersions, importBatches } from "@/db/schema";
import { syncSearchIndexForCatalogVersion } from "@/features/search/indexing";

export interface PublishCatalogVersionInput {
  catalogVersionId: string;
}

export async function publishCatalogVersion({ catalogVersionId }: PublishCatalogVersionInput) {
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

  return syncSearchIndexForCatalogVersion(catalogVersionId);
}
