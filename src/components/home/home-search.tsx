"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "@/components/icons/lucide";

export function HomeSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");

  function submitSearch(query: string) {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return;
    }

    router.push(`/search?q=${encodeURIComponent(normalizedQuery)}`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    submitSearch(query);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    submitSearch(query);
  }

  function clearSearch() {
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <form action="/search" method="get" className="home-search w-full" onSubmit={handleSubmit}>
      <label htmlFor="home-search" className="home-search-label">
        Поиск по каталогу
      </label>
      <div className="home-search-control group relative flex flex-col overflow-hidden sm:flex-row">
        <div className="home-search-field relative flex flex-1">
          <input
            ref={inputRef}
            id="home-search"
            name="q"
            type="search"
            value={query}
            placeholder="Введите название товара или бренда"
            className="home-search-input w-full bg-transparent outline-none"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={handleInputKeyDown}
          />
          {query ? (
            <button
              type="button"
              onClick={clearSearch}
              className="home-search-clear tap-target absolute right-2 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center"
              aria-label="Очистить поиск"
            >
              <XIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <button
          type="submit"
          className="home-search-submit tap-target min-h-[52px] px-8 text-base font-semibold text-white sm:min-h-[68px] sm:text-lg"
        >
          Найти
        </button>
      </div>
    </form>
  );
}
