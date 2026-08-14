import Link from "next/link";
import type { Metadata } from "next";
import { SearchPageForm } from "@/components/search/search-page-form";
import { PurchaseListProductBadge } from "@/components/purchase-list/purchase-list-product-badge";
import { PublicFooter } from "@/components/site/public-footer";
import { formatPublicTargetLabel } from "@/config/public-taxonomy";
import { searchProducts } from "@/features/search/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true
  }
};

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  let searchError = false;
  const result = q.trim()
    ? await withTimeout(
        searchProducts({
          query: q,
          limit: 30
        }),
        6000
      ).catch((error) => {
        console.error("[public-search] failed", error);
        searchError = true;
        return null;
      })
    : null;

  return (
    <main className="premium-page min-h-screen bg-[#111827] text-white">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="scroll-reveal rounded-card border border-white/10 bg-[#111827] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
          <Link href="/" className="text-sm text-[#93C5FD] transition hover:text-white">
            ← На главную
          </Link>
          <h1 className="mt-4 text-3xl font-semibold">Поиск по каталогу</h1>
        </div>

        <SearchPageForm initialQuery={q} />

        {searchError ? (
          <div className="rounded-card border border-white/10 bg-[#111827] p-5 text-[#CBD5E1] shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
            Поиск временно недоступен. Попробуйте обновить страницу чуть позже.
          </div>
        ) : result ? (
          result.total > 0 ? (
            <div className="space-y-4">
              <div className="text-sm text-[#CBD5E1]">
                Найдено: {result.total.toLocaleString("ru-RU")}
              </div>

              {result.hits.length > 0 ? (
                <div className="divide-y divide-white/10 overflow-hidden rounded-card border border-white/10 bg-[#111827] shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
                  {result.hits.map((product) => (
                    <Link
                      key={product.id}
                      href={product.url}
                      className="tap-target grid gap-2 p-4 hover:bg-[#2563EB]/10 sm:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <h2 className="text-base font-semibold leading-6">{product.name}</h2>
                        <p className="mt-1 text-sm text-[#CBD5E1]">
                          {formatPublicTargetLabel(product)}
                        </p>
                        <PurchaseListProductBadge productIdentityId={product.productIdentityId} />
                      </div>
                      <div className="text-lg font-semibold text-white">
                        {product.price.toLocaleString("ru-RU")} ₽
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-card border border-white/10 bg-[#111827] p-5 text-[#CBD5E1] shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
                  Ничего не найдено.
                </div>
              )}
            </div>
          ) : (
            <section className="isolate overflow-hidden rounded-[24px] border border-white/[0.12] bg-[linear-gradient(145deg,rgba(17,30,50,0.8),rgba(7,15,28,0.9))] p-5 shadow-[0_12px_30px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.09),inset_0_-1px_0_rgba(3,8,18,0.28)] backdrop-blur-[20px] backdrop-saturate-150 sm:p-7">
              <h2 className="text-xl font-semibold leading-7 text-white">По вашему запросу ничего не найдено.</h2>
              <p className="mt-3 max-w-2xl leading-6 text-[#CBD5E1]">
                Нужную деталь можно привезти под заказ — уточните у продавца в магазине или позвоните нам.
              </p>
              <a
                href="tel:+74962063304"
                className="tap-target mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[15px] border border-white/[0.14] bg-[linear-gradient(135deg,#2563EB,#1D4ED8)] px-5 py-3 text-center font-semibold text-white shadow-[0_12px_28px_rgba(29,78,216,0.3),inset_0_1px_0_rgba(255,255,255,0.25)] transition-[transform,border-color,box-shadow,filter] duration-150 hover:-translate-y-0.5 hover:border-white/[0.28] hover:brightness-110 hover:shadow-[0_16px_32px_rgba(29,78,216,0.36),inset_0_1px_0_rgba(255,255,255,0.32)] active:translate-y-px active:brightness-95 active:shadow-[0_8px_20px_rgba(29,78,216,0.24),inset_0_1px_0_rgba(255,255,255,0.16)] sm:w-auto"
              >
                <span>Позвонить</span>
                <span>+7 (496) 206-33-04</span>
              </a>
            </section>
          )
        ) : null}
      </section>
      <PublicFooter />
    </main>
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Search timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}
