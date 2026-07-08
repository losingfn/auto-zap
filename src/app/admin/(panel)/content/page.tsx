import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  AdminNotice,
  AdminPageIntro,
  AdminSubmitButton,
  inputClassName,
  textareaClassName
} from "@/components/admin/content-ui";
import { getAdminHomeContent } from "@/features/admin/content/management";
import { updateHomeContentAction } from "./actions";

export const metadata: Metadata = {
  title: "Контент главной"
};

type ContentPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function AdminContentPage({ searchParams }: ContentPageProps) {
  const [params, content] = await Promise.all([searchParams, getAdminHomeContent()]);

  return (
    <div>
      <AdminPageIntro
        eyebrow="Контент сайта"
        title="Главная страница"
        text="Редактируйте основные тексты главной страницы без изменения кода проекта."
      />
      {params.saved ? <AdminNotice>Контент главной сохранён.</AdminNotice> : null}
      {params.error ? <AdminNotice tone="danger">Не удалось сохранить контент.</AdminNotice> : null}

      <form action={updateHomeContentAction} className="space-y-6">
        <AdminSection title="Главный экран">
          <TextInput name="heroTitle" label="Заголовок" value={content.hero.title} />
          <TextInput name="heroSubtitle" label="Подзаголовок" value={content.hero.subtitle} />
          <TextArea name="heroText" label="Текст" value={content.hero.text} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {content.hero.highlights.map((item, index) => (
              <TextInput
                key={index}
                name={`heroHighlight${index + 1}`}
                label={`Преимущество ${index + 1}`}
                value={item}
              />
            ))}
          </div>
        </AdminSection>

        <AdminSection title="Каталог">
          <TextInput name="catalogEyebrow" label="Надзаголовок" value={content.catalog.eyebrow} />
          <TextInput name="catalogTitle" label="Заголовок" value={content.catalog.title} />
          <TextArea name="catalogText" label="Текст" value={content.catalog.text} />
        </AdminSection>

        <AdminSection title="Почему выбирают нас">
          <TextInput name="benefitsEyebrow" label="Надзаголовок" value={content.benefits.eyebrow} />
          <TextInput name="benefitsTitle" label="Заголовок" value={content.benefits.title} />
          <TextArea name="benefitsText" label="Вводный текст" value={content.benefits.text} />
          <div className="grid gap-4 md:grid-cols-2">
            {content.benefits.items.map((item, index) => (
              <div key={item.icon} className="rounded-card border border-[#243249] bg-[#0B1220] p-4">
                <p className="text-sm font-semibold text-[#9DBDFB]">Карточка {index + 1}</p>
                <TextInput name={`benefitTitle${index}`} label="Заголовок" value={item.title} />
                <TextArea name={`benefitText${index}`} label="Текст" value={item.text} />
              </div>
            ))}
          </div>
        </AdminSection>

        <AdminSection title="О магазине и слоган">
          <TextInput name="aboutEyebrow" label="Надзаголовок" value={content.about.eyebrow} />
          <TextInput name="aboutTitle" label="Заголовок" value={content.about.title} />
          <TextArea name="aboutIntro" label="Короткое описание" value={content.about.intro} />
          <TextArea name="aboutText" label="Основной текст / слоган" value={content.about.text} />
        </AdminSection>

        <AdminSection title="Заказ запчастей">
          <TextInput name="orderTitle" label="Заголовок" value={content.orderParts.title} />
          <TextArea name="orderText" label="Текст" value={content.orderParts.text} />
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput
              name="orderPrimaryButton"
              label="Первая кнопка"
              value={content.orderParts.primaryButton}
            />
            <TextInput
              name="orderSecondaryButton"
              label="Вторая кнопка"
              value={content.orderParts.secondaryButton}
            />
          </div>
        </AdminSection>

        <AdminSection title="Вакансии">
          <TextInput name="vacanciesEyebrow" label="Надзаголовок" value={content.vacancies.eyebrow} />
          <TextInput name="vacanciesTitle" label="Заголовок" value={content.vacancies.title} />
          <TextArea name="vacanciesText" label="Текст" value={content.vacancies.text} />
        </AdminSection>

        <AdminSection title="Контакты">
          <TextInput name="contactsEyebrow" label="Надзаголовок" value={content.contacts.eyebrow} />
          <TextInput name="contactsTitle" label="Заголовок" value={content.contacts.title} />
          <TextArea name="contactsText" label="Текст" value={content.contacts.text} />
        </AdminSection>

        <AdminSubmitButton>Сохранить контент главной</AdminSubmitButton>
      </form>
    </div>
  );
}

function AdminSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-[#243249] bg-[#101827] p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function TextInput({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[#C8D1DF]">{label}</span>
      <input name={name} defaultValue={value} required className={inputClassName} />
    </label>
  );
}

function TextArea({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[#C8D1DF]">{label}</span>
      <textarea name={name} defaultValue={value} required className={textareaClassName} />
    </label>
  );
}
