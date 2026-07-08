import Image from "next/image";
import Link from "next/link";
import type { PublicCategory } from "@/features/catalog/types";

export function CategoryGrid({ categories }: { categories: PublicCategory[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {categories.map((category) => (
        <Link
          key={category.slug}
          href={`/catalog/${category.slug}`}
          className="group flex min-h-48 flex-col justify-between rounded-card border border-white/10 bg-[#1F2937] p-4 shadow-sm transition hover:border-[#2563EB]"
        >
          <Image
            src={category.icon}
            alt=""
            width={96}
            height={96}
            className="h-20 w-20 object-contain"
          />
          <div>
            <h2 className="text-base font-semibold leading-6 sm:text-xl">{category.name}</h2>
            <span className="mt-3 block text-sm text-[#93C5FD]">Посмотреть ассортимент →</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
