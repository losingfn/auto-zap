"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CancelImportResponse =
  | {
      ok: true;
      status: "cancelled";
      redirectTo: string;
    }
  | {
      ok: false;
      error?: {
        code?: string;
        message?: string;
      };
    };

export function ImportCancelButton({
  batchId,
  disabled
}: {
  batchId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function cancelImport() {
    if (disabled || isPending) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    const confirmed = window.confirm(
      "Отменить этот черновик? Активный каталог и поиск не изменятся"
    );
    if (!confirmed) {
      return;
    }

    setIsPending(true);

    try {
      const response = await fetch(
        `/api/admin/imports/${encodeURIComponent(batchId)}/cancel`,
        {
          method: "POST",
          headers: {
            Accept: "application/json"
          },
          credentials: "same-origin"
        }
      );
      const payload = (await response.json().catch(() => null)) as CancelImportResponse | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload && !payload.ok && payload.error?.message
            ? payload.error.message
            : "Не удалось отменить импорт."
        );
      }

      const redirectTo = safeImportRedirect(payload.redirectTo, batchId);
      setSuccessMessage("Черновик отменён. Теперь можно загрузить новый Excel.");
      router.replace(redirectTo);
      router.refresh();
    } catch (error) {
      setIsPending(false);
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось отменить импорт."
      );
    }
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={cancelImport}
        className="inline-flex h-11 items-center justify-center rounded-card border border-[#4169A8] px-5 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740] disabled:cursor-not-allowed disabled:border-[#334155] disabled:text-[#64748B]"
      >
        {isPending ? "Отмена…" : "Отменить импорт"}
      </button>

      {errorMessage ? (
        <p
          role="alert"
          className="mt-2 max-w-md rounded-card border border-[#7F1D1D] bg-[#2A1218] px-3 py-2 text-sm leading-5 text-[#FECACA]"
        >
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="mt-2 max-w-md rounded-card border border-[#14532D] bg-[#10231A] px-3 py-2 text-sm leading-5 text-[#BBF7D0]">
          {successMessage}
        </p>
      ) : null}
    </div>
  );
}

function safeImportRedirect(value: string, batchId: string) {
  if (value.startsWith("/admin/import?")) {
    return value;
  }

  return `/admin/import?batch=${encodeURIComponent(batchId)}&cancelled=1`;
}
