import Image from "next/image";
import type { Metadata } from "next";
import {
  AdminNotice,
  AdminPageIntro,
  AdminSubmitButton,
  fileInputClassName
} from "@/components/admin/content-ui";
import { getAdminBrandContent } from "@/features/admin/content/management";
import { uploadBrandAssetAction } from "./actions";

export const metadata: Metadata = {
  title: "Брендирование"
};

type BrandPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

const brandSlots = [
  {
    kind: "logo",
    title: "Логотип",
    accept: ".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp",
    fallback: "/assets/brand/logo-mark.png"
  },
  {
    kind: "favicon",
    title: "Favicon",
    accept: ".ico,.svg,.png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,image/png",
    fallback: "/favicon.ico"
  },
  {
    kind: "og_image",
    title: "Open Graph изображение",
    accept: ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp",
    fallback: "/og/store-front.webp"
  }
] as const;

export default async function AdminBrandPage({ searchParams }: BrandPageProps) {
  const [params, brand] = await Promise.all([searchParams, getAdminBrandContent()]);
  const currentByKind = {
    logo: brand.logo,
    favicon: brand.favicon,
    og_image: brand.ogImage
  };

  return (
    <div>
      <AdminPageIntro
        eyebrow="Контент сайта"
        title="Брендирование"
        text="Логотип используется в шапке главной, favicon и Open Graph — в метаданных сайта."
      />
      {params.saved ? <AdminNotice>Брендовый файл обновлён.</AdminNotice> : null}
      {params.error ? <AdminNotice tone="danger">Не удалось загрузить брендовый файл.</AdminNotice> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {brandSlots.map((slot) => {
          const current = currentByKind[slot.kind];
          return (
            <article key={slot.kind} className="rounded-card border border-[#243249] bg-[#101827] p-5">
              <h2 className="text-lg font-semibold">{slot.title}</h2>
              <div className="relative mt-4 min-h-40 overflow-hidden rounded-card border border-[#2E3A4C] bg-[#0B1220]">
                <Image src={current?.publicPath ?? slot.fallback} alt="" fill sizes="33vw" className="object-contain p-4" />
              </div>
              <p className="mt-3 min-h-5 text-xs text-[#8FA1B8]">
                {current ? current.originalFilename : "Используется файл по умолчанию"}
              </p>
              <form action={uploadBrandAssetAction} className="mt-4">
                <input type="hidden" name="kind" value={slot.kind} />
                <input name="file" type="file" accept={slot.accept} required className={fileInputClassName} />
                <div className="mt-4">
                  <AdminSubmitButton>Загрузить</AdminSubmitButton>
                </div>
              </form>
            </article>
          );
        })}
      </div>
    </div>
  );
}
