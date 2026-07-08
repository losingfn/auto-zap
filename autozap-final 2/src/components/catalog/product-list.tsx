import Link from "next/link";
import type { PublicProductListItem } from "@/features/catalog/types";

export function ProductList({
  products,
  categorySlug,
  subcategorySlug
}: {
  products: PublicProductListItem[];
  categorySlug: string;
  subcategorySlug: string;
}) {
  if (products.length === 0) {
    return (
      <div className="rounded-card border border-white/10 bg-[#1F2937] p-5 text-[#D1D5DB]">
        Товары появятся после публикации каталога.
      </div>
    );
  }

  return (
    <div className="divide-y divide-white/10 rounded-card border border-white/10 bg-[#1F2937]">
      {products.map((product) => (
        <Link
          key={product.id}
          href={`/catalog/${categorySlug}/${subcategorySlug}/${product.slug}`}
          className="grid gap-2 p-4 transition hover:bg-white/5 sm:grid-cols-[1fr_auto]"
        >
          <div>
            <h2 className="text-base font-semibold leading-6">{product.name}</h2>
            <p className="mt-1 text-sm text-[#D1D5DB]">Код магазина: {product.shopCode}</p>
          </div>
          <div className="text-lg font-semibold text-white">
            {product.price.toLocaleString("ru-RU")} ₽
          </div>
        </Link>
      ))}
    </div>
  );
}
