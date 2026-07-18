import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogPageShell } from "@/components/catalog/page-shell";
import {
  ALL_ASSORTMENT_CATEGORY_SLUG,
  ALL_PRODUCTS_SUBCATEGORY_SLUG,
  formatPublicTargetLabel,
  getPublicProductPath,
  isOtherProductsTarget
} from "@/config/public-taxonomy";
import { JsonLd } from "@/components/seo/json-ld";
import { getProductDetails } from "@/features/catalog/data";
import { buildBreadcrumbList, publicAbsoluteUrl } from "@/features/seo/structured-data";

export const dynamic = "force-dynamic";

type ProductPageProps = {
  params: Promise<{ categorySlug: string; subcategorySlug: string; productSlug: string }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { categorySlug, subcategorySlug, productSlug } = await params;
  const product = await getProductDetails(categorySlug, subcategorySlug, productSlug);

  if (!product) {
    return {};
  }

  const displayLabel = formatPublicTargetLabel(product);
  const url = getPublicProductPath(product);
  const productUrl = publicAbsoluteUrl(url);
  return {
    title: product.name,
    description: `${product.name}. Цена: ${product.price.toLocaleString("ru-RU")} ₽.`,
    ...(productUrl ? { alternates: { canonical: productUrl } } : {}),
    openGraph: {
      title: product.name,
      description: `${displayLabel}. Цена: ${product.price.toLocaleString("ru-RU")} ₽.`,
      ...(productUrl ? { url: productUrl } : {}),
      type: "website"
    }
  };
}

export default async function ProductPage({
  params
}: ProductPageProps) {
  const { categorySlug, subcategorySlug, productSlug } = await params;
  const product = await getProductDetails(categorySlug, subcategorySlug, productSlug);

  if (!product) {
    notFound();
  }

  const displayLabel = formatPublicTargetLabel(product);
  const productUrl = getPublicProductPath(product);
  const targetIsOtherProducts = isOtherProductsTarget(
    product.categorySlug,
    product.subcategorySlug
  );
  const backHref = targetIsOtherProducts
    ? `/catalog/${ALL_ASSORTMENT_CATEGORY_SLUG}/${ALL_PRODUCTS_SUBCATEGORY_SLUG}`
    : `/catalog/${categorySlug}/${subcategorySlug}`;
  const breadcrumbs = targetIsOtherProducts
    ? [
        { name: "Главная", url: "/" },
        { name: displayLabel, url: `/catalog/${ALL_ASSORTMENT_CATEGORY_SLUG}/${ALL_PRODUCTS_SUBCATEGORY_SLUG}` },
        { name: product.name, url: productUrl }
      ]
    : [
        { name: "Главная", url: "/" },
        { name: product.categoryName, url: `/catalog/${categorySlug}` },
        { name: product.subcategoryName, url: `/catalog/${categorySlug}/${subcategorySlug}` },
        { name: product.name, url: productUrl }
      ];

  return (
    <CatalogPageShell
      title={product.name}
      subtitle={displayLabel}
      backHref={backHref}
    >
      <JsonLd data={buildBreadcrumbList(breadcrumbs)} />
      <article className="rounded-card border border-white/10 bg-[#111827] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#93C5FD]">Цена</p>
        <p className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
          {product.price.toLocaleString("ru-RU")} ₽
        </p>
      </article>
    </CatalogPageShell>
  );
}
