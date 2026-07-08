import Image from "next/image";
import Link from "next/link";
import { HomeCategoryGrid } from "@/components/home/home-category-grid";
import { HomeSearch } from "@/components/home/home-search";
import { SiteHeader } from "@/components/home/site-header";
import { StoreGallery } from "@/components/home/store-gallery";
import { YandexMap } from "@/components/home/yandex-map";
import { JsonLd } from "@/components/seo/json-ld";
import { getPublicHomeContent, getStoreWorkStatusFromHours } from "@/features/content/public-home";
import { buildLocalBusinessJsonLd } from "@/features/seo/structured-data";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Home() {
  const content = await getPublicHomeContent();
  const workStatus = getStoreWorkStatusFromHours(content.workingHours);

  return (
    <main className="min-h-dvh bg-[#0B1220] text-white">
      <JsonLd data={buildLocalBusinessJsonLd(content)} />
      <SiteHeader siteName={content.brand.name} logoSrc={content.brand.logoSrc} />

      <section className="relative isolate flex min-h-[88svh] items-end overflow-hidden">
        <Image
          src="/assets/store/facade.webp"
          alt="Магазин автозапчастей на Салтыкова-Щедрина"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[#07101F]/70" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,16,31,0.25)_0%,rgba(7,16,31,0.78)_62%,#0B1220_100%)]" />

        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-10 pt-28 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-[#9DBDFB]">
              {content.contact.addressCity}, {content.contact.addressStreet}
            </p>
            <h1 className="max-w-4xl text-4xl font-semibold leading-tight sm:text-6xl lg:text-7xl">
              Автозапчасти в Талдоме
            </h1>
            <p className="mt-5 max-w-2xl text-xl font-medium leading-8 text-[#E5EAF2] sm:text-2xl">
              Более 30 000 товаров на собственном складе
            </p>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#C8D1DF] sm:text-lg">
              Поиск по каталогу, помощь с подбором и магазин, который можно посетить уже сегодня.
            </p>
            <div className="mt-8">
              <HomeSearch />
            </div>
          </div>
        </div>
      </section>

      <section id="catalog" className="border-t border-[#1D2A3D] bg-[#0B1220] py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionIntro
            eyebrow="Каталог"
            title="Категории товаров"
            text="Выберите основной раздел каталога. На главной показываются только категории."
          />
          <HomeCategoryGrid categories={content.categories} />
        </div>
      </section>

      <section id="about" className="bg-[#101827] py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.86fr_1.14fr] lg:px-8">
          <div>
            <SectionIntro
              eyebrow="О магазине"
              title="Запчасти рядом, без лишнего ожидания"
              text="Магазин на Салтыкова-Щедрина работает с собственным складом: в наличии более 30 000 товаров для обслуживания, ремонта и подготовки автомобиля к сезону."
            />
            <div className="space-y-4 text-base leading-7 text-[#C8D1DF]">
              <p>
                Здесь можно найти расходники, детали подвески, электрику, кузовные элементы,
                масла, фильтры, аксессуары и позиции для популярных отечественных и иностранных
                автомобилей.
              </p>
              <p>
                Если точное название детали неизвестно, продавец-консультант поможет сориентироваться
                по коду, описанию или назначению запчасти.
              </p>
            </div>
          </div>
          <StoreGallery photos={content.storePhotos} />
        </div>
      </section>

      <section className="border-y border-[#1D2A3D] bg-[#0B1220] py-14">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9DBDFB]">
              Не нашли нужную деталь?
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
              Подскажем по наличию и поможем с подбором в магазине
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#C8D1DF]">
              Используйте поиск по каталогу или приезжайте с названием, кодом детали или описанием
              задачи. Команда магазина поможет найти подходящий вариант.
            </p>
          </div>
          <Link
            href="/search"
            className="inline-flex min-h-12 items-center justify-center rounded-card border border-[#4169A8] px-5 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740]"
          >
            Перейти к поиску
          </Link>
        </div>
      </section>

      <section className="bg-[#101827] py-16">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div className="relative min-h-[360px] overflow-hidden rounded-card border border-[#2E3A4C] bg-[#182231]">
            <Image
              src={content.vacancy.imageSrc}
              alt={content.vacancy.imageAlt}
              fill
              sizes="(min-width: 1024px) 46vw, 100vw"
              className="object-cover"
            />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9DBDFB]">
              Вакансия
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              {content.vacancy.title}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#C8D1DF]">
              {content.vacancy.description}
            </p>
          </div>
        </div>
      </section>

      <section id="contacts" className="bg-[#0B1220] py-16">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:px-8">
          <div>
            <SectionIntro
              eyebrow="Контакты"
              title="Магазин в Талдоме"
              text="Адрес, часы работы и маршрут до магазина на улице Салтыкова-Щедрина."
            />

            <dl className="space-y-5 text-[#C8D1DF]">
              <div>
                <dt className="text-sm text-[#8FA1B8]">Адрес</dt>
                <dd className="mt-1 text-lg font-medium text-white">{content.contact.address}</dd>
              </div>
              <div>
                <dt className="text-sm text-[#8FA1B8]">Телефон</dt>
                <dd className="mt-1 text-lg font-medium text-white">{content.contact.phone}</dd>
              </div>
              <div>
                <dt className="text-sm text-[#8FA1B8]">Email</dt>
                <dd className="mt-1 text-lg font-medium text-white">{content.contact.email}</dd>
              </div>
              <div>
                <dt className="text-sm text-[#8FA1B8]">Режим работы</dt>
                <dd className="mt-1 space-y-1 text-base text-white">
                  {content.workingHoursDisplay.map((item) => (
                    <div key={item.label}>
                      {item.label}: {item.isClosed ? "выходной" : `${item.opensAt}-${item.closesAt}`}
                    </div>
                  ))}
                </dd>
              </div>
            </dl>

            <div className="mt-7 inline-flex items-center gap-3 rounded-card border border-[#2E3A4C] bg-[#182231] px-4 py-3">
              <span
                className={[
                  "h-2.5 w-2.5 rounded-full",
                  workStatus.isOpen ? "bg-[#60A5FA]" : "bg-[#64748B]"
                ].join(" ")}
              />
              <div>
                <p className="font-semibold text-white">{workStatus.label}</p>
                <p className="text-sm text-[#C8D1DF]">{workStatus.detail}</p>
              </div>
            </div>
          </div>

          <YandexMap
            apiKey={env.YANDEX_MAPS_API_KEY}
            siteName={content.brand.name}
            contact={content.contact}
          />
        </div>
      </section>

      <footer className="border-t border-[#1D2A3D] bg-[#07101F] py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 text-sm text-[#AEB8C7] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <p className="font-semibold text-white">{content.brand.name}</p>
            <p className="mt-1">{content.contact.addressStreet}, {content.contact.addressCity}</p>
          </div>
          <div className="flex gap-4">
            <Link href="/search" className="transition hover:text-white">
              Поиск
            </Link>
            <Link href="#catalog" className="transition hover:text-white">
              Каталог
            </Link>
            <Link href="#contacts" className="transition hover:text-white">
              Контакты
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function SectionIntro({
  eyebrow,
  title,
  text
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="mb-8 max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9DBDFB]">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-[#C8D1DF]">{text}</p>
    </div>
  );
}
