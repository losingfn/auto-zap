import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireAdminSession } from "@/features/admin/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Админ-панель",
  robots: {
    index: false,
    follow: false
  }
};

export default async function AdminPanelLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireAdminSession();

  return (
    <main className="min-h-dvh bg-[#0B1220] text-white">
      <header className="border-b border-[#1D2A3D] bg-[#07101F]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex w-full items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src="/assets/brand/logo.svg"
              alt="Автозапчасти на Салтыкова-Щедрина"
              width={44}
              height={44}
              className="h-11 w-11"
            />
            <div className="min-w-0">
              <p className="truncate text-sm text-[#9DBDFB]">Админ-панель</p>
              <p className="truncate text-lg font-semibold">
                Автозапчасти на Салтыкова-Щедрина
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{session.user.fullName ?? session.user.email}</p>
              <p className="text-xs uppercase tracking-[0.12em] text-[#8FA1B8]">
                {session.user.role}
              </p>
            </div>
            <form action="/admin/logout" method="post">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-card border border-[#4169A8] px-4 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740]"
              >
                Выйти
              </button>
            </form>
          </div>
          </div>

          <nav className="flex gap-2 overflow-x-auto text-sm">
            <Link
              href="/admin"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Dashboard
            </Link>
            <Link
              href="/admin/import"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Импорт Excel
            </Link>
            <Link
              href="/admin/review"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Проверка товаров
            </Link>
            <Link
              href="/admin/content"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Главная
            </Link>
            <Link
              href="/admin/contacts"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Контакты
            </Link>
            <Link
              href="/admin/hours"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              График
            </Link>
            <Link
              href="/admin/photos"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Фото
            </Link>
            <Link
              href="/admin/vacancies"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Вакансии
            </Link>
            <Link
              href="/admin/brand"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Бренд
            </Link>
            <Link
              href="/admin/category-icons"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Иконки
            </Link>
            <Link
              href="/admin/catalog"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Товары
            </Link>
            <Link
              href="/admin/categories"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Категории
            </Link>
            <Link
              href="/admin/subcategories"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Подкатегории
            </Link>
            <Link
              href="/admin/rules"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Правила
            </Link>
            <Link
              href="/admin/synonyms"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Синонимы
            </Link>
            <Link
              href="/admin/backups"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Резервные копии
            </Link>
            <Link
              href="/admin/security"
              className="inline-flex h-9 items-center rounded-card border border-[#243249] px-3 font-semibold text-[#C8D1DF] transition hover:border-[#73A0F5] hover:text-white"
            >
              Безопасность
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
    </main>
  );
}
