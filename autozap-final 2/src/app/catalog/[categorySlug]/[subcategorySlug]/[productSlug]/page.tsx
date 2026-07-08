import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogPageShell } from "@/components/catalog/page-shell";
import { JsonLd } from "@/components/seo/json-ld";
import { getProductDetails } from "@/features/catalog/data";
import { absoluteUrl, buildBreadcrumbList } from "@/features/seo/structured-data";

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
  return {
    title: `${product.name} — ${product.shopCode}`,
    description: `${product.name}. Внутренний код магазина: ${product.shopCode}. Цена: ${product.price.toLocaleString("ru-RU")} ₽.`,
    alternates: {
      canonical: absoluteUrl(url)
    },
    openGraph: {
      title: product.name,
      description: `${product.categoryName} → ${product.subcategoryName}. Код: ${product.shopCode}.`,
      url: absoluteUrl(url),
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
      <article className="rounded-card border border-white/10 bg-[#1F2937] p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-[#D1D5DB]">Внутренний код магазина</dt>
            <dd className="mt-1 text-xl font-semibold">{product.shopCode}</dd>
          </div>
          <div>
            <dt className="text-sm text-[#D1D5DB]">Цена</dt>
            <dd className="mt-1 text-xl font-semibold">
              {product.price.toLocaleString("ru-RU")} ₽
            </dd>
          </div>
          <div>
            <dt className="text-sm text-[#D1D5DB]">Категория</dt>
            <dd className="mt-1 font-medium">{product.categoryName}</dd>
          </div>
          <div>
            <dt className="text-sm text-[#D1D5DB]">Подкатегория</dt>
            <dd className="mt-1 font-medium">{product.subcategoryName}</dd>
          </div>
        </dl>
      </article>
    </CatalogPageShell>
  );
}
