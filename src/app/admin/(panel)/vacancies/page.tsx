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
import { getAdminVacanciesContent } from "@/features/admin/content/management";
import { createVacancyAction, deleteVacancyAction, updateVacancyAction } from "./actions";

export const metadata: Metadata = {
  title: "Вакансии"
};

type VacancyPageProps = {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
};

export default async function AdminVacancyPage({ searchParams }: VacancyPageProps) {
  const [params, vacancies] = await Promise.all([searchParams, getAdminVacanciesContent()]);

  return (
    <div>
      <AdminPageIntro
        eyebrow="Контент сайта"
        title="Вакансии"
        text="Добавляйте, скрывайте, публикуйте и сортируйте вакансии, которые показываются на главной странице."
      />
      {params.saved ? <AdminNotice>Вакансии сохранены.</AdminNotice> : null}
      {params.deleted ? <AdminNotice>Вакансия удалена.</AdminNotice> : null}
      {params.error ? <AdminNotice tone="danger">Не удалось выполнить действие.</AdminNotice> : null}

      <section className="rounded-card border border-[#243249] bg-[#101827] p-5">
        <h2 className="text-lg font-semibold">Новая вакансия</h2>
        <form action={createVacancyAction} className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <label className="block">
            <span className="text-sm font-medium text-[#C8D1DF]">Заголовок</span>
            <input name="title" required className={inputClassName} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[#C8D1DF]">Порядок</span>
            <input name="sortOrder" type="number" defaultValue={100} className={inputClassName} />
          </label>
          <label className="block lg:col-span-2">
            <span className="text-sm font-medium text-[#C8D1DF]">Описание</span>
            <textarea name="description" required className={textareaClassName} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[#C8D1DF]">Изображение</span>
            <input
              name="image"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className={fileInputClassName}
            />
          </label>
          <div className="flex flex-col justify-end gap-4">
            <label className="flex items-center gap-2 text-sm text-[#C8D1DF]">
              <input name="isPublished" value="1" type="checkbox" defaultChecked className="h-4 w-4 accent-[#73A0F5]" />
              Опубликовать на сайте
            </label>
            <AdminSubmitButton>Добавить вакансию</AdminSubmitButton>
          </div>
        </form>
      </section>

      <section className="mt-8 space-y-5">
        {vacancies.length > 0 ? (
          vacancies.map((vacancy) => (
            <article
              key={vacancy.id}
              className="grid gap-5 rounded-card border border-[#243249] bg-[#101827] p-5 xl:grid-cols-[220px_1fr]"
            >
              <div className="relative min-h-56 overflow-hidden rounded-card border border-[#2E3A4C] bg-[#0B1220]">
                <Image
                  src={vacancy.imagePath ?? "/assets/vacancy/seller-consultant.webp"}
                  alt={vacancy.imageAlt ?? vacancy.title}
                  fill
                  sizes="220px"
                  className="object-cover"
                />
              </div>
              <div className="space-y-4">
                <form action={updateVacancyAction} className="grid gap-4 lg:grid-cols-[1fr_150px]">
                  <input type="hidden" name="vacancyId" value={vacancy.id} />
                  <label className="block">
                    <span className="text-sm font-medium text-[#C8D1DF]">Заголовок</span>
                    <input name="title" defaultValue={vacancy.title} required className={inputClassName} />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-[#C8D1DF]">Порядок</span>
                    <input
                      name="sortOrder"
                      type="number"
                      defaultValue={vacancy.sortOrder}
                      className={inputClassName}
                    />
                  </label>
                  <label className="block lg:col-span-2">
                    <span className="text-sm font-medium text-[#C8D1DF]">Описание</span>
                    <textarea
                      name="description"
                      defaultValue={vacancy.description}
                      required
                      className={textareaClassName}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-[#C8D1DF]">Заменить изображение</span>
                    <input
                      name="image"
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      className={fileInputClassName}
                    />
                  </label>
                  <div className="flex flex-col justify-end gap-4">
                    <label className="flex items-center gap-2 text-sm text-[#C8D1DF]">
                      <input
                        name="isPublished"
                        value="1"
                        type="checkbox"
                        defaultChecked={vacancy.isPublished}
                        className="h-4 w-4 accent-[#73A0F5]"
                      />
                      Показывать на сайте
                    </label>
                    <AdminSubmitButton>Сохранить</AdminSubmitButton>
                  </div>
                </form>

                <form action={deleteVacancyAction} className="rounded-card border border-[#3B1D2A] bg-[#1E1118] p-4">
                  <input type="hidden" name="vacancyId" value={vacancy.id} />
                  <label className="flex items-center gap-2 text-sm text-[#FECACA]">
                    <input required type="checkbox" className="h-4 w-4 accent-[#DC2626]" />
                    Подтверждаю удаление этой вакансии
                  </label>
                  <button
                    type="submit"
                    className="mt-3 inline-flex h-10 items-center justify-center rounded-card border border-[#7F1D1D] px-4 text-sm font-semibold text-[#FECACA] transition hover:bg-[#3B1D2A]"
                  >
                    Удалить вакансию
                  </button>
                </form>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-card border border-[#243249] bg-[#101827] p-6 text-[#C8D1DF]">
            Вакансий пока нет. Добавьте первую запись выше.
          </div>
        )}
      </section>
    </div>
  );
}
