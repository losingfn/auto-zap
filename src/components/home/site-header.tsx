import Image from "next/image";
import Link from "next/link";

export function SiteHeader({
  siteName,
  logoSrc
}: {
  siteName: string;
  logoSrc: string;
}) {
  return (
    <header className="absolute left-0 right-0 top-0 z-20">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
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

        <nav className="hidden items-center gap-2 rounded-card border border-white/10 bg-[#111827]/[0.58] p-1 text-sm font-medium text-[#D6DEE9] shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-md md:flex">
          <Link href="#catalog" className="transition hover:text-white">
            <span className="block rounded-card px-3 py-2 transition hover:bg-white/10">Каталог</span>
          </Link>
          <Link href="#about" className="transition hover:text-white">
            <span className="block rounded-card px-3 py-2 transition hover:bg-white/10">О магазине</span>
          </Link>
          <Link href="#vacancies" className="transition hover:text-white">
            <span className="block rounded-card px-3 py-2 transition hover:bg-white/10">Вакансии</span>
          </Link>
          <Link href="#contacts" className="transition hover:text-white">
            <span className="block rounded-card px-3 py-2 transition hover:bg-white/10">Контакты</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
