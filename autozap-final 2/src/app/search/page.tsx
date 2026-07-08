import Link from "next/link";
import { searchProducts } from "@/features/search/service";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const result = q.trim()
    ? await searchProducts({
        query: q,
        limit: 30
      })
    : null;

  return (
    <main className="min-h-screen bg-[#111827] text-white">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <Link href="/" className="text-sm text-[#D1D5DB] transition hover:text-white">
            ← На главную
          </Link>
          <h1 className="mt-4 text-3xl font-semibold">Поиск по каталогу</h1>
        </div>

        <form action="/search" className="flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Название, бренд или код магазина"
            className="min-h-12 flex-1 rounded-card border border-white/10 bg-[#1F2937] px-4 text-base outline-none transition placeholder:text-[#9CA3AF] focus:border-[#F97316]"
          />
          <button className="min-h-12 rounded-card bg-[#F97316] px-5 font-semibold text-white transition hover:bg-[#EA580C]">
            Найти
          </button>
        </form>

        {result ? (
          <div className="space-y-4">
            <div className="text-sm text-[#D1D5DB]">
              Найдено: {result.total}. Источник:{" "}
              {result.source === "meilisearch"
                ? "Meilisearch"
                : result.source === "postgres_fallback"
                  ? "PostgreSQL fallback"
                  : "PostgreSQL"}
            </div>

            {result.hits.length > 0 ? (
              <div className="divide-y divide-white/10 rounded-card border border-white/10 bg-[#1F2937]">
                {result.hits.map((product) => (
                  <Link
                    key={product.id}
                    href={product.url}
                    className="grid gap-2 p-4 transition hover:bg-white/5 sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <h2 className="text-base font-semibold leading-6">{product.name}</h2>
                      <p className="mt-1 text-sm text-[#D1D5DB]">
                        {product.categoryName} → {product.subcategoryName}
                      </p>
                      <p className="mt-1 text-sm text-[#D1D5DB]">
                        Код магазина: {product.shopCode}
                      </p>
                    </div>
                    <div className="text-lg font-semibold text-white">
                      {product.price.toLocaleString("ru-RU")} ₽
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-card border border-white/10 bg-[#1F2937] p-5 text-[#D1D5DB]">
                Ничего не найдено.
              </div>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
