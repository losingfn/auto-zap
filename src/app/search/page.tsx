import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SearchPagination } from "@/components/search/search-pagination";
import { SearchPageForm } from "@/components/search/search-page-form";
import { ProductRow } from "@/components/catalog/product-row";
import { PublicFooter } from "@/components/site/public-footer";
import { formatPublicTargetLabel } from "@/config/public-taxonomy";
import {
  getAccessibleSearchPage,
  getSearchOffset,
  getSearchPageHref,
  getSearchTotalPages,
  parseSearchPage,
  SEARCH_PAGE_SIZE
} from "@/features/search/pagination";
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
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const search = await searchParams;
  const q = typeof search.q === "string" ? search.q : "";
  const page = parseSearchPage(search.page);
  let searchError = false;
  const result = q.trim()
    ? await withTimeout(
        searchProducts({
          query: q,
          limit: SEARCH_PAGE_SIZE,
          offset: getSearchOffset(page)
        }),
        6000
      ).catch((error) => {
        console.error("[public-search] failed", error);
        searchError = true;
        return null;
      })
    : null;

  const totalPages = result ? getSearchTotalPages(result.accessibleTotal) : 0;
  const accessiblePage = getAccessibleSearchPage(page, totalPages);
  if (result && accessiblePage !== page) {
    redirect(getSearchPageHref(q, accessiblePage));
  }

  return (
    <main className="search-page premium-page min-h-screen text-white">
      <section className="search-page-content mx-auto flex w-full flex-col gap-6">
        <div className="search-page-header">
          <Link href="/" className="search-page-back">
            ← На главную
          </Link>
          <h1 className="search-page-title">Поиск по каталогу</h1>
        </div>

        <SearchPageForm initialQuery={q} />

        {searchError ? (
          <div className="search-page-message">
            Поиск временно недоступен. Попробуйте обновить страницу чуть позже.
          </div>
        ) : result ? (
          result.total > 0 ? (
            <div className="search-page-results catalog-product-list space-y-4">
              <div className="text-sm text-[#CBD5E1]">
                Найдено: {result.total.toLocaleString("ru-RU")}
              </div>

              {result.hits.length > 0 ? (
                <>
                  <div className="catalog-product-rows divide-y divide-white/10 overflow-hidden rounded-card border border-white/10 bg-[#111827] shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
                    {result.hits.map((product) => (
                      <ProductRow
                        key={product.id}
                        href={product.url}
                        name={product.name}
                        price={product.price}
                        productIdentityId={product.productIdentityId}
                        description={formatPublicTargetLabel(product)}
                      />
                    ))}
                  </div>
                  <SearchPagination query={q} page={page} totalPages={totalPages} />
                </>
              ) : (
                <div className="search-page-message">
                  Ничего не найдено.
                </div>
              )}
            </div>
          ) : (
            <section className="search-page-message search-page-empty">
              <h2 className="text-xl font-semibold leading-7 text-white">По вашему запросу ничего не найдено.</h2>
              <p className="mt-3 max-w-2xl leading-6 text-[#CBD5E1]">
                Нужную деталь можно привезти под заказ — уточните у продавца в магазине или позвоните нам.
              </p>
              <a
                href="tel:+74962063304"
                className="search-page-phone customer-reviews-action customer-reviews-action-primary tap-target mt-5 inline-flex w-full gap-2 sm:w-auto"
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
