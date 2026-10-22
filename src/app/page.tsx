import Image from "next/image";
import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { HomeCategoryGrid } from "@/components/home/home-category-grid";
import { HomeSearch } from "@/components/home/home-search";
import { CustomerReviewsSection } from "@/components/home/customer-reviews";
import { ShopGallerySection } from "@/components/home/shop-gallery";
import { SiteHeader } from "@/components/home/site-header";
import { StoreGallery } from "@/components/home/store-gallery";
import { YandexMap } from "@/components/home/yandex-map";
import {
  CircleCheckIcon,
  ClockIcon,
  MailIcon,
  MapPinIcon,
  PackageIcon,
  PhoneIcon,
  SearchIcon,
  WarehouseIcon
} from "@/components/icons/lucide";
import { JsonLd } from "@/components/seo/json-ld";
import { PublicFooter } from "@/components/site/public-footer";
import { getPublicHomeContent, getStoreWorkStatusFromHours } from "@/features/content/public-home";
import { buildPublicPageMetadata } from "@/features/seo/metadata";
import { buildLocalBusinessJsonLd } from "@/features/seo/structured-data";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const homeTitle = "Магазин автозапчастей в Талдоме | Автозапчасти на Салтыкова-Щедрина";
const homeDescription =
  "Магазин автозапчастей в Талдоме. Более 30 000 товаров для легковых и коммерческих автомобилей, помощь в подборе запчастей и актуальные цены.";

export const metadata: Metadata = buildPublicPageMetadata({
  title: homeTitle,
  description: homeDescription,
  path: "/"
});

const aboutFacts = [
  { value: "30 000+", label: "товаров на складе" },
  { value: "30 лет", label: "опыта" },
  { value: "7 дней", label: "в неделю" },
  { value: "Заказ", label: "редких деталей" }
];

const heroBenefitIcons = [PackageIcon, WarehouseIcon, SearchIcon, ClockIcon];

export default async function Home() {
  const content = await getPublicHomeContent();
  const workStatus = getStoreWorkStatusFromHours(content.workingHours);
  const compactWorkingHours = getCompactWorkingHours(content.workingHoursDisplay);
  const heroDescription = content.home.hero.text
    .replace(" Можно приехать сегодня.", "")
    .replace(/\.$/, "");
  const heroSubtitle = content.home.hero.subtitle.replace(/\.$/, "");

  return (
    <main data-autozap-analytics-page="true" className="home-page premium-page min-h-dvh">
      <JsonLd data={buildLocalBusinessJsonLd(content)} />
      <SiteHeader siteName="Автозапчасти на Салтыкова-Щедрина" />

      <section className="home-hero relative isolate overflow-hidden">
        <div className="home-hero-content-surface pointer-events-none absolute inset-y-0 left-0" />
        <div className="home-hero-media pointer-events-none absolute inset-x-0 top-0">
          <Image
            src="/assets/store/facade-clean.png"
            alt="Магазин автозапчастей на Салтыкова-Щедрина"
            fill
            priority
            sizes="100vw"
            className="home-hero-image object-cover"
          />
        </div>
        <div className="home-hero-overlay pointer-events-none absolute inset-x-0 top-0" />

        <div className="home-hero-shell relative z-10 mx-auto w-full max-w-7xl px-5 lg:px-12">
          <div className="home-hero-copy max-w-[640px]">
            <div className="home-hero-intro">
              <h1 className="home-hero-title">{content.home.hero.title}</h1>
              <div className="home-hero-supporting-copy">
                <p className="home-hero-subtitle">{heroSubtitle}</p>
                <p className="home-hero-text">{heroDescription}</p>
              </div>
            </div>

            <div className="home-hero-search-wrap">
              <HomeSearch />
            </div>
          </div>

          <ul className="home-hero-proof">
            {content.home.hero.highlights.map((item, index) => {
              const Icon = heroBenefitIcons[index] ?? CircleCheckIcon;

              return (
                <li key={item} className="home-hero-proof-item">
                  <span className="home-hero-benefit-icon">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>{item}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section id="catalog" className="catalog-section section-shell section-soft scroll-mt-28 py-11 sm:scroll-mt-24 sm:py-16 lg:py-20">
        <div className="catalog-shell mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="catalog-mobile-heading">
            <SectionIntro
              eyebrow={content.home.catalog.eyebrow}
              title={content.home.catalog.title}
              text=""
            />
          </div>
          <h2 className="catalog-desktop-heading">Каталог товаров</h2>
          <HomeCategoryGrid categories={content.categories} />
        </div>
      </section>

      <section id="about" className="home-about section-shell section-deep scroll-mt-28 border-t border-white/10 pb-10 pt-12 sm:scroll-mt-24 sm:pb-[52px] sm:pt-16 lg:pb-16 lg:pt-20">
        <div className="home-about-shell mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.96fr_1.04fr] lg:items-start lg:px-8">
          <p className="home-about-desktop-label">{content.home.about.eyebrow}</p>
          <div className="home-about-copy scroll-reveal">
            <div className="home-about-mobile-intro">
              <SectionIntro
                eyebrow={content.home.about.eyebrow}
                title={content.home.about.title}
                text=""
              />
            </div>
            <h2 className="home-about-desktop-title">{content.home.about.title}</h2>
            <div className="home-about-description max-w-2xl text-base font-normal leading-7 text-[#D6DEE9] sm:text-lg sm:leading-8">
              <p>{content.home.about.intro}</p>
            </div>
            <div className="home-about-facts mt-7 grid grid-cols-2 gap-3 min-[760px]:grid-cols-4 lg:mt-16 lg:grid-cols-2 xl:grid-cols-4">
              {aboutFacts.map((fact) => (
                <div
                  key={fact.label}
                  className="home-about-fact flex min-h-[112px] flex-col justify-between rounded-card border border-white/10 bg-[linear-gradient(145deg,rgba(31,41,55,0.96),rgba(17,24,39,1))] px-4 py-5 shadow-[0_18px_58px_rgba(0,0,0,0.24)]"
                >
                  <p className="home-about-fact-value whitespace-nowrap text-[clamp(1.28rem,2vw,1.72rem)] font-semibold leading-tight text-white">
                    {fact.value}
                  </p>
                  <p className="home-about-fact-label mt-3 text-[0.9rem] font-medium leading-5 text-[#93C5FD]">
                    {fact.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="home-about-media scroll-reveal grid gap-4 rounded-card border border-white/10 bg-[linear-gradient(145deg,rgba(31,41,55,0.86),rgba(17,24,39,0.96))] p-3 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
            <StoreGallery photos={content.storePhotos} />
            <YandexMap
              apiKey={env.YANDEX_MAPS_API_KEY}
              siteName={content.brand.name}
              contact={content.contact}
            />
          </div>
        </div>
      </section>

      <ShopGallerySection />

      <CustomerReviewsSection />

      <section id="vacancies" className="home-vacancies-section section-shell section-soft scroll-mt-28 py-11 sm:scroll-mt-24 sm:py-16 lg:py-20">
        <div className="home-vacancies-shell mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="home-vacancies-panel">
            <div className="home-vacancies-intro">
              <SectionIntro
                eyebrow={content.home.vacancies.eyebrow}
                title={content.home.vacancies.title}
                text={content.home.vacancies.text}
              />
            </div>
            <div className="home-vacancies-list mx-auto grid max-w-3xl gap-5">
              {content.vacancies.map((vacancy, index) => (
                <article
                  key={vacancy.id}
                  className="home-vacancy scroll-reveal stagger-card group flex h-full flex-col overflow-hidden rounded-card border border-white/10 bg-[linear-gradient(145deg,rgba(31,41,55,0.96),rgba(17,24,39,1))] shadow-[0_24px_80px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-1.5 hover:border-[#2563EB]/70 hover:shadow-[0_32px_110px_rgba(37,99,235,0.22)]"
                  style={{ "--stagger": `${index * 80}ms` } as CSSProperties}
                >
                  <div className="home-vacancy-media relative aspect-[16/8.5] overflow-hidden bg-[#0B1220] sm:aspect-video">
                    <Image
                      src="/assets/vacancy/vacancy-employee.webp"
                      alt="Продавец-консультант в магазине автозапчастей"
                      fill
                      sizes="(min-width: 1280px) 1px, (min-width: 1024px) 720px, 100vw"
                      className="object-cover object-center transition duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="home-vacancy-content flex flex-1 flex-col p-4 sm:p-6">
                    <h3 className="home-vacancy-title text-xl font-semibold leading-tight text-white sm:text-3xl">
                      {vacancy.title}
                    </h3>
                    <p className="home-vacancy-description mt-3 text-sm leading-6 text-[#CBD5E1] sm:mt-4 sm:text-base sm:leading-7">
                      Если вам интересна работа в сфере автозапчастей и вы хотите стать частью нашей
                      команды — будем рады познакомиться.
                    </p>
                    <ul className="home-vacancy-points mt-5 grid gap-3 text-sm leading-6 text-[#D6DEE9] sm:mt-6 sm:grid-cols-2 sm:text-base">
                      {[
                        "Консультирование покупателей",
                        "Работа с ассортиментом автозапчастей",
                        "Обучение в процессе работы",
                        "Дружный коллектив"
                      ].map((item) => (
                        <li key={item} className="flex items-start gap-3">
                          <CircleCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#93C5FD]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <a
                      href="tel:84962063304"
                      className="home-vacancy-contact mt-5 rounded-card border border-white/10 bg-[#0B1220] p-4 transition duration-300 hover:border-[#2563EB]/60 sm:mt-6"
                    >
                      <div className="flex items-start gap-3">
                        <PhoneIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#93C5FD]" />
                        <div>
                          <p className="font-semibold text-white">Подробности по телефону</p>
                          <p className="mt-1 text-base text-[#CBD5E1]">8 (496) 206-33-04</p>
                        </div>
                      </div>
                    </a>
                    <div className="home-vacancy-desktop-contact">
                      <p>Подробности по телефону</p>
                      <a
                        href="tel:84962063304"
                        className="home-vacancy-phone customer-reviews-action customer-reviews-action-primary"
                      >
                        8 (496) 206-33-04
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="contacts" className="home-contacts-section section-shell section-deep scroll-mt-28 py-11 sm:scroll-mt-24 sm:py-16 lg:py-20">
        <div className="home-contacts-shell mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="home-contacts-layout scroll-reveal rounded-card border border-white/10 bg-[#111827] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.26)] sm:p-6 lg:p-8">
            <div>
              <h2 className="home-contacts-title text-2xl font-semibold leading-tight text-white sm:text-4xl">
                Магазин в Талдоме
              </h2>
              <dl className="home-contacts-grid mt-6 grid gap-x-6 gap-y-6 text-[#CBD5E1] sm:grid-cols-2 lg:grid-cols-[1.15fr_0.78fr_1.22fr_0.98fr] lg:items-start">
                <ContactItem
                  className="home-contact-address"
                  icon={<MapPinIcon className="h-5 w-5 text-[#93C5FD]" />}
                  label="Адрес"
                  value={content.contact.address}
                />
                <ContactItem
                  className="home-contact-phone"
                  icon={<PhoneIcon className="h-5 w-5 text-[#93C5FD]" />}
                  label="Телефон"
                  value={content.contact.phone}
                  href={toTelHref(content.contact.phone)}
                  valueClassName="whitespace-nowrap text-base sm:text-lg"
                />
                <ContactItem
                  className="home-contact-email"
                  icon={<MailIcon className="h-5 w-5 text-[#93C5FD]" />}
                  label="Email"
                  value={<EmailValue email={content.contact.email} />}
                  href={`mailto:${content.contact.email}`}
                  valueClassName="text-sm sm:text-[0.95rem] lg:whitespace-nowrap xl:text-base"
                />
                <div className="home-contact-hours grid gap-3">
                  <ContactItem
                    icon={<ClockIcon className="h-5 w-5 text-[#93C5FD]" />}
                    label="Режим работы"
                    value={
                      <span className="home-contact-schedule space-y-1">
                        {compactWorkingHours.map((item) => (
                          <span key={item.label} className="home-contact-schedule-row block whitespace-nowrap">
                            <span>{item.label}</span><span className="home-contact-schedule-colon">: </span><span>{item.time}</span>
                          </span>
                        ))}
                      </span>
                    }
                    valueClassName="text-sm sm:text-base"
                  />
                  <div className="home-contact-status w-full max-w-[260px] rounded-card border border-white/10 bg-[#0B1220] px-4 py-3 shadow-[0_16px_50px_rgba(0,0,0,0.2)]">
                    <div className="flex items-start gap-3">
                      <span
                        className={[
                          "home-contact-status-dot mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                          workStatus.isOpen ? "bg-[#22C55E]" : "bg-[#EF4444]"
                        ].join(" ")}
                      />
                      <div>
                        <p className="font-semibold text-white">{workStatus.label}</p>
                        <p className="mt-1 text-sm leading-5 text-[#CBD5E1]">{workStatus.detail}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="home-contacts-separator" aria-hidden="true" />
              </dl>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter content={content} />
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
    <div className="mb-6 max-w-3xl sm:mb-8">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#93C5FD] sm:text-sm">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold leading-tight text-white sm:mt-3 sm:text-4xl">
        {title}
      </h2>
      {text.trim() ? (
        <p className="mt-3 text-sm leading-6 text-[#CBD5E1] sm:mt-4 sm:text-base sm:leading-7">
          {text}
        </p>
      ) : null}
    </div>
  );
}

function ContactItem({
  className = "",
  icon,
  label,
  value,
  href,
  valueClassName = "text-base sm:text-lg"
}: {
  className?: string;
  icon: ReactNode;
  label: string;
  value: ReactNode;
  href?: string;
  valueClassName?: string;
}) {
  const valueNode = href ? (
    <a href={href} className="transition hover:text-[#93C5FD]">
      {value}
    </a>
  ) : (
    value
  );

  return (
    <div className={["home-contact-item min-w-0", className].join(" ")}>
      <div className="flex items-start gap-3">
        <span className="mt-1 shrink-0">{icon}</span>
        <div className="min-w-0">
          <dt className="text-xs text-[#94A3B8] sm:text-sm">{label}</dt>
          <dd className={["mt-2 font-semibold leading-6 text-white", valueClassName].join(" ")}>
            {valueNode}
          </dd>
        </div>
      </div>
    </div>
  );
}

function EmailValue({ email }: { email: string }) {
  const [localPart, domain] = email.split("@");
  const separatorIndex = localPart.indexOf("-");

  if (!domain) {
    return <span>{email}</span>;
  }

  if (separatorIndex === -1) {
    return <span>{localPart}@{domain}</span>;
  }

  const prefix = localPart.slice(0, separatorIndex);
  const suffix = localPart.slice(separatorIndex + 1);

  return (
    <span>
      <span className="whitespace-nowrap">
        {prefix}-{suffix}
      </span>
      @{domain}
    </span>
  );
}

function getCompactWorkingHours(
  hours: Array<{ label: string; opensAt: string; closesAt: string; isClosed: boolean }>
) {
  return hours.map((item) => ({
    label: toShortHoursLabel(item.label),
    time: item.isClosed ? "выходной" : `${item.opensAt}–${item.closesAt}`
  }));
}

function toShortHoursLabel(label: string) {
  return label
    .replace("Понедельник", "Пн")
    .replace("Вторник", "Вт")
    .replace("Среда", "Ср")
    .replace("Четверг", "Чт")
    .replace("Пятница", "Пт")
    .replace("Суббота", "Сб")
    .replace("Воскресенье", "Вс");
}

function toTelHref(phone: string) {
  const normalized = phone.replace(/\D/g, "");
  return normalized ? `tel:${normalized.startsWith("8") ? `7${normalized.slice(1)}` : normalized}` : undefined;
}
