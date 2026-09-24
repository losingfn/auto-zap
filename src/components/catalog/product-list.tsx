import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons/lucide";
import { PurchaseListProductBadge } from "@/components/purchase-list/purchase-list-product-badge";
import type { PublicProductListItem, PublicProductPagination } from "@/features/catalog/types";
import {
  type CatalogNavigationContext,
  withCatalogNavigationContext
} from "@/features/catalog/navigation-context";

export function ProductList({
  products,
  categorySlug,
  subcategorySlug,
  pagination,
  searchQuery = "",
  navigationContext
}: {
  products: PublicProductListItem[];
  categorySlug: string;
  subcategorySlug: string;
  pagination: PublicProductPagination;
  searchQuery?: string;
  navigationContext: CatalogNavigationContext;
}) {
  const hasSearch = Boolean(searchQuery.trim());
  return (
    <div className="catalog-product-list">
      <div className="catalog-product-search-shell mb-5 rounded-card border border-white/10 bg-[linear-gradient(145deg,rgba(31,41,55,0.92),rgba(17,24,39,1))] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.22)]">
        <form
          action={`/catalog/${categorySlug}/${subcategorySlug}`}
          className="catalog-product-search grid gap-3 sm:grid-cols-[1fr_auto]"
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
            className="catalog-product-search-input min-h-12 rounded-card border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none transition placeholder:text-[#9CA3AF] focus:border-[#2563EB]"
          />
          {navigationContext ? <input type="hidden" name="from" value={navigationContext} /> : null}
          <button className="catalog-product-search-submit tap-target min-h-12 rounded-card bg-[#2563EB] px-5 font-semibold text-white shadow-[0_18px_46px_rgba(37,99,235,0.3)] hover:-translate-y-0.5 hover:bg-[#1D4ED8]">
            Найти
          </button>
        </form>
      </div>

      <div className="catalog-product-results-meta mb-4 flex flex-col gap-2 rounded-card border border-white/10 bg-[#111827] p-4 text-sm text-[#CBD5E1] shadow-[0_16px_50px_rgba(0,0,0,0.18)] sm:flex-row sm:items-center sm:justify-between">
        <p className="catalog-product-results-count">
          {hasSearch ? "Найдено в подкатегории" : "Найдено товаров"}:{" "}
          <span className="font-semibold text-white">
            {pagination.totalItems.toLocaleString("ru-RU")}
          </span>
        </p>
        <p className="catalog-product-results-page">
          Страница {pagination.page.toLocaleString("ru-RU")} из{" "}
          {pagination.totalPages.toLocaleString("ru-RU")}
        </p>
      </div>

      {products.length > 0 ? (
        <>
          <div className="catalog-product-rows divide-y divide-white/10 overflow-hidden rounded-card border border-white/10 bg-[#111827] shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
            {products.map((product) => (
              <Link
                key={product.id}
                href={withCatalogNavigationContext(
                  `/catalog/${categorySlug}/${subcategorySlug}/${product.slug}`,
                  navigationContext
                )}
                className="catalog-product-row tap-target grid gap-2 p-4 hover:bg-[#2563EB]/10 sm:grid-cols-[1fr_auto]"
              >
                <div className="catalog-product-row-main">
                  <h2 className="catalog-product-row-title text-base font-semibold leading-6">
                    {product.name}
                  </h2>
                  <span className="catalog-product-row-badge block">
                    <PurchaseListProductBadge productIdentityId={product.productIdentityId} />
                  </span>
                </div>
                <div className="catalog-product-row-utility">
                  <div className="catalog-product-row-price text-lg font-semibold text-white">
                    {product.price.toLocaleString("ru-RU")} ₽
                  </div>
                  <span className="catalog-product-row-chevron hidden" aria-hidden="true">
                    <ChevronRightIcon />
                  </span>
                </div>
              </Link>
            ))}
          </div>

          <PaginationControls
            categorySlug={categorySlug}
            subcategorySlug={subcategorySlug}
            pagination={pagination}
            searchQuery={searchQuery}
            navigationContext={navigationContext}
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
  searchQuery,
  navigationContext
}: {
  categorySlug: string;
  subcategorySlug: string;
  pagination: PublicProductPagination;
  searchQuery: string;
  navigationContext: CatalogNavigationContext;
}) {
  if (pagination.totalPages <= 1) {
    return null;
  }

  const pages = visiblePages(pagination.page, pagination.totalPages);
  const baseHref = `/catalog/${categorySlug}/${subcategorySlug}`;

  return (
    <nav
      className="catalog-product-pagination mt-5 flex flex-wrap items-center gap-2"
      aria-label="Пагинация товаров"
    >
      <PageLink
        href={pageHref(baseHref, pagination.page - 1, searchQuery, navigationContext)}
        disabled={pagination.page <= 1}
        label="Назад"
      />
      {pages.map((page, index) =>
        page === "gap" ? (
          <span
            key={`gap-${index}`}
            className="catalog-product-pagination-gap flex h-10 min-w-10 items-center justify-center text-[#94A3B8]"
          >
            ...
          </span>
        ) : (
          <PageLink
            key={page}
            href={pageHref(baseHref, page, searchQuery, navigationContext)}
            label={String(page)}
            isActive={page === pagination.page}
          />
        )
      )}
      <PageLink
        href={pageHref(baseHref, pagination.page + 1, searchQuery, navigationContext)}
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
      <span className="catalog-product-page-link catalog-product-page-link--disabled inline-flex h-10 items-center justify-center rounded-card border border-white/10 px-4 text-sm font-semibold text-[#64748B]">
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={[
        "catalog-product-page-link tap-target inline-flex h-10 items-center justify-center rounded-card border px-4 text-sm font-semibold shadow-[0_12px_34px_rgba(0,0,0,0.18)] hover:-translate-y-0.5",
        isActive
          ? "catalog-product-page-link--active border-[#2563EB] bg-[#2563EB] text-white"
          : "border-white/10 bg-[#111827] text-white hover:border-[#2563EB]/70 hover:bg-[#2563EB]/15"
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function pageHref(
  baseHref: string,
  page: number,
  searchQuery: string,
  navigationContext: CatalogNavigationContext
) {
  const params = new URLSearchParams();

  if (searchQuery.trim()) {
    params.set("q", searchQuery.trim());
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return withCatalogNavigationContext(query ? `${baseHref}?${query}` : baseHref, navigationContext);
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
