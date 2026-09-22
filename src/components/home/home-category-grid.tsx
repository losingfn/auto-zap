import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ChevronRightIcon } from "@/components/icons/lucide";
import type { PublicCategory } from "@/features/catalog/types";

const desktopCategoryOrder = [
  "podveska",
  "elektrika",
  "tormoznaya-sistema",
  "filtry-i-masla",
  "dvigatel-i-transmissiya",
  "kuzov-i-optika",
  "aksessuary",
  "ves-assortiment"
] as const;

const desktopCategoryArtBySlug = new Map<string, string>([
  ["tormoznaya-sistema", "/assets/categories/desktop-tormoznaya-sistema.webp"],
  ["podveska", "/assets/categories/desktop-podveska.webp"],
  ["elektrika", "/assets/categories/desktop-elektrika.webp"],
  ["filtry-i-masla", "/assets/categories/desktop-filtry-i-masla.webp"],
  ["dvigatel-i-transmissiya", "/assets/categories/desktop-dvigatel-i-transmissiya.webp"],
  ["kuzov-i-optika", "/assets/categories/desktop-kuzov-i-optika.webp"],
  ["aksessuary", "/assets/categories/desktop-aksessuary.webp"],
  ["ves-assortiment", "/assets/categories/desktop-ves-assortiment.webp"]
]);

export function HomeCategoryGrid({ categories }: { categories: PublicCategory[] }) {
  const desktopOrderBySlug = new Map<string, number>(
    desktopCategoryOrder.map((slug, index) => [slug, index] as const)
  );
  const desktopCategories = [...categories].sort(
    (left, right) =>
      (desktopOrderBySlug.get(left.slug) ?? Number.MAX_SAFE_INTEGER) -
      (desktopOrderBySlug.get(right.slug) ?? Number.MAX_SAFE_INTEGER)
  );

  return (
    <>
      <div className="catalog-category-grid-mobile grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {categories.map((category, index) => (
          <Link
            key={category.slug}
            href={`/catalog/${category.slug}`}
            className="tap-target scroll-reveal stagger-card group relative isolate flex min-h-[186px] flex-col overflow-hidden rounded-[8px] border border-[#273142]/90 bg-[linear-gradient(180deg,#171B26_0%,#111721_58%,#0E141D_100%)] px-3 pb-4 pt-4 shadow-[0_22px_70px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-1px_0_rgba(0,0,0,0.28)] transition duration-500 hover:-translate-y-2 hover:border-[#365A91] hover:bg-[linear-gradient(180deg,#192131_0%,#111924_58%,#0D131C_100%)] hover:shadow-[0_34px_100px_rgba(0,0,0,0.48),0_0_46px_rgba(37,99,235,0.2),inset_0_1px_0_rgba(255,255,255,0.075)] sm:min-h-[300px] sm:px-5 sm:pb-7 sm:pt-8 lg:min-h-[388px] lg:px-7 lg:pb-10 lg:pt-11"
            style={{ "--stagger": `${index * 60}ms` } as CSSProperties}
          >
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.07]" />
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(37,99,235,0.09),transparent_43%)] opacity-70 transition duration-500 group-hover:opacity-100" />
            <span className="pointer-events-none absolute -inset-x-10 -top-16 h-36 bg-[#2563EB]/[0.045] blur-3xl transition duration-500 group-hover:bg-[#2563EB]/[0.085]" />
            <div className="relative z-10 flex h-[108px] w-full items-center justify-center sm:h-40 lg:h-52">
              <Image
                src={category.icon}
                alt=""
                width={230}
                height={230}
                className={[
                  "object-contain drop-shadow-[0_16px_24px_rgba(0,0,0,0.36)] transition duration-500 group-hover:scale-[1.055]",
                  category.slug === "kuzov-i-optika"
                    ? "h-[270px] w-[180px] max-w-none sm:h-36 sm:w-full sm:max-w-[172px] lg:h-[555px] lg:w-[370px] lg:max-w-none"
                    : [
                        "h-[108px] w-full max-w-[140px] sm:h-36 sm:max-w-[172px] lg:h-52 lg:max-w-[248px]",
                        mobileCategoryIconScaleClassName(category.slug)
                      ].join(" ")
                ].join(" ")}
              />
            </div>
            <div className="relative z-10 mt-auto">
              <h3 className="text-base font-semibold leading-[1.12] text-white sm:text-[24px] lg:text-[30px]">
                {category.name}
              </h3>
              <span className="mt-4 inline-flex items-center text-[0.72rem] font-medium leading-4 text-[#67A7E8] transition duration-300 group-hover:translate-x-1.5 group-hover:text-[#93C5FD] sm:mt-6 sm:text-sm lg:mt-7 lg:text-lg">
                Посмотреть ассортимент →
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="catalog-category-grid-desktop">
        {desktopCategories.map((category) => {
          const artSrc = desktopCategoryArtBySlug.get(category.slug);

          return (
            <Link
              key={category.slug}
              href={`/catalog/${category.slug}`}
              className={[
                "catalog-category-button tap-target",
                artSrc ? "catalog-category-button--with-art" : ""
              ].join(" ")}
            >
              <span className="catalog-category-icon-zone" aria-hidden="true">
                {artSrc ? (
                  <Image
                    src={artSrc}
                    alt=""
                    width={1024}
                    height={1024}
                    className="catalog-category-art"
                  />
                ) : null}
              </span>
              <h3 className="catalog-category-button-title">{category.name}</h3>
              <span className="catalog-category-button-arrow" aria-hidden="true">
                <ChevronRightIcon className="h-[18px] w-[18px]" />
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function mobileCategoryIconScaleClassName(slug: string) {
  return (
    {
      podveska: "scale-[1.05] sm:scale-100",
      elektrika: "scale-[1.03] sm:scale-100",
      "filtry-i-masla": "scale-[1.02] sm:scale-100",
      "tormoznaya-sistema": "scale-[0.94] sm:scale-100",
      "dvigatel-i-transmissiya": "scale-[0.96] sm:scale-100",
      aksessuary: "scale-[1.06] sm:scale-100",
      "ves-assortiment": "scale-[1.03] sm:scale-100"
    }[slug] ?? "scale-100"
  );
}
