import type { Metadata } from "next";
import Image from "next/image";
import { publicBrandLogoSrc } from "@/config/public-brand";
import { requireAdminSession } from "@/features/admin/auth";
import { AdminNav } from "./admin-nav";

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
              src={publicBrandLogoSrc}
              alt="Автозапчасти на Салтыкова-Щедрина"
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
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

          <AdminNav />
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
    </main>
  );
}
