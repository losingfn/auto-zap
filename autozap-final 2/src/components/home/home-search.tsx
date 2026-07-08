export function HomeSearch() {
  return (
    <form action="/search" className="w-full max-w-3xl">
      <label htmlFor="home-search" className="sr-only">
        Поиск по каталогу
      </label>
      <div className="flex min-h-16 flex-col overflow-hidden rounded-card border border-white/20 bg-[#101827]/90 shadow-2xl shadow-black/30 backdrop-blur sm:flex-row">
        <input
          id="home-search"
          name="q"
          type="search"
          placeholder="Введите название, бренд или код магазина"
          className="min-h-16 flex-1 bg-transparent px-5 text-base text-white outline-none placeholder:text-[#AEB8C7] sm:text-lg"
        />
        <button className="min-h-14 bg-[#2563EB] px-7 text-base font-semibold text-white transition hover:bg-[#1D4ED8] sm:min-h-16">
          Найти
        </button>
      </div>
    </form>
  );
}
