import Image from "next/image";
import Link from "next/link";
import type { PublicCategory } from "@/features/catalog/types";

export function HomeCategoryGrid({ categories }: { categories: PublicCategory[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {categories.map((category) => (
        <Link
          key={category.slug}
          href={`/catalog/${category.slug}`}
          className="group flex min-h-40 flex-col justify-between rounded-card border border-[#2E3A4C] bg-[#182231] p-4 transition hover:border-[#5B8DEF] hover:bg-[#1D2B3D] sm:min-h-48"
        >
          <Image
            src={category.icon}
            alt=""
            width={92}
            height={92}
            className="h-16 w-16 object-contain sm:h-20 sm:w-20"
          />
          <div className="pt-4">
            <h3 className="text-sm font-semibold leading-5 text-white sm:text-lg sm:leading-6">
              {category.name}
            </h3>
            <span className="mt-3 block text-xs font-medium text-[#9DBDFB] sm:text-sm">
              Перейти в раздел
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
