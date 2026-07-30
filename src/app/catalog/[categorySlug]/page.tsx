import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryInformation } from "@/components/catalog/category-information";
import { CatalogPageShell } from "@/components/catalog/page-shell";
import { SubcategoryGrid } from "@/components/catalog/subcategory-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { getStaticPublicCategories, getSubcategoriesForCategory } from "@/features/catalog/data";
import { buildPublicPageMetadata, normalizeSeoText } from "@/features/seo/metadata";
import { buildBreadcrumbList } from "@/features/seo/structured-data";

export const dynamic = "force-dynamic";

type CategoryPageProps = {
  params: Promise<{ categorySlug: string }>;
};

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { categorySlug } = await params;
  const category = getStaticPublicCategories().find((item) => item.slug === categorySlug);

  if (!category) {
    return {};
  }

  const categoryName = normalizeSeoText(category.name);

  return buildPublicPageMetadata({
    title: `${categoryName} в Талдоме | Автозапчасти`,
    description: `${categoryName}: автозапчасти в Талдоме для легковых и коммерческих автомобилей. Выберите нужную подкатегорию и посмотрите актуальные цены.`,
    path: `/catalog/${category.slug}`
  });
}

export default async function CategoryPage({
  params
}: CategoryPageProps) {
  const { categorySlug } = await params;
  const { category, subcategories } = await getSubcategoriesForCategory(categorySlug);

  if (!category) {
    notFound();
  }

  return (
    <CatalogPageShell
      title={category.name}
      backHref="/"
    >
      <JsonLd
        data={buildBreadcrumbList([
          { name: "Главная", url: "/" },
          { name: category.name, url: `/catalog/${category.slug}` }
        ])}
      />
      <SubcategoryGrid categorySlug={category.slug} subcategories={subcategories} />
      <CategoryInformation categorySlug={category.slug} />
    </CatalogPageShell>
  );
}
