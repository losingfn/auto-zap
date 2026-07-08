"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[global-error]", error);

  return (
    <html lang="ru">
      <body>
        <main style={{ minHeight: "100vh", background: "#111827", color: "#FFFFFF", padding: 24 }}>
          <section
            style={{
              maxWidth: 560,
              margin: "12vh auto 0",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              background: "#0B1220",
              padding: 32,
              fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
            }}
          >
            <p style={{ color: "#93C5FD", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em" }}>
              ОШИБКА
            </p>
            <h1 style={{ marginTop: 12, fontSize: 28, lineHeight: 1.15 }}>
              Не удалось загрузить сайт
            </h1>
            <p style={{ marginTop: 16, color: "#CBD5E1", lineHeight: 1.6 }}>
              Попробуйте обновить страницу. Если ошибка повторится, проверьте логи приложения на
              сервере.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 24,
                border: 0,
                borderRadius: 8,
                background: "#2563EB",
                color: "#FFFFFF",
                cursor: "pointer",
                fontWeight: 700,
                padding: "12px 20px"
              }}
            >
              Повторить
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
