import type { Metadata } from "next";
import {
  AdminNotice,
  AdminPageIntro,
  AdminSubmitButton,
  inputClassName,
  textareaClassName
} from "@/components/admin/content-ui";
import { getAdminContactsContent } from "@/features/admin/content/management";
import { updateContactsAction } from "./actions";

export const metadata: Metadata = {
  title: "Контакты"
};

type ContactsPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function AdminContactsPage({ searchParams }: ContactsPageProps) {
  const [params, contact] = await Promise.all([searchParams, getAdminContactsContent()]);

  return (
    <div>
      <AdminPageIntro
        eyebrow="Контент сайта"
        title="Контакты"
        text="Телефон, почта, адрес и координаты для блока контактов и Яндекс Карты на главной."
      />
      {params.saved ? <AdminNotice>Контакты сохранены.</AdminNotice> : null}
      {params.error ? <AdminNotice tone="danger">Не удалось сохранить контакты.</AdminNotice> : null}

      <form action={updateContactsAction} className="max-w-3xl rounded-card border border-[#243249] bg-[#101827] p-5">
        <label className="block">
          <span className="text-sm font-medium text-[#C8D1DF]">Название</span>
          <input name="name" defaultValue={contact.name} required className={inputClassName} />
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-[#C8D1DF]">Телефон</span>
            <input name="phone" defaultValue={contact.phone} required className={inputClassName} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[#C8D1DF]">Почта</span>
            <input name="email" type="email" defaultValue={contact.email} required className={inputClassName} />
          </label>
        </div>
        <label className="mt-4 block">
          <span className="text-sm font-medium text-[#C8D1DF]">Адрес</span>
          <textarea name="address" defaultValue={contact.address} required className={textareaClassName} />
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-[#C8D1DF]">Широта</span>
            <input name="latitude" type="number" step="0.000001" defaultValue={contact.latitude} required className={inputClassName} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[#C8D1DF]">Долгота</span>
            <input name="longitude" type="number" step="0.000001" defaultValue={contact.longitude} required className={inputClassName} />
          </label>
        </div>
        <label className="mt-4 block">
          <span className="text-sm font-medium text-[#C8D1DF]">Ссылка Яндекс Карт</span>
          <input name="yandexMapsUrl" type="url" defaultValue={contact.yandexMapsUrl} required className={inputClassName} />
        </label>
        <div className="mt-6">
          <AdminSubmitButton>Сохранить контакты</AdminSubmitButton>
        </div>
      </form>
    </div>
  );
}
