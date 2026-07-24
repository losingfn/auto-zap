import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogPageShell } from "@/components/catalog/page-shell";
import { ProductList } from "@/components/catalog/product-list";
import { JsonLd } from "@/components/seo/json-ld";
import { catalogTaxonomy } from "@/config/catalog-taxonomy";
import { isPublicNavigationTaxonomyTarget } from "@/config/public-taxonomy";
import { getProductsForSubcategory } from "@/features/catalog/data";
import { buildPublicPageMetadata, normalizeSeoText } from "@/features/seo/metadata";
import { buildBreadcrumbList } from "@/features/seo/structured-data";

export const dynamic = "force-dynamic";

type SubcategoryPageProps = {
  params: Promise<{ categorySlug: string; subcategorySlug: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
};

export async function generateMetadata({ params }: SubcategoryPageProps): Promise<Metadata> {
  const { categorySlug, subcategorySlug } = await params;
  const target = getPublicNavigationTaxonomyTarget(categorySlug, subcategorySlug);

  if (!target) {
    return {};
  }

  const subcategoryName = normalizeSeoText(target.subcategoryName);

  return buildPublicPageMetadata({
    title: `${subcategoryName} в Талдоме | Автозапчасти`,
    description: `${subcategoryName} в Талдоме для легковых и коммерческих автомобилей. Посмотрите товары и актуальные цены в каталоге магазина автозапчастей.`,
    path: `/catalog/${target.categorySlug}/${target.subcategorySlug}`
  });
}

export default async function SubcategoryPage({
  params,
  searchParams
}: SubcategoryPageProps) {
  const [{ categorySlug, subcategorySlug }, query] = await Promise.all([params, searchParams]);
  const page = parsePage(query.page);
  const searchQuery = String(query.q ?? "").trim();
  const { category, subcategory, products, pagination } = await getProductsForSubcategory(
    categorySlug,
    subcategorySlug,
    { page, pageSize: 50, query: searchQuery }
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
        pagination={pagination}
        searchQuery={searchQuery}
      />
    </CatalogPageShell>
  );
}

function parsePage(value?: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function getPublicNavigationTaxonomyTarget(
  categorySlug: string | null | undefined,
  subcategorySlug: string | null | undefined
) {
  if (!isPublicNavigationTaxonomyTarget(categorySlug, subcategorySlug)) {
    return null;
  }

  const category = catalogTaxonomy.find((item) => item.slug === categorySlug);
  const subcategory = category?.subcategories.find(([slug]) => slug === subcategorySlug);

  if (!category || !subcategory) {
    return null;
  }

  return {
    categorySlug: category.slug,
    subcategorySlug: subcategory[0],
    subcategoryName: subcategory[1]
  };
}
