import type { MetadataRoute } from "next";
import { getPublicProductPath } from "@/config/public-taxonomy";
import { siteConfig } from "@/config/site";
import { getActiveCatalogSitemapRows } from "@/features/admin/backups/service";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteConfig.url.replace(/\/$/, "");
  const rows = await getActiveCatalogSitemapRows().catch(() => ({
    lastModified: new Date(),
    categories: [],
    subcategories: [],
    products: []
  }));

  return [
    {
      url: baseUrl,
      lastModified: rows.lastModified,
      changeFrequency: "daily",
      priority: 1
    },
    ...rows.categories.map((category) => ({
      url: `${baseUrl}/catalog/${category.slug}`,
      lastModified: category.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8
    })),
    ...rows.subcategories.map((subcategory) => ({
      url: `${baseUrl}/catalog/${subcategory.categorySlug}/${subcategory.slug}`,
      lastModified: subcategory.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7
    })),
    ...rows.products.map((product) => ({
      url: `${baseUrl}${getPublicProductPath(product)}`,
      lastModified: product.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.5
    }))
  ];
}
