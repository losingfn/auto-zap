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
    <form action="/search" method="get" className="w-full max-w-3xl" onSubmit={handleSubmit}>
      <label htmlFor="home-search" className="sr-only">
        Поиск по каталогу
      </label>
      <div className="group relative flex min-h-12 flex-col overflow-hidden rounded-card border border-white/20 bg-[#111827]/[0.92] shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl transition duration-300 hover:border-[#2563EB]/70 sm:min-h-16 sm:flex-row">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#93C5FD] to-transparent opacity-70" />
        <div className="relative flex flex-1">
          <input
            ref={inputRef}
            id="home-search"
            name="q"
            type="search"
            value={query}
            placeholder="Введите название товара или бренд"
            className="min-h-12 w-full bg-transparent px-4 pr-12 text-sm text-white outline-none placeholder:text-[#AEB8C7] sm:min-h-16 sm:px-6 sm:pr-14 sm:text-lg"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={handleInputKeyDown}
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
        <button
          type="submit"
          className="tap-target min-h-11 bg-[#2563EB] px-7 text-sm font-semibold text-white shadow-[0_0_34px_rgba(37,99,235,0.36)] hover:bg-[#1D4ED8] sm:min-h-16 sm:text-base"
        >
          Найти
        </button>
      </div>
    </form>
  );
}
