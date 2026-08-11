import Image from "next/image";
import Link from "next/link";
import { publicBrandLogoSrc } from "@/config/public-brand";
import { PurchaseListNavigationLink } from "@/components/purchase-list/purchase-list-navigation-link";

const navigationItems = [
  { href: "#catalog", label: "Каталог" },
  { href: "#about", label: "О магазине" },
  { href: "#reviews", label: "Отзывы" },
  { href: "#vacancies", label: "Вакансии" },
  { href: "#contacts", label: "Контакты" }
];

export function SiteHeader({
  siteName
}: {
  siteName: string;
}) {
  return (
    <header className="relative z-20 bg-[#111827] lg:absolute lg:left-0 lg:right-0 lg:top-0 lg:bg-transparent">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <Image
              src={publicBrandLogoSrc}
              alt=""
              width={120}
              height={120}
              priority
              unoptimized
              className="aspect-square h-[52px] w-[52px] shrink-0 object-contain drop-shadow-[0_1px_1px_rgba(226,232,240,0.2)] sm:h-14 sm:w-14"
            />
            <span className="min-w-0 max-w-[218px] text-xs font-semibold leading-4 text-white sm:max-w-none sm:text-base sm:leading-5">
              {siteName}
            </span>
          </Link>

          <nav className="hidden items-center gap-2 rounded-card border border-white/10 bg-[#111827]/[0.58] p-1 text-sm font-medium text-[#D6DEE9] shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-md lg:flex">
            {navigationItems.map((item) => (
              <Link key={item.href} href={item.href} className="tap-target transition hover:text-white">
                <span className="block whitespace-nowrap rounded-card px-3 py-2 transition hover:bg-white/10">
                  {item.label}
                </span>
              </Link>
            ))}
            <PurchaseListNavigationLink
              className="tap-target block whitespace-nowrap rounded-card px-3 py-2 pr-7 transition hover:bg-white/10 hover:text-white"
            />
          </nav>
        </div>

        <nav className="mt-3 grid grid-cols-6 gap-1.5 text-[0.72rem] font-medium text-[#D6DEE9] sm:gap-2 sm:text-sm lg:hidden">
          {navigationItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="tap-target col-span-2 flex min-h-9 min-w-0 items-center justify-center whitespace-nowrap rounded-card border border-white/10 bg-white/[0.06] px-1.5 py-2 leading-5 hover:border-[#2563EB]/60 hover:bg-white/[0.1] hover:text-white sm:px-2.5"
            >
              {item.label}
            </Link>
          ))}
          <PurchaseListNavigationLink
            mobileLabel="Список"
            className="tap-target col-span-2 flex min-h-9 min-w-0 items-center justify-center whitespace-nowrap rounded-card border border-white/10 bg-white/[0.06] px-1.5 py-2 leading-5 hover:border-[#2563EB]/60 hover:bg-white/[0.1] hover:text-white sm:px-2.5"
          />
        </nav>
      </div>
    </header>
  );
}
