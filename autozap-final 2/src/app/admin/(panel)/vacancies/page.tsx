import Image from "next/image";
import type { Metadata } from "next";
import {
  AdminNotice,
  AdminPageIntro,
  AdminSubmitButton,
  fileInputClassName,
  inputClassName,
  textareaClassName
} from "@/components/admin/content-ui";
import { getAdminVacancyContent } from "@/features/admin/content/management";
import { updateVacancyAction } from "./actions";

export const metadata: Metadata = {
  title: "Вакансия"
};

type VacancyPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function AdminVacancyPage({ searchParams }: VacancyPageProps) {
  const [params, vacancy] = await Promise.all([searchParams, getAdminVacancyContent()]);

  return (
    <div>
      <AdminPageIntro
        eyebrow="Контент сайта"
        title="Вакансия продавца-консультанта"
        text="Текст и изображение этого блока отображаются на главной странице."
      />
      {params.saved ? <AdminNotice>Вакансия сохранена.</AdminNotice> : null}
      {params.error ? <AdminNotice tone="danger">Не удалось сохранить вакансию.</AdminNotice> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <form action={updateVacancyAction} className="rounded-card border border-[#243249] bg-[#101827] p-5">
          <label className="block">
            <span className="text-sm font-medium text-[#C8D1DF]">Заголовок</span>
            <input name="title" defaultValue={vacancy.title} required className={inputClassName} />
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-[#C8D1DF]">Описание</span>
            <textarea name="description" defaultValue={vacancy.description} required className={textareaClassName} />
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-[#C8D1DF]">Новое изображение</span>
            <input name="image" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className={fileInputClassName} />
          </label>
          <label className="mt-4 flex items-center gap-2 text-sm text-[#C8D1DF]">
            <input name="isPublished" value="1" type="checkbox" defaultChecked={vacancy.isPublished} className="h-4 w-4 accent-[#73A0F5]" />
            Показывать вакансию на главной
          </label>
          <div className="mt-6">
            <AdminSubmitButton>Сохранить вакансию</AdminSubmitButton>
          </div>
        </form>

        <aside className="rounded-card border border-[#243249] bg-[#101827] p-4">
          <p className="mb-3 text-sm font-semibold text-[#C8D1DF]">Текущее изображение</p>
          <div className="relative min-h-64 overflow-hidden rounded-card border border-[#2E3A4C] bg-[#0B1220]">
            <Image src={vacancy.imagePath ?? "/assets/vacancy/seller-consultant.webp"} alt={vacancy.imageAlt ?? ""} fill sizes="360px" className="object-cover" />
          </div>
        </aside>
      </div>
    </div>
  );
}
