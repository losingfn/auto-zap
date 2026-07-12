"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "@/components/icons/lucide";

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

    router.push(`/search?q=${encodeURIComponent(normalizedQuery)}`);
  }

  function clearSearch() {
    setQuery("");
    router.replace("/search", { scroll: false });
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <form onSubmit={submitSearch} className="scroll-reveal flex flex-col gap-3 sm:flex-row">
      <label htmlFor="search-page-input" className="sr-only">
        Поиск по каталогу
      </label>
      <div className="relative flex flex-1">
        <input
          ref={inputRef}
          id="search-page-input"
          type="search"
          name="q"
          value={query}
          placeholder="Название товара или бренд"
          className="min-h-12 w-full rounded-card border border-white/10 bg-[#111827] px-4 pr-12 text-base shadow-[0_14px_42px_rgba(0,0,0,0.18)] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#2563EB]"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {query ? (
          <button
            type="button"
            onClick={clearSearch}
            className="tap-target absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-card text-[#CBD5E1] hover:bg-white/10 hover:text-white"
            aria-label="Очистить поиск"
          >
            <XIcon className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <button className="tap-target min-h-12 rounded-card bg-[#2563EB] px-5 font-semibold text-white shadow-[0_18px_46px_rgba(37,99,235,0.3)] hover:-translate-y-0.5 hover:bg-[#1D4ED8]">
        Найти
      </button>
    </form>
  );
}
