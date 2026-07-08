"use client";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[app-error]", error);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#111827] px-4 py-16 text-white">
      <section className="w-full max-w-xl rounded-card border border-white/10 bg-[#0B1220] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#93C5FD]">
          Ошибка
        </p>
        <h1 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">
          Не удалось загрузить страницу
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#CBD5E1] sm:text-base">
          Попробуйте обновить страницу. Если ошибка повторится, администратор сможет проверить
          журнал приложения на сервере.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-card bg-[#2563EB] px-5 py-3 text-sm font-semibold text-white transition duration-300 hover:bg-[#1D4ED8]"
        >
          Повторить
        </button>
      </section>
    </main>
  );
}
