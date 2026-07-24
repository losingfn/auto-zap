import type { Metadata } from "next";
import { CategoryGrid } from "@/components/catalog/category-grid";
import { CatalogPageShell } from "@/components/catalog/page-shell";
import { JsonLd } from "@/components/seo/json-ld";
import { getPublicCatalogCategories } from "@/features/catalog/data";
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

export default async function CatalogPage() {
  const categories = await getPublicCatalogCategories();

  return (
    <CatalogPageShell
      title="Каталог"
      subtitle="Выберите основной раздел. Товары открываются внутри подкатегорий."
      backHref="/"
    >
      <JsonLd
        data={buildBreadcrumbList([
          { name: "Главная", url: "/" },
          { name: "Каталог", url: "/catalog" }
        ])}
      />
      <CategoryGrid categories={categories} />
    </CatalogPageShell>
  );
}
