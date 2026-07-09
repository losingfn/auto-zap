import Image from "next/image";
import Link from "next/link";

const navigationItems = [
  { href: "#catalog", label: "Каталог" },
  { href: "#about", label: "О магазине" },
  { href: "#reviews", label: "Отзывы" },
  { href: "#vacancies", label: "Вакансии" },
  { href: "#contacts", label: "Контакты" }
];

export function SiteHeader({
  siteName,
  logoSrc
}: {
  siteName: string;
  logoSrc: string;
}) {
  return (
    <header className="relative z-20 bg-[#111827] lg:absolute lg:left-0 lg:right-0 lg:top-0 lg:bg-transparent">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <Image
              src={logoSrc}
              alt=""
              width={48}
              height={48}
              priority
              className="h-10 w-10 shrink-0 rounded-[4px] bg-white object-contain p-1 shadow-[0_14px_38px_rgba(0,0,0,0.28)] sm:h-11 sm:w-11"
            />
            <span className="min-w-0 max-w-[218px] text-xs font-semibold leading-4 text-white sm:max-w-none sm:text-base sm:leading-5">
              {siteName}
            </span>
          </Link>

          <nav className="hidden items-center gap-2 rounded-card border border-white/10 bg-[#111827]/[0.58] p-1 text-sm font-medium text-[#D6DEE9] shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-md lg:flex">
            {navigationItems.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-white">
                <span className="block whitespace-nowrap rounded-card px-3 py-2 transition hover:bg-white/10">
                  {item.label}
                </span>
              </Link>
            ))}
          </nav>
        </div>

        <nav className="mt-3 grid grid-cols-6 gap-1.5 text-[0.72rem] font-medium text-[#D6DEE9] sm:grid-cols-5 sm:gap-2 sm:text-sm lg:hidden">
          {navigationItems.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex min-h-9 min-w-0 items-center justify-center whitespace-nowrap rounded-card border border-white/10 bg-white/[0.06] px-1.5 py-2 leading-5 transition hover:border-[#2563EB]/60 hover:bg-white/[0.1] hover:text-white sm:col-span-1 sm:px-2.5",
                index < 3 ? "col-span-2" : "col-span-3"
              ].join(" ")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
