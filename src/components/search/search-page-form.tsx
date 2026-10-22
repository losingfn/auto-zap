"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "@/components/icons/lucide";
import { getSearchPageHref } from "@/features/search/pagination";

export function SearchPageForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      router.push("/search");
      return;
    }

    router.push(getSearchPageHref(normalizedQuery, 1));
  }

  function clearSearch() {
    setQuery("");
    router.replace("/search", { scroll: false });
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <form onSubmit={submitSearch} className="search-page-form scroll-reveal flex flex-col gap-3 sm:flex-row">
      <label htmlFor="search-page-input" className="sr-only">
        Поиск по каталогу
      </label>
      <div className="search-page-field relative flex flex-1">
        <input
          ref={inputRef}
          id="search-page-input"
          type="search"
          name="q"
          value={query}
          placeholder="Название товара или бренд"
          className="search-page-input w-full"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {query ? (
          <button
            type="button"
            onClick={clearSearch}
            className="search-page-clear tap-target absolute right-2 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-card text-[#CBD5E1] hover:bg-white/10 hover:text-white"
            aria-label="Очистить поиск"
          >
            <XIcon className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <button className="search-page-submit customer-reviews-action customer-reviews-action-primary tap-target">
        Найти
      </button>
    </form>
  );
}
