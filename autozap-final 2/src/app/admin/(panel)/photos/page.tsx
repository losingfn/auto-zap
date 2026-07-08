import Image from "next/image";
import type { Metadata } from "next";
import {
  AdminNotice,
  AdminPageIntro,
  AdminSubmitButton,
  fileInputClassName,
  inputClassName
} from "@/components/admin/content-ui";
import { getAdminStorePhotos } from "@/features/admin/content/management";
import { deactivateStorePhotoAction, uploadStorePhotoAction } from "./actions";

export const metadata: Metadata = {
  title: "Фотографии магазина"
};

type PhotosPageProps = {
  searchParams: Promise<{ saved?: string; disabled?: string; error?: string }>;
};

export default async function AdminPhotosPage({ searchParams }: PhotosPageProps) {
  const [params, photos] = await Promise.all([searchParams, getAdminStorePhotos()]);

  return (
    <div>
      <AdminPageIntro
        eyebrow="Контент сайта"
        title="Фотографии магазина"
        text="Активные фотографии отображаются в галерее блока О магазине на главной странице."
      />
      {params.saved ? <AdminNotice>Фотография загружена.</AdminNotice> : null}
      {params.disabled ? <AdminNotice>Фотография отключена.</AdminNotice> : null}
      {params.error ? <AdminNotice tone="danger">Не удалось выполнить действие с фотографией.</AdminNotice> : null}

      <form action={uploadStorePhotoAction} className="max-w-3xl rounded-card border border-[#243249] bg-[#101827] p-5">
        <label className="block">
          <span className="text-sm font-medium text-[#C8D1DF]">Файл</span>
          <input name="file" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" required className={fileInputClassName} />
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_140px]">
          <label>
            <span className="text-sm font-medium text-[#C8D1DF]">Alt-текст</span>
            <input name="altText" defaultValue="Фотография магазина автозапчастей" className={inputClassName} />
          </label>
          <label>
            <span className="text-sm font-medium text-[#C8D1DF]">Порядок</span>
            <input name="sortOrder" type="number" defaultValue={10} className={inputClassName} />
          </label>
        </div>
        <p className="mt-3 text-sm text-[#8FA1B8]">JPG, PNG или WebP до 8 МБ. Изображения проверяются и оптимизируются.</p>
        <div className="mt-6">
          <AdminSubmitButton>Загрузить фото</AdminSubmitButton>
        </div>
      </form>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {photos.map((photo) => (
          <article key={photo.id} className="rounded-card border border-[#243249] bg-[#101827] p-4">
            <div className="relative min-h-48 overflow-hidden rounded-card border border-[#2E3A4C] bg-[#0B1220]">
              <Image src={photo.publicPath} alt={photo.altText ?? ""} fill sizes="(min-width: 1280px) 30vw, 50vw" className="object-cover" />
            </div>
            <p className="mt-3 text-sm font-semibold">{photo.altText ?? photo.originalFilename}</p>
            <p className="mt-1 text-xs text-[#8FA1B8]">{photo.isActive ? "Активно" : "Отключено"} · порядок {photo.sortOrder}</p>
            {photo.isActive ? (
              <form action={deactivateStorePhotoAction} className="mt-4">
                <input type="hidden" name="assetId" value={photo.id} />
                <button type="submit" className="inline-flex h-10 items-center rounded-card border border-[#4169A8] px-4 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740]">
                  Отключить
                </button>
              </form>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
