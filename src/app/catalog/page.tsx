import type { Metadata } from "next";
import { HomeCategoryGrid } from "@/components/home/home-category-grid";
import { CatalogPageShell } from "@/components/catalog/page-shell";
import { JsonLd } from "@/components/seo/json-ld";
import { getPublicCatalogCategories } from "@/features/catalog/data";
import {
  getCatalogNavigationContext
} from "@/features/catalog/navigation-context";
import { buildPublicPageMetadata } from "@/features/seo/metadata";
import { buildBreadcrumbList } from "@/features/seo/structured-data";

export const dynamic = "force-dynamic";

const catalogTitle = "Каталог автозапчастей в Талдоме | Автозапчасти";
const catalogDescription =
  "Каталог автозапчастей в Талдоме для легковых и коммерческих автомобилей. Выберите категорию и найдите нужную деталь по актуальной цене.";

export const metadata: Metadata = buildPublicPageMetadata({
  title: catalogTitle,
  description: catalogDescription,
  path: "/catalog"
});

export default async function CatalogPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const context = getCatalogNavigationContext((await searchParams).from);
  const categories = await getPublicCatalogCategories();

  return (
    <CatalogPageShell
      title="Каталог"
      variant="catalog"
      backHref={context === "purchase-list" ? "/spisok-pokupok" : "/"}
      backLabel={context === "purchase-list" ? "← Назад" : "← На главную"}
    >
      <JsonLd
        data={buildBreadcrumbList([
          { name: "Главная", url: "/" },
          { name: "Каталог", url: "/catalog" }
        ])}
      />
      <HomeCategoryGrid categories={categories} navigationContext={context} />
    </CatalogPageShell>
  );
}
