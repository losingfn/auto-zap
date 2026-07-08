import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogPageShell } from "@/components/catalog/page-shell";
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

  const url = `/catalog/${categorySlug}/${subcategorySlug}/${product.slug}`;
  const productUrl = publicAbsoluteUrl(url);
  return {
    title: product.name,
    description: `${product.name}. Цена: ${product.price.toLocaleString("ru-RU")} ₽.`,
    ...(productUrl ? { alternates: { canonical: productUrl } } : {}),
    openGraph: {
      title: product.name,
      description: `${product.categoryName} → ${product.subcategoryName}. Цена: ${product.price.toLocaleString("ru-RU")} ₽.`,
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

  return (
    <CatalogPageShell
      title={product.name}
      subtitle={`${product.categoryName} → ${product.subcategoryName}`}
      backHref={`/catalog/${categorySlug}/${subcategorySlug}`}
    >
      <JsonLd
        data={buildBreadcrumbList([
          { name: "Главная", url: "/" },
          { name: product.categoryName, url: `/catalog/${categorySlug}` },
          { name: product.subcategoryName, url: `/catalog/${categorySlug}/${subcategorySlug}` },
          {
            name: product.name,
            url: `/catalog/${categorySlug}/${subcategorySlug}/${product.slug}`
          }
        ])}
      />
      <article className="rounded-card border border-white/10 bg-[#111827] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#93C5FD]">Цена</p>
        <p className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
          {product.price.toLocaleString("ru-RU")} ₽
        </p>
      </article>
    </CatalogPageShell>
  );
}
