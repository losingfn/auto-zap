import Image from "next/image";
import type { Metadata } from "next";
import {
  AdminNotice,
  AdminPageIntro,
  AdminSubmitButton,
  fileInputClassName
} from "@/components/admin/content-ui";
import { getAdminCategoryIconsContent } from "@/features/admin/content/management";
import { uploadCategoryIconAction } from "./actions";

export const metadata: Metadata = {
  title: "Иконки категорий"
};

type CategoryIconsPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function AdminCategoryIconsPage({ searchParams }: CategoryIconsPageProps) {
  const [params, categories] = await Promise.all([searchParams, getAdminCategoryIconsContent()]);

  return (
    <div>
      <AdminPageIntro
        eyebrow="Контент сайта"
        title="Иконки категорий"
        text="Иконки отображаются в блоке категорий на главной и в каталоге. Предпочтительный формат — SVG."
      />
      {params.saved ? <AdminNotice>Иконка категории обновлена.</AdminNotice> : null}
      {params.error ? <AdminNotice tone="danger">Не удалось загрузить иконку категории.</AdminNotice> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {categories.map((category) => (
          <article key={category.id} className="rounded-card border border-[#243249] bg-[#101827] p-4">
            <div className="flex min-h-28 items-center justify-center rounded-card border border-[#2E3A4C] bg-[#0B1220] p-4">
              <Image src={category.iconPath} alt="" width={92} height={92} className="h-20 w-20 object-contain" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">{category.name}</h2>
            <p className="mt-1 text-xs text-[#8FA1B8]">{category.slug}</p>
            <form action={uploadCategoryIconAction} className="mt-4">
              <input type="hidden" name="categoryId" value={category.id} />
              <input name="file" type="file" accept=".svg,.png,.webp,image/svg+xml,image/png,image/webp" required className={fileInputClassName} />
              <div className="mt-4">
                <AdminSubmitButton>Обновить иконку</AdminSubmitButton>
              </div>
            </form>
          </article>
        ))}
      </div>
    </div>
  );
}
