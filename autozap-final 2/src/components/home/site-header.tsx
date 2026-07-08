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
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Image
            src={logoSrc}
            alt=""
            width={48}
            height={48}
            priority
            className="h-11 w-11 shrink-0 rounded-[4px] bg-white object-contain p-1"
          />
          <span className="min-w-0 text-sm font-semibold leading-5 text-white sm:text-base">
            {siteName}
          </span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm font-medium text-[#D6DEE9] md:flex">
          <Link href="#catalog" className="transition hover:text-white">
            Каталог
          </Link>
          <Link href="#about" className="transition hover:text-white">
            О магазине
          </Link>
          <Link href="#contacts" className="transition hover:text-white">
            Контакты
          </Link>
        </nav>
      </div>
    </header>
  );
}
