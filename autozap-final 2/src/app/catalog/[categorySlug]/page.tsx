import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogPageShell } from "@/components/catalog/page-shell";
import { SubcategoryGrid } from "@/components/catalog/subcategory-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { getSubcategoriesForCategory } from "@/features/catalog/data";
import { absoluteUrl, buildBreadcrumbList } from "@/features/seo/structured-data";

export const dynamic = "force-dynamic";

type CategoryPageProps = {
  params: Promise<{ categorySlug: string }>;
};

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { categorySlug } = await params;
  const { category } = await getSubcategoriesForCategory(categorySlug);

  if (!category) {
    return {};
  }

  return {
    title: `${category.name} — каталог`,
    description: `Раздел ${category.name} в каталоге автозапчастей магазина в Талдоме.`,
    alternates: {
      canonical: absoluteUrl(`/catalog/${category.slug}`)
    },
    openGraph: {
      title: `${category.name} — каталог автозапчастей`,
      description: `Подкатегории раздела ${category.name}.`,
      url: absoluteUrl(`/catalog/${category.slug}`),
      type: "website"
    }
  };
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
      subtitle="Выберите подкатегорию. Товары отображаются только внутри подкатегории."
      backHref="/"
    >
      <JsonLd
        data={buildBreadcrumbList([
          { name: "Главная", url: "/" },
          { name: category.name, url: `/catalog/${category.slug}` }
        ])}
      />
      <SubcategoryGrid categorySlug={category.slug} subcategories={subcategories} />
    </CatalogPageShell>
  );
}
