import Link from "next/link";
import type { PublicProductListItem, PublicProductPagination } from "@/features/catalog/types";

export function ProductList({
  products,
  categorySlug,
  subcategorySlug,
  pagination,
  searchQuery = ""
}: {
  products: PublicProductListItem[];
  categorySlug: string;
  subcategorySlug: string;
  pagination: PublicProductPagination;
  searchQuery?: string;
}) {
  const hasSearch = Boolean(searchQuery.trim());
  return (
    <div>
      <div className="mb-5 rounded-card border border-white/10 bg-[linear-gradient(145deg,rgba(31,41,55,0.92),rgba(17,24,39,1))] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.22)]">
        <form
          action={`/catalog/${categorySlug}/${subcategorySlug}`}
          className="grid gap-3 sm:grid-cols-[1fr_auto]"
        >
          <label className="sr-only" htmlFor="subcategory-search">
            Поиск в подкатегории
          </label>
          <input
            id="subcategory-search"
            type="search"
            name="q"
            defaultValue={searchQuery}
            placeholder="Искать в этой подкатегории"
            className="min-h-12 rounded-card border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none transition placeholder:text-[#9CA3AF] focus:border-[#2563EB]"
          />
          <button className="min-h-12 rounded-card bg-[#2563EB] px-5 font-semibold text-white shadow-[0_18px_46px_rgba(37,99,235,0.3)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#1D4ED8]">
            Найти
          </button>
        </form>
      </div>

      <div className="mb-4 flex flex-col gap-2 rounded-card border border-white/10 bg-[#111827] p-4 text-sm text-[#CBD5E1] shadow-[0_16px_50px_rgba(0,0,0,0.18)] sm:flex-row sm:items-center sm:justify-between">
        <p>
          {hasSearch ? "Найдено в подкатегории" : "Найдено товаров"}:{" "}
          <span className="font-semibold text-white">
            {pagination.totalItems.toLocaleString("ru-RU")}
          </span>
        </p>
        <p>
          Страница {pagination.page.toLocaleString("ru-RU")} из{" "}
          {pagination.totalPages.toLocaleString("ru-RU")}
        </p>
      </div>

      {products.length > 0 ? (
        <>
          <div className="divide-y divide-white/10 overflow-hidden rounded-card border border-white/10 bg-[#111827] shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
            {products.map((product) => (
              <Link
                key={product.id}
                href={`/catalog/${categorySlug}/${subcategorySlug}/${product.slug}`}
                className="grid gap-2 p-4 transition duration-300 hover:bg-[#2563EB]/10 sm:grid-cols-[1fr_auto]"
              >
                <h2 className="text-base font-semibold leading-6">{product.name}</h2>
                <div className="text-lg font-semibold text-white">
                  {product.price.toLocaleString("ru-RU")} ₽
                </div>
              </Link>
            ))}
          </div>

          <PaginationControls
            categorySlug={categorySlug}
            subcategorySlug={subcategorySlug}
            pagination={pagination}
            searchQuery={searchQuery}
          />
        </>
      ) : (
        <div className="rounded-card border border-white/10 bg-[#111827] p-5 text-[#CBD5E1] shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
          {hasSearch ? "В этой подкатегории ничего не найдено." : "Товары появятся после публикации каталога."}
        </div>
      )}
    </div>
  );
}

function PaginationControls({
  categorySlug,
  subcategorySlug,
  pagination,
  searchQuery
}: {
  categorySlug: string;
  subcategorySlug: string;
  pagination: PublicProductPagination;
  searchQuery: string;
}) {
  if (pagination.totalPages <= 1) {
    return null;
  }

  const pages = visiblePages(pagination.page, pagination.totalPages);
  const baseHref = `/catalog/${categorySlug}/${subcategorySlug}`;

  return (
    <nav className="mt-5 flex flex-wrap items-center gap-2" aria-label="Пагинация товаров">
      <PageLink
        href={pageHref(baseHref, pagination.page - 1, searchQuery)}
        disabled={pagination.page <= 1}
        label="Назад"
      />
      {pages.map((page, index) =>
        page === "gap" ? (
          <span
            key={`gap-${index}`}
            className="flex h-10 min-w-10 items-center justify-center text-[#94A3B8]"
          >
            ...
          </span>
        ) : (
          <PageLink
            key={page}
            href={pageHref(baseHref, page, searchQuery)}
            label={String(page)}
            isActive={page === pagination.page}
          />
        )
      )}
      <PageLink
        href={pageHref(baseHref, pagination.page + 1, searchQuery)}
        disabled={pagination.page >= pagination.totalPages}
        label="Вперед"
      />
    </nav>
  );
}

function PageLink({
  href,
  label,
  disabled = false,
  isActive = false
}: {
  href: string;
  label: string;
  disabled?: boolean;
  isActive?: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-10 items-center justify-center rounded-card border border-white/10 px-4 text-sm font-semibold text-[#64748B]">
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={[
        "inline-flex h-10 items-center justify-center rounded-card border px-4 text-sm font-semibold shadow-[0_12px_34px_rgba(0,0,0,0.18)] transition duration-300 hover:-translate-y-0.5",
        isActive
          ? "border-[#2563EB] bg-[#2563EB] text-white"
          : "border-white/10 bg-[#111827] text-white hover:border-[#2563EB]/70 hover:bg-[#2563EB]/15"
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function pageHref(baseHref: string, page: number, searchQuery: string) {
  const params = new URLSearchParams();

  if (searchQuery.trim()) {
    params.set("q", searchQuery.trim());
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `${baseHref}?${query}` : baseHref;
}

function visiblePages(currentPage: number, totalPages: number) {
  const result: Array<number | "gap"> = [];
  const pageSet = new Set<number>([1, totalPages]);

  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
    if (page >= 1 && page <= totalPages) {
      pageSet.add(page);
    }
  }

  const sorted = [...pageSet].sort((a, b) => a - b);
  for (const page of sorted) {
    const previous = result[result.length - 1];
    if (typeof previous === "number" && page - previous > 1) {
      result.push("gap");
    }
    result.push(page);
  }

  return result;
}
