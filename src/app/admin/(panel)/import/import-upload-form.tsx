"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

const maxFileSizeBytes = 25 * 1024 * 1024;
const allowedExtensions = new Set(["xls", "xlsx"]);
const waitingStages = [
  "Загружаем файл",
  "Проверяем структуру Excel",
  "Сопоставляем товары",
  "Готовим результат импорта"
];

type ImportUploadFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  formId: string;
  initialErrorMessage?: string | null;
};

type SelectedFileInfo = {
  name: string;
  sizeLabel: string;
  extension: string;
};

export function ImportUploadForm({
  action,
  formId,
  initialErrorMessage
}: ImportUploadFormProps) {
  const fileInputId = useId();
  const errorId = useId();
  const statusId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [selectedFile, setSelectedFile] = useState<SelectedFileInfo | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const visibleError = clientError ?? initialErrorMessage ?? null;

  useEffect(() => {
    if (initialErrorMessage) {
      setIsSubmitting(false);
      window.requestAnimationFrame(() => errorRef.current?.focus());
    }
  }, [initialErrorMessage]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    const file = event.currentTarget.files?.[0] ?? null;
    setSelectedFile(file ? getFileInfo(file) : null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (isSubmitting) {
      event.preventDefault();
      return;
    }

    const file = fileInputRef.current?.files?.[0] ?? null;
    const validationError = validateFile(file);
    if (validationError) {
      event.preventDefault();
      setClientError(validationError);
      setIsSubmitting(false);
      window.requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }

    setClientError(null);
    setIsSubmitting(true);
  }

  function handleReset() {
    setSelectedFile(null);
    setClientError(null);
    setIsSubmitting(false);
    window.requestAnimationFrame(() => fileInputRef.current?.focus());
  }

  return (
    <section
      id="new-import"
      className="rounded-card border border-[#243249] bg-[#101827] p-4 sm:p-5"
      aria-labelledby="new-import-title"
    >
      <h2 id="new-import-title" className="text-lg font-semibold">
        Новый импорт
      </h2>
      <form
        id={formId}
        action={action}
        noValidate
        aria-busy={isSubmitting}
        aria-describedby={`${statusId}${visibleError ? ` ${errorId}` : ""}`}
        onReset={handleReset}
        onSubmit={handleSubmit}
        className="mt-5"
      >
        <ImportUploadFields
          errorId={errorId}
          errorRef={errorRef}
          fileInputId={fileInputId}
          fileInputRef={fileInputRef}
          isSubmitting={isSubmitting}
          selectedFile={selectedFile}
          statusId={statusId}
          visibleError={visibleError}
          onFileChange={handleFileChange}
        />
      </form>
      <p className="mt-3 text-sm text-[#8FA1B8]">
        Проверяются расширение, MIME-тип и размер файла. Максимум - 25 МБ.
      </p>
    </section>
  );
}

function ImportUploadFields({
  errorId,
  errorRef,
  fileInputId,
  fileInputRef,
  isSubmitting,
  selectedFile,
  statusId,
  visibleError,
  onFileChange
}: {
  errorId: string;
  errorRef: React.RefObject<HTMLDivElement | null>;
  fileInputId: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isSubmitting: boolean;
  selectedFile: SelectedFileInfo | null;
  statusId: string;
  visibleError: string | null;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const { pending } = useFormStatus();
  const busy = pending || isSubmitting;
  const [activeStage, setActiveStage] = useState(0);
  const liveMessage = busy
    ? `${waitingStages[activeStage]}. Не закрывайте страницу.`
    : visibleError
      ? visibleError
      : selectedFile
        ? `Выбран файл ${selectedFile.name}.`
        : "Выберите Excel-файл.";

  useEffect(() => {
    if (!busy) {
      setActiveStage(0);
      return;
    }

    const timer = window.setInterval(() => {
      setActiveStage((current) => (current + 1) % waitingStages.length);
    }, 1600);

    return () => window.clearInterval(timer);
  }, [busy]);

  return (
    <div className="grid gap-4">
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label className="min-w-0" htmlFor={fileInputId}>
          <span className="text-sm font-medium text-[#C8D1DF]">Excel-файл</span>
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            name="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={busy}
            aria-invalid={Boolean(visibleError)}
            aria-describedby={visibleError ? errorId : undefined}
            onChange={onFileChange}
            className="mt-2 min-h-12 w-full min-w-0 rounded-card border border-[#2E3A4C] bg-[#0B1220] px-4 py-3 text-sm text-[#C8D1DF] outline-none transition file:mr-4 file:rounded-card file:border-0 file:bg-[#243249] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:border-[#4169A8] hover:file:bg-[#30425F] focus-visible:border-[#73A0F5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93C5FD] disabled:cursor-not-allowed disabled:border-[#1F2937] disabled:text-[#64748B] disabled:file:bg-[#334155] disabled:file:text-[#94A3B8]"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93C5FD] active:translate-y-px disabled:cursor-not-allowed disabled:bg-[#334155] disabled:text-[#94A3B8] lg:w-auto"
        >
          {busy ? <Spinner /> : null}
          {busy ? "Загрузка и проверка..." : "Загрузить и проверить"}
        </button>
      </div>

      {selectedFile ? (
        <dl className="grid gap-3 rounded-card border border-[#243249] bg-[#0B1220] p-4 text-sm sm:grid-cols-3">
          <FileMeta label="Файл" value={selectedFile.name} />
          <FileMeta label="Размер" value={selectedFile.sizeLabel} />
          <FileMeta label="Расширение" value={`.${selectedFile.extension}`} />
        </dl>
      ) : null}

      <div id={statusId} aria-live="polite" className="sr-only">
        {liveMessage}
      </div>

      {visibleError ? (
        <div
          ref={errorRef}
          id={errorId}
          tabIndex={-1}
          role="alert"
          className="rounded-card border border-[#7F1D1D] bg-[#2A1218] px-4 py-3 text-sm leading-6 text-[#FECACA] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FCA5A5]"
        >
          {visibleError}
        </div>
      ) : null}

      {busy ? <WaitingStages activeStage={activeStage} /> : null}
    </div>
  );
}

function WaitingStages({ activeStage }: { activeStage: number }) {
  return (
    <div className="rounded-card border border-[#243249] bg-[#0B1220] p-4" aria-live="polite">
      <div className="flex items-start gap-3">
        <Spinner />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#C8D1DF]">Идёт обработка файла</p>
          <p className="mt-1 text-sm leading-6 text-[#8FA1B8]">
            Не закрывайте страницу. Обработка большого прайса может занять некоторое время.
          </p>
        </div>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {waitingStages.map((stage, index) => (
          <li
            key={stage}
            className={[
              "rounded-card border px-3 py-2 text-sm transition",
              index === activeStage
                ? "border-[#73A0F5] bg-[#17263F] text-white"
                : "border-[#243249] bg-[#101827] text-[#8FA1B8]"
            ].join(" ")}
          >
            {stage}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-5 text-[#8FA1B8]">
        Это индикатор ожидания: сервер сообщит итог после завершения анализа.
      </p>
    </div>
  );
}

function FileMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase text-[#8FA1B8]">{label}</dt>
      <dd className="mt-1 break-words font-medium text-[#C8D1DF]">{value}</dd>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
      aria-hidden="true"
    />
  );
}

function validateFile(file: File | null) {
  if (!file) {
    return "Выберите Excel-файл перед загрузкой.";
  }

  const extension = getExtension(file.name);
  if (!allowedExtensions.has(extension)) {
    return "Неверное расширение файла. Загрузить можно только .xls или .xlsx.";
  }

  if (file.size === 0) {
    return "Файл пустой. Выберите другой Excel-файл.";
  }

  if (file.size > maxFileSizeBytes) {
    return "Файл слишком большой. Максимальный размер - 25 МБ.";
  }

  return null;
}

function getFileInfo(file: File): SelectedFileInfo {
  return {
    name: file.name,
    sizeLabel: formatFileSize(file.size),
    extension: getExtension(file.name) || "не определено"
  };
}

function getExtension(fileName: string) {
  const extension = fileName.split(".").pop();
  return extension && extension !== fileName ? extension.toLowerCase() : "";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }

  const units = ["КБ", "МБ", "ГБ"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toLocaleString("ru-RU", {
    maximumFractionDigits: value >= 10 ? 1 : 2
  })} ${units[unitIndex]}`;
}
