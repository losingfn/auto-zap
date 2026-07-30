import Link from "next/link";
import type { ReactNode } from "react";
import { PublicFooter } from "@/components/site/public-footer";

export async function CatalogPageShell({
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
    <main className="premium-page min-h-dvh bg-[#111827] text-white">
      <div className="px-5 py-8">
        <div className="mx-auto max-w-6xl">
          <header className={`scroll-reveal mb-8 rounded-card border border-white/10 bg-[#111827] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] ${subtitle ? "sm:p-7" : "sm:p-6"}`}>
            {backHref ? (
              <Link href={backHref} className={`${subtitle ? "mb-4" : "mb-3"} inline-block text-sm text-[#93C5FD]`}>
                ← Назад
              </Link>
            ) : null}
            <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">{title}</h1>
            {subtitle ? <p className="mt-3 max-w-2xl text-[#CBD5E1]">{subtitle}</p> : null}
          </header>
          {children}
        </div>
      </div>
      <PublicFooter />
    </main>
  );
}
