import type { Metadata } from "next";
import {
  AdminNotice,
  AdminPageIntro,
  AdminSubmitButton,
  inputClassName
} from "@/components/admin/content-ui";
import { getAdminHoursContent } from "@/features/admin/content/management";
import { updateHoursAction } from "./actions";

export const metadata: Metadata = {
  title: "График работы"
};

type HoursPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function AdminHoursPage({ searchParams }: HoursPageProps) {
  const [params, hours] = await Promise.all([searchParams, getAdminHoursContent()]);

  return (
    <div>
      <AdminPageIntro
        eyebrow="Контент сайта"
        title="График работы"
        text="Эти данные используются в блоке контактов и в динамическом статусе Открыто/Закрыто."
      />
      {params.saved ? <AdminNotice>График работы сохранён.</AdminNotice> : null}
      {params.error ? <AdminNotice tone="danger">Не удалось сохранить график.</AdminNotice> : null}

      <form action={updateHoursAction} className="max-w-4xl rounded-card border border-[#243249] bg-[#101827] p-5">
        <div className="space-y-4">
          {hours.map((item) => (
            <div key={item.dayOfWeek} className="grid gap-3 rounded-card border border-[#243249] bg-[#0B1220] p-4 sm:grid-cols-[1fr_160px_160px_120px] sm:items-center">
              <p className="font-semibold">{item.label}</p>
              <label>
                <span className="text-xs text-[#8FA1B8]">Открытие</span>
                <input name={`opensAt-${item.dayOfWeek}`} type="time" defaultValue={item.opensAt} className={inputClassName} />
              </label>
              <label>
                <span className="text-xs text-[#8FA1B8]">Закрытие</span>
                <input name={`closesAt-${item.dayOfWeek}`} type="time" defaultValue={item.closesAt} className={inputClassName} />
              </label>
              <label className="mt-5 flex items-center gap-2 text-sm text-[#C8D1DF] sm:mt-6">
                <input name={`isClosed-${item.dayOfWeek}`} value="1" type="checkbox" defaultChecked={item.isClosed} className="h-4 w-4 accent-[#73A0F5]" />
                Выходной
              </label>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <AdminSubmitButton>Сохранить график</AdminSubmitButton>
        </div>
      </form>
    </div>
  );
}
