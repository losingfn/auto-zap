import Link from "next/link";
import type { CSSProperties } from "react";
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
      {subcategories.map((subcategory, index) => (
        <Link
          key={subcategory.slug}
          href={`/catalog/${categorySlug}/${subcategory.slug}`}
          className="tap-target scroll-reveal stagger-card group rounded-card border border-white/10 bg-[linear-gradient(145deg,rgba(31,41,55,0.94),rgba(17,24,39,0.98))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)] transition duration-300 hover:-translate-y-1 hover:border-[#2563EB]/70 hover:shadow-[0_24px_80px_rgba(37,99,235,0.18)]"
          style={{ "--stagger": `${index * 50}ms` } as CSSProperties}
        >
          <span className="mb-4 block h-1 w-10 rounded-full bg-[#2563EB]" />
          <h2 className="text-xl font-semibold text-white">{subcategory.name}</h2>
          <p className="mt-2 text-sm text-[#CBD5E1]">
            {subcategory.productCount > 0
              ? `${subcategory.productCount.toLocaleString("ru-RU")} товаров`
              : "Товары появятся после публикации каталога"}
          </p>
          <span className="mt-4 block text-sm font-semibold text-[#93C5FD] transition group-hover:text-white">
            Открыть товары →
          </span>
        </Link>
      ))}
    </div>
  );
}
