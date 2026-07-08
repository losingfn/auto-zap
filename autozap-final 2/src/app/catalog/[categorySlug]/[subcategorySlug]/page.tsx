import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogPageShell } from "@/components/catalog/page-shell";
import { ProductList } from "@/components/catalog/product-list";
import { JsonLd } from "@/components/seo/json-ld";
import { getProductsForSubcategory } from "@/features/catalog/data";
import { absoluteUrl, buildBreadcrumbList } from "@/features/seo/structured-data";

export const dynamic = "force-dynamic";

type SubcategoryPageProps = {
  params: Promise<{ categorySlug: string; subcategorySlug: string }>;
};

export async function generateMetadata({ params }: SubcategoryPageProps): Promise<Metadata> {
  const { categorySlug, subcategorySlug } = await params;
  const { category, subcategory } = await getProductsForSubcategory(categorySlug, subcategorySlug);

  if (!category || !subcategory) {
    return {};
  }

  const url = `/catalog/${category.slug}/${subcategory.slug}`;
  return {
    title: `${subcategory.name} — ${category.name}`,
    description: `${subcategory.name} в разделе ${category.name}: товары магазина автозапчастей в Талдоме.`,
    alternates: {
      canonical: absoluteUrl(url)
    },
    openGraph: {
      title: `${subcategory.name} — ${category.name}`,
      description: `Товары подкатегории ${subcategory.name}.`,
      url: absoluteUrl(url),
      type: "website"
    }
  };
}

export default async function SubcategoryPage({
  params
}: SubcategoryPageProps) {
  const { categorySlug, subcategorySlug } = await params;
  const { category, subcategory, products } = await getProductsForSubcategory(
    categorySlug,
    subcategorySlug
  );

  if (!category || !subcategory) {
    notFound();
  }

  return (
    <CatalogPageShell
      title={subcategory.name}
      subtitle={`${category.name} → ${subcategory.name}`}
      backHref={`/catalog/${category.slug}`}
    >
      <JsonLd
        data={buildBreadcrumbList([
          { name: "Главная", url: "/" },
          { name: category.name, url: `/catalog/${category.slug}` },
          { name: subcategory.name, url: `/catalog/${category.slug}/${subcategory.slug}` }
        ])}
      />
      <ProductList
        products={products}
        categorySlug={category.slug}
        subcategorySlug={subcategory.slug}
      />
    </CatalogPageShell>
  );
}
