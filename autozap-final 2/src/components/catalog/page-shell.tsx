import Link from "next/link";
import type { ReactNode } from "react";

export function CatalogPageShell({
  title,
  subtitle,
  backHref,
  children
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-[#111827] px-5 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          {backHref ? (
            <Link href={backHref} className="mb-4 inline-block text-sm text-[#93C5FD]">
              ← Назад
            </Link>
          ) : null}
          <h1 className="text-3xl font-semibold sm:text-5xl">{title}</h1>
          {subtitle ? <p className="mt-3 max-w-2xl text-[#D1D5DB]">{subtitle}</p> : null}
        </header>
        {children}
      </div>
    </main>
  );
}
