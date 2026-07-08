import type { Metadata } from "next";
import {
  AdminNotice,
  AdminPageIntro,
  AdminSubmitButton,
  inputClassName
} from "@/components/admin/content-ui";
import { changePasswordAction } from "./actions";

export const metadata: Metadata = {
  title: "Безопасность"
};

type SecurityPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function AdminSecurityPage({ searchParams }: SecurityPageProps) {
  const params = await searchParams;

  return (
    <div>
      <AdminPageIntro
        eyebrow="Админ-панель"
        title="Безопасность"
        text="Смена пароля администратора. Пароль хранится только в виде защищённого хэша."
      />
      {params.saved ? <AdminNotice>Пароль обновлён.</AdminNotice> : null}
      {params.error ? (
        <AdminNotice tone="danger">
          Не удалось сменить пароль. Проверьте текущий пароль и совпадение нового пароля.
        </AdminNotice>
      ) : null}

      <form action={changePasswordAction} className="max-w-xl rounded-card border border-[#243249] bg-[#101827] p-5">
        <label className="block">
          <span className="text-sm font-medium text-[#C8D1DF]">Текущий пароль</span>
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className={inputClassName}
          />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-medium text-[#C8D1DF]">Новый пароль</span>
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            className={inputClassName}
          />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-medium text-[#C8D1DF]">Повторите новый пароль</span>
          <input
            name="repeatPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            className={inputClassName}
          />
        </label>
        <p className="mt-3 text-sm text-[#8FA1B8]">
          После смены пароля остальные активные сессии администратора будут отозваны.
        </p>
        <div className="mt-6">
          <AdminSubmitButton>Сменить пароль</AdminSubmitButton>
        </div>
      </form>
    </div>
  );
}
