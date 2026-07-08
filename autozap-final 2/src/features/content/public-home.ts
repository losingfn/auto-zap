import { and, asc, eq } from "drizzle-orm";
import { catalogCategories } from "@/config/categories";
import { siteConfig } from "@/config/site";
import { db } from "@/db/client";
import {
  assets,
  businessHours,
  categories,
  contacts,
  vacancies
} from "@/db/schema";
import type { PublicCategory } from "@/features/catalog/types";

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

const DEFAULT_VACANCY = {
  title: "Требуется продавец-консультант",
  description:
    "Ищем человека, которому близка автомобильная тематика и спокойная работа с покупателями. Подробности вакансии можно уточнить при личном обращении в магазин.",
  imageSrc: "/assets/vacancy/seller-consultant.webp",
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
  vacancy: typeof DEFAULT_VACANCY;
  categories: PublicCategory[];
};

export async function getPublicHomeContent(): Promise<PublicHomeContent> {
  try {
    const [
      contactRows,
      hourRows,
      storePhotoRows,
      vacancyRows,
      categoryRows,
      brandRows
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
          title: vacancies.title,
          description: vacancies.description,
          isPublished: vacancies.isPublished,
          imagePath: assets.publicPath,
          imageAlt: assets.altText
        })
        .from(vacancies)
        .leftJoin(assets, eq(assets.id, vacancies.imageAssetId))
        .where(eq(vacancies.isPublished, true))
        .orderBy(asc(vacancies.sortOrder), asc(vacancies.createdAt))
        .limit(1),
      db
        .select({
          id: categories.id,
          slug: categories.slug,
          name: categories.name,
          description: categories.description,
          sortOrder: categories.sortOrder,
          isAllAssortment: categories.isAllAssortment,
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
        .orderBy(asc(assets.sortOrder), asc(assets.createdAt))
    ]);

    const contact = contactRows[0];
    const brandByKind = new Map(brandRows.map((asset) => [asset.kind, asset.publicPath]));
    const hours = hourRows.length > 0 ? hourRows.map(toPublicBusinessHour) : defaultHours();

    return {
      brand: {
        name: contact?.name ?? siteConfig.name,
        logoSrc: brandByKind.get("logo") ?? "/assets/brand/logo-mark.png",
        faviconSrc: brandByKind.get("favicon") ?? "/favicon.ico",
        ogImageSrc: brandByKind.get("og_image") ?? "/og/store-front.webp"
      },
      contact: {
        name: contact?.name ?? siteConfig.name,
        phone: contact?.phone ?? siteConfig.phone,
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
      vacancy: vacancyRows[0]
        ? {
            title: vacancyRows[0].title,
            description: vacancyRows[0].description,
            imageSrc: vacancyRows[0].imagePath ?? DEFAULT_VACANCY.imageSrc,
            imageAlt: vacancyRows[0].imageAlt ?? DEFAULT_VACANCY.imageAlt,
            isPublished: vacancyRows[0].isPublished
          }
        : DEFAULT_VACANCY,
      categories: buildPublicCategories(categoryRows)
    };
  } catch {
    return getFallbackHomeContent();
  }
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
    return {
      isOpen: false,
      label: "Закрыто" as const,
      detail: "Сегодня выходной",
      todayHours: "выходной"
    };
  }

  const opensAtMinutes = timeToMinutes(today.opensAt);
  const closesAtMinutes = timeToMinutes(today.closesAt);
  const currentMinutes = hour * 60 + minute;
  const isOpen = currentMinutes >= opensAtMinutes && currentMinutes < closesAtMinutes;

  return {
    isOpen,
    label: isOpen ? ("Открыто" as const) : ("Закрыто" as const),
    detail: isOpen ? `Сегодня до ${today.closesAt}` : `Сегодня с ${today.opensAt}`,
    todayHours: `${today.opensAt}-${today.closesAt}`
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
      phone: siteConfig.phone,
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
    vacancy: DEFAULT_VACANCY,
    categories: catalogCategories.map((category) => ({
      slug: category.slug,
      name: category.name,
      icon: category.icon,
      sortOrder: category.sortOrder,
      isAllAssortment: "isAllAssortment" in category ? category.isAllAssortment : false
    }))
  };
}

function buildPublicCategories(
  rows: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    sortOrder: number;
    isAllAssortment: boolean;
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
      icon: row.iconPath ?? staticCategory?.icon ?? "/assets/categories/ves-assortiment.svg",
      sortOrder: row.sortOrder,
      isAllAssortment: row.isAllAssortment
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
    opensAt: row.opensAt,
    closesAt: row.closesAt,
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
        : `${group.from.label}-${group.to.label}`,
    opensAt: group.from.opensAt,
    closesAt: group.from.closesAt,
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

function extractStreet(address: string) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.slice(-2).join(", ") || address;
}
