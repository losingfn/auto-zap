import Link from "next/link";
import { getSearchPageHref, visibleSearchPages } from "@/features/search/pagination";

export function SearchPagination({
  query,
  page,
  totalPages
}: {
  query: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = visibleSearchPages(page, totalPages);

  return (
    <nav className="mt-5 flex flex-wrap items-center gap-2" aria-label="Пагинация результатов поиска">
      <SearchPageLink
        href={getSearchPageHref(query, page - 1)}
        disabled={page <= 1}
        label="Назад"
      />
      {pages.map((visiblePage, index) =>
        visiblePage === "gap" ? (
          <span
            key={`gap-${index}`}
            aria-hidden="true"
            className="flex h-10 min-w-10 items-center justify-center text-[#94A3B8]"
          >
            ...
          </span>
        ) : (
          <SearchPageLink
            key={visiblePage}
            href={getSearchPageHref(query, visiblePage)}
            isActive={visiblePage === page}
            label={String(visiblePage)}
          />
        )
      )}
      <SearchPageLink
        href={getSearchPageHref(query, page + 1)}
        disabled={page >= totalPages}
        label="Вперед"
      />
    </nav>
  );
}

function SearchPageLink({
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
      <span
        aria-disabled="true"
        className="inline-flex h-10 items-center justify-center rounded-card border border-white/10 px-4 text-sm font-semibold text-[#64748B]"
      >
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={[
        "tap-target inline-flex h-10 items-center justify-center rounded-card border px-4 text-sm font-semibold shadow-[0_12px_34px_rgba(0,0,0,0.18)] hover:-translate-y-0.5",
        isActive
          ? "border-[#2563EB] bg-[#2563EB] text-white"
          : "border-white/10 bg-[#111827] text-white hover:border-[#2563EB]/70 hover:bg-[#2563EB]/15"
      ].join(" ")}
    >
      {label}
    </Link>
  );
}
