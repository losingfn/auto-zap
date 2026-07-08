"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

export function HomeSearch() {
  const router = useRouter();

  function submitSearch(query: string) {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return;
    }

    router.push(`/search?q=${encodeURIComponent(normalizedQuery)}`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const query = String(formData.get("q") ?? "");

    submitSearch(query);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    submitSearch(event.currentTarget.value);
  }

  return (
    <form action="/search" method="get" className="w-full max-w-3xl" onSubmit={handleSubmit}>
      <label htmlFor="home-search" className="sr-only">
        Поиск по каталогу
      </label>
      <div className="group relative flex min-h-12 flex-col overflow-hidden rounded-card border border-white/20 bg-[#111827]/[0.92] shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl transition duration-300 hover:border-[#2563EB]/70 sm:min-h-16 sm:flex-row">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#93C5FD] to-transparent opacity-70" />
        <input
          id="home-search"
          name="q"
          type="search"
          placeholder="Введите название товара или бренд"
          className="min-h-12 flex-1 bg-transparent px-4 text-sm text-white outline-none placeholder:text-[#AEB8C7] sm:min-h-16 sm:px-6 sm:text-lg"
          onKeyDown={handleInputKeyDown}
        />
        <button
          type="submit"
          className="min-h-11 bg-[#2563EB] px-7 text-sm font-semibold text-white shadow-[0_0_34px_rgba(37,99,235,0.36)] transition duration-300 hover:bg-[#1D4ED8] sm:min-h-16 sm:text-base"
        >
          Найти
        </button>
      </div>
    </form>
  );
}
