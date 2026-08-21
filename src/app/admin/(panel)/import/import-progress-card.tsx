"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ImportStatus = {
  batchId: string;
  phase: "analyzing" | "ready" | "publishing" | "published" | "retrying" | "failed" | "cancelled";
  status: string;
  progress: number;
  stage: string;
  message: string | null;
  attempt: number;
  canPublish: boolean;
  reviewCount: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export function ImportProgressCard({ batchId, initialPhase }: { batchId: string; initialPhase?: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<ImportStatus | null>(null);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`/api/admin/imports/${encodeURIComponent(batchId)}/status`, {
          credentials: "same-origin",
          cache: "no-store"
        });
        if (!response.ok) return;
        const next = (await response.json()) as ImportStatus;
        if (!active) return;
        setStatus(next);
        if (isTerminal(next.phase)) {
          router.refresh();
          return;
        }
      } catch {
        // A transient browser/network failure must not erase the last known server state.
      }
      if (active) timer = window.setTimeout(poll, 2500);
    };
    void poll();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [batchId, router]);

  const phase = status?.phase ?? normalizeInitialPhase(initialPhase);
  if (!phase || phase === "ready" || phase === "published" || phase === "cancelled") return null;

  const failed = phase === "failed";
  const retrying = phase === "retrying";
  const publishing = phase === "publishing";
  const title = failed
    ? "Не удалось завершить операцию"
    : publishing
      ? "Публикуем изменения"
      : retrying
        ? "Система повторит операцию"
        : "Обрабатываем прайс";

  return (
    <section className={`rounded-card border p-5 ${failed ? "border-[#7F1D1D] bg-[#2A1218]" : "border-[#4169A8] bg-[#101827]"}`} aria-live="polite">
      <div className="flex items-start gap-3">
        {!failed ? <Spinner /> : <span className="text-xl" aria-hidden="true">⚠</span>}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-[#C8D1DF]">{status?.stage ?? "Файл принят"}</p>
          {!failed ? <p className="mt-2 text-sm text-[#8FA1B8]">Можно закрыть эту страницу — обработка продолжится.</p> : null}
          {retrying ? <p className="mt-2 text-sm text-[#FDE68A]">Временная ошибка. Повтор будет выполнен автоматически.</p> : null}
          {failed ? <p className="mt-2 text-sm text-[#FECACA]">{status?.errorMessage ?? "Проверьте файл и попробуйте ещё раз."}</p> : null}
        </div>
      </div>
      {!failed ? (
        <p className="mt-4 text-xs text-[#8FA1B8]">Этап выполняется на сервере.</p>
      ) : null}
    </section>
  );
}

function isTerminal(phase: ImportStatus["phase"]) {
  return phase === "ready" || phase === "published" || phase === "failed" || phase === "cancelled";
}

function normalizeInitialPhase(phase: string | null | undefined) {
  if (["queued", "analyzing", "retrying"].includes(phase ?? "")) return "analyzing";
  if (["publish_queued", "publishing", "publish_retrying"].includes(phase ?? "")) return "publishing";
  if (phase === "failed") return "failed";
  return null;
}

function Spinner() {
  return <span className="mt-1 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#9DBDFB] border-r-transparent motion-reduce:animate-none" aria-hidden="true" />;
}
