import Link from "next/link";
import { SearchPageForm } from "@/components/search/search-page-form";
import { PublicFooter } from "@/components/site/public-footer";
import { searchProducts } from "@/features/search/service";

export const dynamic = "force-dynamic";

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
                        {product.categoryName} → {product.subcategoryName}
                      </p>
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
