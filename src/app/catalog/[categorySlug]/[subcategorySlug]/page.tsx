import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogPageShell } from "@/components/catalog/page-shell";
import { ProductList } from "@/components/catalog/product-list";
import { JsonLd } from "@/components/seo/json-ld";
import { getStaticPublicCategories, getProductsForSubcategory } from "@/features/catalog/data";
import { buildBreadcrumbList, publicAbsoluteUrl } from "@/features/seo/structured-data";

export const dynamic = "force-dynamic";

type SubcategoryPageProps = {
  params: Promise<{ categorySlug: string; subcategorySlug: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
};

export async function generateMetadata({ params }: SubcategoryPageProps): Promise<Metadata> {
  const { categorySlug, subcategorySlug } = await params;
  const category = getStaticPublicCategories().find((item) => item.slug === categorySlug);

  if (!category) {
    return {};
  }

  const url = `/catalog/${category.slug}/${subcategorySlug}`;
  const pageUrl = publicAbsoluteUrl(url);
  return {
    title: `${category.name} — товары`,
    description: `Товары раздела ${category.name} в каталоге автозапчастей магазина в Талдоме.`,
    ...(pageUrl ? { alternates: { canonical: pageUrl } } : {}),
    openGraph: {
      title: `${category.name} — товары`,
      description: `Товары раздела ${category.name}.`,
      ...(pageUrl ? { url: pageUrl } : {}),
      type: "website"
    }
  };
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
