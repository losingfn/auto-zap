import Image from "next/image";
import Link from "next/link";
import { publicBrandLogoSrc } from "@/config/public-brand";
import { getPublicHomeContent, type PublicHomeContent } from "@/features/content/public-home";

export async function PublicFooter({ content }: { content?: PublicHomeContent }) {
  const data = content ?? (await getPublicHomeContent());

  return (
    <footer className="border-t border-white/10 bg-[#0B1220] py-7 sm:py-10">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 text-sm text-[#CBD5E1] sm:gap-8 sm:px-6 lg:grid-cols-[1.2fr_1fr_0.8fr] lg:px-8">
        <div>
          <div className="flex items-center gap-3">
            <Image
              src={publicBrandLogoSrc}
              alt=""
              width={44}
              height={44}
              className="aspect-square h-14 w-14 shrink-0 object-contain drop-shadow-[0_1px_3px_rgba(226,232,240,0.3)] sm:h-[60px] sm:w-[60px]"
            />
            <p className="max-w-sm text-sm font-semibold leading-5 text-white sm:text-base sm:leading-6">
              {data.brand.name}
            </p>
          </div>
          <p className="mt-4 max-w-md leading-6 sm:mt-5">{data.contact.address}</p>
          <p className="mt-3 text-xs text-[#94A3B8] sm:mt-4">© 2026 {data.brand.name}</p>
          <p className="mt-2 max-w-md text-xs leading-5 text-[#94A3B8]">
            Автозапчасти для легковых и коммерческих автомобилей.
          </p>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-white">Контакты</p>
          <p>{data.contact.phone}</p>
          <p>{data.contact.email}</p>
        </div>
        <nav className="flex flex-col gap-3 font-medium text-white">
          <Link href="/#catalog" className="tap-target transition hover:text-[#93C5FD]">
            Каталог
          </Link>
          <Link href="/#reviews" className="tap-target transition hover:text-[#93C5FD]">
            Отзывы
          </Link>
          <Link href="/#contacts" className="tap-target transition hover:text-[#93C5FD]">
            Контакты
          </Link>
          <Link href="/#vacancies" className="tap-target transition hover:text-[#93C5FD]">
            Вакансии
          </Link>
        </nav>
      </div>
    </footer>
  );
}
