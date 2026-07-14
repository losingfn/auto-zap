import type { Metadata } from "next";
import { CategoryGrid } from "@/components/catalog/category-grid";
import { CatalogPageShell } from "@/components/catalog/page-shell";
import { JsonLd } from "@/components/seo/json-ld";
import { getPublicCatalogCategories } from "@/features/catalog/data";
import { buildBreadcrumbList, publicAbsoluteUrl } from "@/features/seo/structured-data";

const catalogUrl = publicAbsoluteUrl("/catalog");
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Каталог автозапчастей",
  description: "Основные категории каталога автозапчастей магазина в Талдоме.",
  ...(catalogUrl ? { alternates: { canonical: catalogUrl } } : {}),
  openGraph: {
    title: "Каталог автозапчастей",
    description: "Выберите раздел каталога автозапчастей.",
    ...(catalogUrl ? { url: catalogUrl } : {}),
    type: "website"
  }
};

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
