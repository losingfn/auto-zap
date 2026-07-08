import { and, asc, eq } from "drizzle-orm";
import { catalogCategories } from "@/config/categories";
import { siteConfig } from "@/config/site";
import { db } from "@/db/client";
import {
  assets,
  businessHours,
  categories,
  contacts,
  siteSettings,
  vacancies
} from "@/db/schema";
import type { PublicCategory } from "@/features/catalog/types";
import { formatBusinessTime, formatStorePhone } from "@/lib/format";

const PUBLIC_CONTENT_TIMEOUT_MS = 2500;

const DEFAULT_STORE_PHOTOS = [
  {
    src: "/assets/store/facade.webp",
    alt: "Фасад магазина автозапчастей"
  },
  {
    src: "/assets/store/entrance.webp",
    alt: "Вход в магазин автозапчастей"
  },
  {
    src: "/assets/store/building.webp",
    alt: "Здание магазина на улице Салтыкова-Щедрина"
  }
];

export type HomeBenefitIcon = "warehouse" | "selection" | "delivery" | "history";

export type HomeContent = {
  hero: {
    title: string;
    subtitle: string;
    text: string;
    highlights: string[];
  };
  catalog: SectionTextContent;
  benefits: SectionTextContent & {
    items: Array<{
      icon: HomeBenefitIcon;
      title: string;
      text: string;
    }>;
  };
  about: {
    eyebrow: string;
    title: string;
    intro: string;
    text: string;
  };
  orderParts: {
    title: string;
    text: string;
    primaryButton: string;
    secondaryButton: string;
  };
  vacancies: SectionTextContent;
  contacts: SectionTextContent;
};

type SectionTextContent = {
  eyebrow: string;
  title: string;
  text: string;
};

const DEFAULT_VACANCIES = [
  {
    id: "default-vacancy",
    title: "Требуется продавец-консультант",
    description:
      "Полная занятость, график обсуждается, опыт приветствуется.",
    imageSrc: "/assets/vacancy/vacancy-employee.webp",
    imageAlt: "Продавец-консультант магазина автозапчастей",
    isPublished: true,
    sortOrder: 10
  }
];

export const DEFAULT_HOME_CONTENT = {
  hero: {
    title: "Автозапчасти в Талдоме",
    subtitle: "Запчасти и расходники на Салтыкова-Щедрина",
    text: "Подберём детали для обслуживания и ремонта автомобиля. Можно приехать сегодня.",
    highlights: ["30 000+ товаров", "Собственный склад", "Подбор запчастей", "Работаем ежедневно"]
  },
  catalog: {
    eyebrow: "Каталог",
    title: "Категории товаров",
    text: "Выберите нужный раздел каталога."
  },
  benefits: {
    eyebrow: "Преимущества",
    title: "Почему выбирают нас",
    text: "",
    items: [
      {
        icon: "warehouse",
        title: "Подскажем по детали",
        text: "Поможем понять, что подойдёт для конкретной задачи."
      },
      {
        icon: "selection",
        title: "Заказ редких позиций",
        text: "Сориентируем по срокам поставки, если нужной позиции нет рядом."
      },
      {
        icon: "delivery",
        title: "Можно приехать лично",
        text: "Адрес, карта и режим работы доступны без лишних шагов."
      },
      {
        icon: "history",
        title: "Опытная точка в городе",
        text: "Работаем для водителей Талдома уже много лет."
      }
    ]
  },
  about: {
    eyebrow: "О магазине",
    title: "Запчасти рядом, без лишнего ожидания",
    intro:
      "Большой выбор запчастей для отечественных легковых автомобилей, грузового транспорта и иномарок. Ежедневные поставки, помощь с подбором и возможность заказать нужную деталь, если её нет в наличии. Уже 30 лет работаем для вас и ценим доверие каждого клиента.",
    text: ""
  },
  orderParts: {
    title: "Не нашли нужную деталь?",
    text:
      "Не нашли запчасть в каталоге? Поможем подобрать и заказать нужную деталь у проверенных поставщиков.",
    primaryButton: "Связаться с магазином",
    secondaryButton: "Перейти в каталог"
  },
  vacancies: {
    eyebrow: "Вакансии",
    title: "Работа в магазине",
    text: ""
  },
  contacts: {
    eyebrow: "Контакты",
    title: "Магазин в Талдоме",
    text: "Адрес, телефон и режим работы магазина."
  }
} satisfies HomeContent;

const DEFAULT_VACANCY = {
  title: "Требуется продавец-консультант",
  description:
    "Полная занятость, график обсуждается, опыт приветствуется.",
  imageSrc: "/assets/vacancy/vacancy-employee.webp",
  imageAlt: "Продавец-консультант магазина автозапчастей",
  isPublished: true
};

export type PublicBusinessHour = {
  dayOfWeek: number;
  label: string;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
};

export type PublicHomeContent = {
  brand: {
    name: string;
    logoSrc: string;
    faviconSrc: string;
    ogImageSrc: string;
  };
  contact: {
    name: string;
    phone: string;
    email: string;
    address: string;
    addressCity: string;
    addressStreet: string;
    latitude: number;
    longitude: number;
    yandexMapsUrl: string;
  };
  workingHours: PublicBusinessHour[];
  workingHoursDisplay: {
    label: string;
    opensAt: string;
    closesAt: string;
    isClosed: boolean;
  }[];
  storePhotos: {
    src: string;
    alt: string;
  }[];
  home: HomeContent;
  vacancies: Array<(typeof DEFAULT_VACANCIES)[number]>;
  categories: PublicCategory[];
};

export async function getPublicHomeContent(): Promise<PublicHomeContent> {
  return withPublicContentTimeout(loadPublicHomeContent(), getFallbackHomeContent());
}

async function loadPublicHomeContent(): Promise<PublicHomeContent> {
  try {
    const [
      contactRows,
      hourRows,
      storePhotoRows,
      vacancyRows,
      categoryRows,
      brandRows,
      settingRows
    ] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.id, 1)).limit(1),
      db.select().from(businessHours).orderBy(asc(businessHours.dayOfWeek)),
      db
        .select({
          publicPath: assets.publicPath,
          altText: assets.altText,
          sortOrder: assets.sortOrder
        })
        .from(assets)
        .where(and(eq(assets.kind, "store_photo"), eq(assets.isActive, true)))
        .orderBy(asc(assets.sortOrder), asc(assets.createdAt)),
      db
        .select({
          id: vacancies.id,
          title: vacancies.title,
          description: vacancies.description,
          isPublished: vacancies.isPublished,
          imagePath: assets.publicPath,
          imageAlt: assets.altText,
          sortOrder: vacancies.sortOrder
        })
        .from(vacancies)
        .leftJoin(assets, eq(assets.id, vacancies.imageAssetId))
        .where(eq(vacancies.isPublished, true))
        .orderBy(asc(vacancies.sortOrder), asc(vacancies.createdAt)),
      db
        .select({
          id: categories.id,
          slug: categories.slug,
          name: categories.name,
          description: categories.description,
          sortOrder: categories.sortOrder,
          iconPath: assets.publicPath
        })
        .from(categories)
        .leftJoin(assets, eq(assets.id, categories.iconAssetId))
        .where(eq(categories.isActive, true))
        .orderBy(asc(categories.sortOrder), asc(categories.name)),
      db
        .select({
          kind: assets.kind,
          publicPath: assets.publicPath
        })
        .from(assets)
        .where(eq(assets.isActive, true))
        .orderBy(asc(assets.sortOrder), asc(assets.createdAt)),
      db.select().from(siteSettings).where(eq(siteSettings.key, "home_content")).limit(1)
    ]);

    const contact = contactRows[0];
    const brandByKind = new Map(brandRows.map((asset) => [asset.kind, asset.publicPath]));
    const hours = hourRows.length > 0 ? hourRows.map(toPublicBusinessHour) : defaultHours();
    const home = mergeHomeContent(settingRows[0]?.value);

    return {
      brand: {
        name: contact?.name ?? siteConfig.name,
        logoSrc: brandByKind.get("logo") ?? "/assets/brand/logo-mark.png",
        faviconSrc: brandByKind.get("favicon") ?? "/favicon.ico",
        ogImageSrc: brandByKind.get("og_image") ?? "/og/store-front.webp"
      },
      contact: {
        name: contact?.name ?? siteConfig.name,
        phone: formatStorePhone(contact?.phone ?? siteConfig.phone),
        email: contact?.email ?? siteConfig.email,
        address: contact?.address ?? siteConfig.address.full,
        addressCity: siteConfig.address.city,
        addressStreet: extractStreet(contact?.address ?? siteConfig.address.full),
        latitude: Number(contact?.latitude ?? siteConfig.address.latitude),
        longitude: Number(contact?.longitude ?? siteConfig.address.longitude),
        yandexMapsUrl: contact?.yandexMapsUrl ?? siteConfig.yandexMapsUrl
      },
      workingHours: hours,
      workingHoursDisplay: groupHoursForDisplay(hours),
      storePhotos:
        storePhotoRows.length > 0
          ? storePhotoRows.map((photo) => ({
              src: photo.publicPath,
              alt: photo.altText ?? "Фотография магазина автозапчастей"
            }))
          : DEFAULT_STORE_PHOTOS,
      home,
      vacancies:
        vacancyRows.length > 0
          ? vacancyRows.map((vacancy) => ({
              id: vacancy.id,
              title: vacancy.title,
              description: vacancy.description,
              imageSrc: vacancy.imagePath ?? DEFAULT_VACANCY.imageSrc,
              imageAlt: vacancy.imageAlt ?? DEFAULT_VACANCY.imageAlt,
              isPublished: vacancy.isPublished,
              sortOrder: vacancy.sortOrder
            }))
          : [...DEFAULT_VACANCIES],
      categories: buildPublicCategories(categoryRows)
    };
  } catch (error) {
    console.error("[public-content] failed to load content", error);
    return getFallbackHomeContent();
  }
}

function withPublicContentTimeout(
  promise: Promise<PublicHomeContent>,
  fallback: PublicHomeContent
) {
  return new Promise<PublicHomeContent>((resolve) => {
    const timeout = setTimeout(() => {
      console.error(`[public-content] timed out after ${PUBLIC_CONTENT_TIMEOUT_MS}ms`);
      resolve(fallback);
    }, PUBLIC_CONTENT_TIMEOUT_MS);

    promise
      .then((content) => {
        clearTimeout(timeout);
        resolve(content);
      })
      .catch((error) => {
        clearTimeout(timeout);
        console.error("[public-content] failed", error);
        resolve(fallback);
      });
  });
}

export function getStoreWorkStatusFromHours(
  hours: PublicBusinessHour[],
  date = new Date()
) {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const weekdayText = parts.find((part) => part.type === "weekday")?.value.toLowerCase() ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const dayIndex = weekdayToIndex(weekdayText);
  const today = hours.find((item) => item.dayOfWeek === dayIndex) ?? hours[0];

  if (!today || today.isClosed) {
    const nextOpening = findNextOpening(hours, dayIndex);
    return {
      isOpen: false,
      label: "Сейчас закрыто" as const,
      detail: nextOpening
        ? `Откроется ${openingDayText(nextOpening.offset, nextOpening.hour.dayOfWeek)} в ${formatBusinessTime(nextOpening.hour.opensAt)}`
        : "Уточните режим работы",
      todayHours: "выходной"
    };
  }

  const opensAtMinutes = timeToMinutes(today.opensAt);
  const closesAtMinutes = timeToMinutes(today.closesAt);
  const currentMinutes = hour * 60 + minute;
  const isOpen = currentMinutes >= opensAtMinutes && currentMinutes < closesAtMinutes;

  return {
    isOpen,
    label: isOpen ? ("Открыто" as const) : ("Сейчас закрыто" as const),
    detail: isOpen
      ? `Закроется в ${formatBusinessTime(today.closesAt)}`
      : currentMinutes < opensAtMinutes
        ? `Откроется сегодня в ${formatBusinessTime(today.opensAt)}`
        : (() => {
            const nextOpening = findNextOpening(hours, dayIndex);
            return nextOpening
              ? `Откроется ${openingDayText(nextOpening.offset, nextOpening.hour.dayOfWeek)} в ${formatBusinessTime(nextOpening.hour.opensAt)}`
              : "Уточните режим работы";
          })(),
    todayHours: `${formatBusinessTime(today.opensAt)}–${formatBusinessTime(today.closesAt)}`
  };
}

function getFallbackHomeContent(): PublicHomeContent {
  const hours = defaultHours();

  return {
    brand: {
      name: siteConfig.name,
      logoSrc: "/assets/brand/logo-mark.png",
      faviconSrc: "/favicon.ico",
      ogImageSrc: "/og/store-front.webp"
    },
    contact: {
      name: siteConfig.name,
      phone: formatStorePhone(siteConfig.phone),
      email: siteConfig.email,
      address: siteConfig.address.full,
      addressCity: siteConfig.address.city,
      addressStreet: siteConfig.address.street,
      latitude: siteConfig.address.latitude,
      longitude: siteConfig.address.longitude,
      yandexMapsUrl: siteConfig.yandexMapsUrl
    },
    workingHours: hours,
    workingHoursDisplay: groupHoursForDisplay(hours),
    storePhotos: DEFAULT_STORE_PHOTOS,
    home: DEFAULT_HOME_CONTENT,
    vacancies: [...DEFAULT_VACANCIES],
    categories: catalogCategories.map((category) => ({
      slug: category.slug,
      name: category.name,
      icon: category.icon,
      sortOrder: category.sortOrder,
      isAllAssortment: "isAllAssortment" in category ? category.isAllAssortment : false
    }))
  };
}

export function mergeHomeContent(value: unknown): HomeContent {
  if (!isRecord(value)) {
    return DEFAULT_HOME_CONTENT;
  }

  const heroRecord = pickRecord(value.hero);
  const catalogRecord = pickRecord(value.catalog);
  const benefitsRecord = pickRecord(value.benefits);

  return {
    hero: {
      ...DEFAULT_HOME_CONTENT.hero,
      ...heroRecord,
      subtitle: stringUnlessLegacy(
        heroRecord.subtitle,
        ["Более 30 000 товаров на собственном складе"],
        DEFAULT_HOME_CONTENT.hero.subtitle
      ),
      text: stringUnlessLegacy(
        heroRecord.text,
        ["Поиск по каталогу, помощь с подбором и магазин, который можно посетить уже сегодня."],
        DEFAULT_HOME_CONTENT.hero.text
      ),
      highlights: normalizeHeroHighlights(heroRecord.highlights)
    },
    catalog: {
      ...DEFAULT_HOME_CONTENT.catalog,
      ...catalogRecord,
      text: stringUnlessLegacy(catalogRecord.text, [""], DEFAULT_HOME_CONTENT.catalog.text)
    },
    benefits: {
      ...DEFAULT_HOME_CONTENT.benefits,
      ...benefitsRecord,
      text: normalizeBenefitsText(benefitsRecord.text),
      items: normalizeBenefitItems(benefitsRecord.items)
    },
    about: normalizeAboutContent(value.about),
    orderParts: {
      ...DEFAULT_HOME_CONTENT.orderParts,
      ...pickRecord(value.orderParts)
    },
    vacancies: {
      ...DEFAULT_HOME_CONTENT.vacancies,
      ...pickRecord(value.vacancies),
      text: stringUnlessLegacy(
        pickRecord(value.vacancies).text,
        [
          "Коротко о текущей вакансии и контакте для уточнения деталей.",
          "Подробности вакансий можно уточнить по телефону или при личном обращении в магазин."
        ],
        DEFAULT_HOME_CONTENT.vacancies.text
      )
    },
    contacts: {
      ...DEFAULT_HOME_CONTENT.contacts,
      ...pickRecord(value.contacts)
    }
  };
}

function normalizeBenefitsText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : DEFAULT_HOME_CONTENT.benefits.text;
  return text === "Магазин работает как понятная точка рядом: склад, подбор и возможность приехать лично."
    ? ""
    : text;
}

function normalizeHeroHighlights(_value: unknown) {
  return DEFAULT_HOME_CONTENT.hero.highlights;
}

function normalizeAboutContent(value: unknown) {
  const aboutRecord = pickRecord(value);

  return {
    ...DEFAULT_HOME_CONTENT.about,
    ...aboutRecord,
    intro: DEFAULT_HOME_CONTENT.about.intro,
    text: ""
  };
}

function normalizeBenefitItems(value: unknown) {
  if (!Array.isArray(value)) {
    return DEFAULT_HOME_CONTENT.benefits.items;
  }

  const items = value
    .slice(0, 4)
    .map((item, index) => {
      const fallback = DEFAULT_HOME_CONTENT.benefits.items[index];
      const record = pickRecord(item);
      const title = stringOr(record.title, fallback.title);
      const text = stringOr(record.text, fallback.text);

      if (isLegacyBenefit(title, text)) {
        return fallback;
      }

      return {
        icon: benefitIconOr(record.icon, fallback.icon),
        title,
        text
      };
    });

  return items.length === 4 ? items : DEFAULT_HOME_CONTENT.benefits.items;
}

function isLegacyBenefit(title: string, text: string) {
  const value = `${title} ${text}`;
  return (
    value.includes("Более 30 000") ||
    value.includes("Всегда большой выбор популярных") ||
    value.includes("Подберем нужную деталь") ||
    value.includes("Привезем необходимые позиции") ||
    value.includes("Нас знают и рекомендуют")
  );
}

function benefitIconOr(value: unknown, fallback: HomeBenefitIcon): HomeBenefitIcon {
  return value === "warehouse" ||
    value === "selection" ||
    value === "delivery" ||
    value === "history"
    ? value
    : fallback;
}

function pickRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringOr(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function stringUnlessLegacy(value: unknown, legacyValues: string[], fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.trim();
  return text && !legacyValues.includes(text) ? text : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildPublicCategories(
  rows: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    sortOrder: number;
    iconPath: string | null;
  }[]
) {
  if (rows.length === 0) {
    return getFallbackHomeContent().categories;
  }

  return rows.map((row) => {
    const staticCategory = catalogCategories.find((category) => category.slug === row.slug);

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      icon: staticCategory?.icon ?? row.iconPath ?? "/assets/categories/ves-assortiment.png",
      sortOrder: row.sortOrder,
      isAllAssortment: row.slug === "ves-assortiment"
    };
  });
}

function defaultHours(): PublicBusinessHour[] {
  return [
    { dayOfWeek: 1, label: "Понедельник", opensAt: "09:00", closesAt: "18:00", isClosed: false },
    { dayOfWeek: 2, label: "Вторник", opensAt: "09:00", closesAt: "18:00", isClosed: false },
    { dayOfWeek: 3, label: "Среда", opensAt: "09:00", closesAt: "18:00", isClosed: false },
    { dayOfWeek: 4, label: "Четверг", opensAt: "09:00", closesAt: "18:00", isClosed: false },
    { dayOfWeek: 5, label: "Пятница", opensAt: "09:00", closesAt: "18:00", isClosed: false },
    { dayOfWeek: 6, label: "Суббота", opensAt: "09:00", closesAt: "16:00", isClosed: false },
    { dayOfWeek: 7, label: "Воскресенье", opensAt: "09:00", closesAt: "16:00", isClosed: false }
  ];
}

function toPublicBusinessHour(row: typeof businessHours.$inferSelect): PublicBusinessHour {
  return {
    dayOfWeek: row.dayOfWeek,
    label: dayLabel(row.dayOfWeek),
    opensAt: formatBusinessTime(row.opensAt),
    closesAt: formatBusinessTime(row.closesAt),
    isClosed: row.isClosed
  };
}

function groupHoursForDisplay(hours: PublicBusinessHour[]) {
  const groups: {
    from: PublicBusinessHour;
    to: PublicBusinessHour;
  }[] = [];

  for (const hour of hours) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.to.opensAt === hour.opensAt &&
      last.to.closesAt === hour.closesAt &&
      last.to.isClosed === hour.isClosed
    ) {
      last.to = hour;
      continue;
    }
    groups.push({ from: hour, to: hour });
  }

  return groups.map((group) => ({
    label:
      group.from.dayOfWeek === group.to.dayOfWeek
        ? group.from.label
        : `${group.from.label}–${group.to.label}`,
    opensAt: formatBusinessTime(group.from.opensAt),
    closesAt: formatBusinessTime(group.from.closesAt),
    isClosed: group.from.isClosed
  }));
}

function dayLabel(day: number) {
  return ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"][
    day
  ] ?? "День";
}

function weekdayToIndex(value: string) {
  if (value.startsWith("пн")) return 1;
  if (value.startsWith("вт")) return 2;
  if (value.startsWith("ср")) return 3;
  if (value.startsWith("чт")) return 4;
  if (value.startsWith("пт")) return 5;
  if (value.startsWith("сб")) return 6;
  return 7;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function findNextOpening(hours: PublicBusinessHour[], currentDay: number) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = ((currentDay + offset - 1) % 7) + 1;
    const hour = hours.find((item) => item.dayOfWeek === day);
    if (hour && !hour.isClosed) {
      return { hour, offset };
    }
  }

  return null;
}

function openingDayText(offset: number, dayOfWeek: number) {
  if (offset === 1) {
    return "завтра";
  }

  return dayLabel(dayOfWeek).toLowerCase();
}

function extractStreet(address: string) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.slice(-2).join(", ") || address;
}
