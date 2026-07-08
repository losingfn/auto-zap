import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { catalogCategories } from "@/config/categories";
import { siteConfig } from "@/config/site";
import { db } from "@/db/client";
import {
  assets,
  auditLogs,
  businessHours,
  categories,
  contacts,
  siteSettings,
  vacancies
} from "@/db/schema";
import { saveContentAsset, type ContentAssetKind } from "./assets";
import { formatBusinessTime, formatStorePhone } from "@/lib/format";
import { mergeHomeContent, type HomeContent } from "@/features/content/public-home";

export type ContactContentInput = {
  name: string;
  phone: string;
  email: string;
  address: string;
  latitude: number;
  longitude: number;
  yandexMapsUrl: string;
};

export type HourContentInput = {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
};

export type VacancyContentInput = {
  title: string;
  description: string;
  isPublished: boolean;
  sortOrder: number;
};

export type HomeContentInput = HomeContent;

export async function getAdminContactsContent() {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, 1)).limit(1);

  return {
    name: contact?.name ?? siteConfig.name,
    phone: formatStorePhone(contact?.phone ?? siteConfig.phone),
    email: contact?.email ?? siteConfig.email,
    address: contact?.address ?? siteConfig.address.full,
    latitude: Number(contact?.latitude ?? siteConfig.address.latitude),
    longitude: Number(contact?.longitude ?? siteConfig.address.longitude),
    yandexMapsUrl: contact?.yandexMapsUrl ?? siteConfig.yandexMapsUrl
  };
}

export async function updateAdminContactsContent(input: ContactContentInput, adminUserId: string) {
  await db
    .insert(contacts)
    .values({
      id: 1,
      name: input.name,
      phone: input.phone,
      email: input.email,
      address: input.address,
      latitude: String(input.latitude),
      longitude: String(input.longitude),
      yandexMapsUrl: input.yandexMapsUrl
    })
    .onConflictDoUpdate({
      target: contacts.id,
      set: {
        name: input.name,
        phone: input.phone,
        email: input.email,
        address: input.address,
        latitude: String(input.latitude),
        longitude: String(input.longitude),
        yandexMapsUrl: input.yandexMapsUrl,
        updatedAt: new Date()
      }
    });

  await logContentAction(adminUserId, "content.contacts.update", "contacts", null, input);
  revalidatePublicContent();
}

export async function getAdminHoursContent() {
  const rows = await db.select().from(businessHours).orderBy(asc(businessHours.dayOfWeek));
  const byDay = new Map(rows.map((row) => [row.dayOfWeek, row]));

  return Array.from({ length: 7 }, (_, index) => {
    const dayOfWeek = index + 1;
    const row = byDay.get(dayOfWeek);
    const fallback = dayOfWeek <= 5 ? siteConfig.workingHours[0] : siteConfig.workingHours[1];

    return {
      dayOfWeek,
      label: dayLabel(dayOfWeek),
      opensAt: formatBusinessTime(row?.opensAt ?? fallback.opensAt),
      closesAt: formatBusinessTime(row?.closesAt ?? fallback.closesAt),
      isClosed: row?.isClosed ?? false
    };
  });
}

export async function updateAdminHoursContent(hours: HourContentInput[], adminUserId: string) {
  await db.transaction(async (tx) => {
    for (const item of hours) {
      await tx
        .insert(businessHours)
        .values({
          dayOfWeek: item.dayOfWeek,
          opensAt: item.opensAt,
          closesAt: item.closesAt,
          isClosed: item.isClosed
        })
        .onConflictDoUpdate({
          target: businessHours.dayOfWeek,
          set: {
            opensAt: item.opensAt,
            closesAt: item.closesAt,
            isClosed: item.isClosed,
            updatedAt: new Date()
          }
        });
    }

    await tx.insert(auditLogs).values({
      adminUserId,
      action: "content.hours.update",
      entityType: "business_hours",
      metadata: { hours }
    });
  });

  revalidatePublicContent();
}

export async function getAdminStorePhotos() {
  return db
    .select({
      id: assets.id,
      publicPath: assets.publicPath,
      originalFilename: assets.originalFilename,
      altText: assets.altText,
      sortOrder: assets.sortOrder,
      isActive: assets.isActive,
      createdAt: assets.createdAt
    })
    .from(assets)
    .where(eq(assets.kind, "store_photo"))
    .orderBy(desc(assets.isActive), asc(assets.sortOrder), desc(assets.createdAt));
}

export async function uploadAdminStorePhoto({
  file,
  altText,
  sortOrder,
  adminUserId
}: {
  file: File | null;
  altText: string;
  sortOrder: number;
  adminUserId: string;
}) {
  const asset = await saveContentAsset({
    file,
    kind: "store_photo",
    altText,
    sortOrder
  });

  await logContentAction(adminUserId, "content.photo.upload", "asset", asset.id, {
    kind: "store_photo",
    publicPath: asset.publicPath
  });
  revalidatePublicContent();
  return asset;
}

export async function setAdminAssetActive({
  assetId,
  isActive,
  adminUserId,
  action
}: {
  assetId: string;
  isActive: boolean;
  adminUserId: string;
  action: string;
}) {
  await db.update(assets).set({ isActive }).where(eq(assets.id, assetId));
  await logContentAction(adminUserId, action, "asset", assetId, { isActive });
  revalidatePublicContent();
}

export async function getAdminHomeContent() {
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, "home_content"))
    .limit(1);

  return mergeHomeContent(row?.value);
}

export async function updateAdminHomeContent(input: HomeContentInput, adminUserId: string) {
  await db
    .insert(siteSettings)
    .values({
      key: "home_content",
      value: input,
      updatedBy: adminUserId
    })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: {
        value: input,
        updatedBy: adminUserId,
        updatedAt: new Date()
      }
    });

  await logContentAction(adminUserId, "content.home.update", "site_settings", null, input);
  revalidatePublicContent();
}

export async function getAdminVacanciesContent() {
  const rows = await db
    .select({
      id: vacancies.id,
      title: vacancies.title,
      description: vacancies.description,
      isPublished: vacancies.isPublished,
      sortOrder: vacancies.sortOrder,
      imageAssetId: vacancies.imageAssetId,
      imagePath: assets.publicPath,
      imageAlt: assets.altText,
      createdAt: vacancies.createdAt
    })
    .from(vacancies)
    .leftJoin(assets, eq(assets.id, vacancies.imageAssetId))
    .orderBy(asc(vacancies.sortOrder), asc(vacancies.createdAt));

  return rows;
}

export async function createAdminVacancyContent({
  input,
  imageFile,
  adminUserId
}: {
  input: VacancyContentInput;
  imageFile: File | null;
  adminUserId: string;
}) {
  const imageAsset = imageFile
    ? await saveContentAsset({
        file: imageFile,
        kind: "vacancy_image",
        altText: input.title
      })
    : null;

  const [created] = await db
    .insert(vacancies)
    .values({
      title: input.title,
      description: input.description,
      isPublished: input.isPublished,
      imageAssetId: imageAsset?.id,
      sortOrder: input.sortOrder
    })
    .returning({ id: vacancies.id });

  await logContentAction(adminUserId, "content.vacancy.create", "vacancy", created.id, {
    ...input,
    imageAssetId: imageAsset?.id ?? null
  });
  revalidatePublicContent();
}

export async function updateAdminVacancyContent({
  vacancyId,
  input,
  imageFile,
  adminUserId
}: {
  vacancyId: string;
  input: VacancyContentInput;
  imageFile: File | null;
  adminUserId: string;
}) {
  const [current] = await db
    .select({ id: vacancies.id, imageAssetId: vacancies.imageAssetId })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1);

  if (!current) {
    throw new Error("Вакансия не найдена.");
  }

  const imageAsset = imageFile
    ? await saveContentAsset({
        file: imageFile,
        kind: "vacancy_image",
        altText: input.title
      })
    : null;

  await db
    .update(vacancies)
    .set({
      title: input.title,
      description: input.description,
      isPublished: input.isPublished,
      sortOrder: input.sortOrder,
      imageAssetId: imageAsset?.id ?? current.imageAssetId,
      updatedAt: new Date()
    })
    .where(eq(vacancies.id, vacancyId));

  await logContentAction(adminUserId, "content.vacancy.update", "vacancy", vacancyId, {
    ...input,
    imageAssetId: imageAsset?.id ?? current.imageAssetId
  });
  revalidatePublicContent();
}

export async function deleteAdminVacancyContent({
  vacancyId,
  adminUserId
}: {
  vacancyId: string;
  adminUserId: string;
}) {
  const [deleted] = await db
    .delete(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .returning({ id: vacancies.id, title: vacancies.title });

  if (!deleted) {
    throw new Error("Вакансия не найдена.");
  }

  await logContentAction(adminUserId, "content.vacancy.delete", "vacancy", deleted.id, {
    title: deleted.title
  });
  revalidatePublicContent();
}

export async function getAdminBrandContent() {
  const rows = await db
    .select({
      id: assets.id,
      kind: assets.kind,
      publicPath: assets.publicPath,
      originalFilename: assets.originalFilename,
      createdAt: assets.createdAt
    })
    .from(assets)
    .where(and(eq(assets.isActive, true)))
    .orderBy(desc(assets.createdAt));

  const byKind = new Map(rows.map((row) => [row.kind, row]));

  return {
    logo: byKind.get("logo") ?? null,
    favicon: byKind.get("favicon") ?? null,
    ogImage: byKind.get("og_image") ?? null
  };
}

export async function uploadAdminBrandAsset({
  file,
  kind,
  adminUserId
}: {
  file: File | null;
  kind: Extract<ContentAssetKind, "logo" | "favicon" | "og_image">;
  adminUserId: string;
}) {
  const asset = await saveContentAsset({
    file,
    kind,
    altText: kind === "og_image" ? "Магазин автозапчастей на Салтыкова-Щедрина" : "Логотип магазина",
    singleton: true
  });

  await logContentAction(adminUserId, "content.brand.update", "asset", asset.id, {
    kind,
    publicPath: asset.publicPath
  });
  revalidatePublicContent();
  return asset;
}

export async function getAdminCategoryIconsContent() {
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      iconPath: assets.publicPath,
      iconAssetId: categories.iconAssetId
    })
    .from(categories)
    .leftJoin(assets, eq(assets.id, categories.iconAssetId))
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return rows.map((row) => {
    const staticCategory = catalogCategories.find((item) => item.slug === row.slug);
    return {
      ...row,
      iconPath: staticCategory?.icon ?? row.iconPath ?? "/assets/categories/ves-assortiment.svg"
    };
  });
}

export async function uploadAdminCategoryIcon({
  categoryId,
  file,
  adminUserId
}: {
  categoryId: string;
  file: File | null;
  adminUserId: string;
}) {
  const [category] = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);

  if (!category) {
    throw new Error("Категория не найдена.");
  }

  const asset = await saveContentAsset({
    file,
    kind: "category_icon",
    altText: category.name,
    sortOrder: 0
  });

  await db.update(categories).set({ iconAssetId: asset.id, updatedAt: new Date() }).where(eq(categories.id, categoryId));
  await logContentAction(adminUserId, "content.category_icon.update", "category", category.id, {
    categorySlug: category.slug,
    assetId: asset.id,
    publicPath: asset.publicPath
  });
  revalidatePublicContent();
}

async function logContentAction(
  adminUserId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>
) {
  await db.insert(auditLogs).values({
    adminUserId,
    action,
    entityType,
    entityId,
    metadata
  });
}

function revalidatePublicContent() {
  revalidatePath("/");
  revalidatePath("/admin");
}

function dayLabel(day: number) {
  return ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"][
    day
  ] ?? "День";
}
