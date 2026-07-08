import Image from "next/image";
import type { Metadata } from "next";
import { loginAction } from "./actions";

export const metadata: Metadata = {
  title: "Вход в админ-панель",
  robots: {
    index: false,
    follow: false
  }
};

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    email?: string;
    next?: string;
  }>;
};

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const hasError = params.error === "invalid";

  return (
    <main className="grid min-h-dvh bg-[#0B1220] text-white lg:grid-cols-[0.95fr_1.05fr]">
      <section className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-4">
            <Image
              src="/assets/brand/logo.svg"
              alt="Автозапчасти на Салтыкова-Щедрина"
              width={56}
              height={56}
              priority
              className="h-14 w-14"
            />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9DBDFB]">
                Админ-панель
              </p>
              <h1 className="mt-1 text-2xl font-semibold">Вход для администратора</h1>
            </div>
          </div>

          <form
            action={loginAction}
            className="rounded-card border border-[#243249] bg-[#101827] p-6 shadow-2xl shadow-black/25"
          >
            <input type="hidden" name="next" value={params.next ?? "/admin"} />

            <label className="block">
              <span className="text-sm font-medium text-[#C8D1DF]">Email</span>
              <input
                name="email"
                type="email"
                defaultValue={params.email ?? ""}
                autoComplete="username"
                required
                className="mt-2 h-12 w-full rounded-card border border-[#2E3A4C] bg-[#0B1220] px-4 text-base text-white outline-none transition placeholder:text-[#66758A] focus:border-[#73A0F5]"
                placeholder="admin@example.ru"
              />
            </label>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-[#C8D1DF]">Пароль</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="mt-2 h-12 w-full rounded-card border border-[#2E3A4C] bg-[#0B1220] px-4 text-base text-white outline-none transition placeholder:text-[#66758A] focus:border-[#73A0F5]"
                placeholder="Введите пароль"
              />
            </label>

            {hasError ? (
              <p className="mt-4 rounded-card border border-[#7F1D1D] bg-[#2A1218] px-4 py-3 text-sm text-[#FECACA]">
                Неверный логин или пароль.
              </p>
            ) : null}

            <button
              type="submit"
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB] focus:outline-none focus:ring-2 focus:ring-[#9DBDFB] focus:ring-offset-2 focus:ring-offset-[#101827]"
            >
              Войти
            </button>
          </form>
        </div>
      </section>

      <section className="relative hidden overflow-hidden border-l border-[#1D2A3D] lg:block">
        <Image
          src="/assets/store/facade.webp"
          alt="Магазин автозапчастей"
          fill
          priority
          sizes="52vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[#07101F]/72" />
        <div className="absolute bottom-0 left-0 right-0 p-10">
          <p className="max-w-xl text-3xl font-semibold leading-tight">
            Автозапчасти на Салтыкова-Щедрина
          </p>
          <p className="mt-4 max-w-lg text-base leading-7 text-[#C8D1DF]">
            Управление каталогом, проверкой товаров и служебными действиями магазина.
          </p>
        </div>
      </section>
    </main>
  );
}
