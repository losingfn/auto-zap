import Link from "next/link";
import type { ReactNode } from "react";
import { PublicFooter } from "@/components/site/public-footer";

export async function CatalogPageShell({
  title,
  desktopTitle,
  subtitle,
  backHref,
  variant = "default",
  children
}: {
  title: string;
  desktopTitle?: string;
  subtitle?: string;
  backHref?: string;
  variant?: "default" | "category" | "product-list" | "product-detail";
  children: ReactNode;
}) {
  const variantClassName =
    variant === "category"
      ? "catalog-category-page"
      : variant === "product-list"
        ? "catalog-product-list-page"
        : variant === "product-detail"
          ? "catalog-product-detail-page"
          : "";

  return (
    <main className={`premium-page min-h-dvh bg-[#111827] text-white ${variantClassName}`}>
      <div className="catalog-page-content px-5 py-8">
        <div className="catalog-page-inner mx-auto max-w-6xl">
          <header className={`catalog-page-header scroll-reveal mb-8 rounded-card border border-white/10 bg-[#111827] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] ${subtitle ? "sm:p-7" : "sm:p-6"}`}>
            {backHref ? (
              <Link href={backHref} className={`catalog-page-back ${subtitle ? "mb-4" : "mb-3"} inline-block text-sm text-[#93C5FD]`}>
                ← Назад
              </Link>
            ) : null}
            <h1 className="catalog-page-title text-3xl font-semibold leading-tight sm:text-5xl">
              {desktopTitle ? (
                <>
                  <span className="catalog-page-title-default">{title}</span>
                  <span className="catalog-page-title-desktop hidden">{desktopTitle}</span>
                </>
              ) : title}
            </h1>
            {subtitle ? <p className="catalog-page-subtitle mt-3 max-w-2xl text-[#CBD5E1]">{subtitle}</p> : null}
          </header>
          {children}
        </div>
      </div>
      <PublicFooter />
    </main>
  );
}
