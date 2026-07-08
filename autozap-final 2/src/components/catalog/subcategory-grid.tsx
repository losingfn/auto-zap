import Link from "next/link";
import type { PublicSubcategory } from "@/features/catalog/types";

export function SubcategoryGrid({
  categorySlug,
  subcategories
}: {
  categorySlug: string;
  subcategories: PublicSubcategory[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {subcategories.map((subcategory) => (
        <Link
          key={subcategory.slug}
          href={`/catalog/${categorySlug}/${subcategory.slug}`}
          className="rounded-card border border-white/10 bg-[#1F2937] p-5 transition hover:border-[#2563EB]"
        >
          <h2 className="text-xl font-semibold">{subcategory.name}</h2>
          <p className="mt-2 text-sm text-[#D1D5DB]">
            {subcategory.productCount > 0
              ? `${subcategory.productCount.toLocaleString("ru-RU")} товаров`
              : "Товары появятся после публикации каталога"}
          </p>
        </Link>
      ))}
    </div>
  );
}
