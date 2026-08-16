"use client";

import { useState } from "react";

export function PublishImportButton({
  formAction,
  disabled,
  recovery = false
}: {
  formAction: (formData: FormData) => void | Promise<void>;
  disabled: boolean;
  recovery?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const label = recovery ? "Восстановить поиск" : "Опубликовать изменения";
  return <form action={formAction} onSubmit={() => setPending(true)}><button type="submit" disabled={disabled || pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93C5FD] active:translate-y-px disabled:cursor-not-allowed disabled:bg-[#334155] disabled:text-[#94A3B8]">{pending ? <Spinner /> : null}{pending ? "Запускаем публикацию..." : label}</button></form>;
}

function Spinner() { return <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden="true" />; }
