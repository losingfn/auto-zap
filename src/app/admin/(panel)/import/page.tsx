import type { Metadata } from "next";
import Link from "next/link";
import { getAdminImportPageData, type StoredImportReport } from "@/features/admin/imports";
import { cancelImportAction, publishImportAction, uploadImportAction } from "./actions";

export const metadata: Metadata = {
  title: "Импорт Excel"
};

type ImportPageProps = {
  searchParams: Promise<{
    batch?: string;
    error?: string;
    uploaded?: string;
    published?: string;
    cancelled?: string;
  }>;
};

const numberFormatter = new Intl.NumberFormat("ru-RU");
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Moscow"
});

const statusLabels: Record<string, string> = {
  uploaded: "Загружен",
  analyzed: "Предварительный отчёт готов",
  published: "Опубликован",
  cancelled: "Отменён",
  failed: "Ошибка",
  draft: "Черновик",
  active: "Активная версия",
  archived: "Архив",
  rolled_back: "Отменён"
};

const errorMessages: Record<string, string> = {
  missing_file: "Выберите Excel-файл для загрузки.",
  empty_file: "Файл пустой.",
  file_too_large: "Файл слишком большой. Максимальный размер — 25 МБ.",
  invalid_extension: "Загрузить можно только .xls или .xlsx.",
  invalid_type: "Тип файла не похож на Excel-документ.",
  analysis_failed: "Не удалось проанализировать Excel-файл.",
  publish_failed: "Не удалось опубликовать импорт.",
  cancel_failed: "Не удалось отменить импорт.",
  not_found: "Черновик импорта не найден.",
  not_ready: "Перед публикацией нужен предварительный отчёт.",
  already_finalized: "Этот импорт уже опубликован или отменён."
};

export default async function AdminImportPage({ searchParams }: ImportPageProps) {
  const params = await searchParams;
  const data = await getAdminImportPageData(params.batch);
  const report = data.selected?.report ?? null;

  return (
    <div>
      <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9DBDFB]">
            Импорт Excel
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Загрузка каталога</h1>
          <p className="mt-3 max-w-2xl text-[#C8D1DF]">
            Загрузите .xls или .xlsx, проверьте предварительный отчёт и только потом опубликуйте
            изменения.
          </p>
        </div>
      </div>

      {params.error ? (
        <Notice tone="danger">{errorMessages[params.error] ?? errorMessages.analysis_failed}</Notice>
      ) : null}
      {params.uploaded ? <Notice>Файл загружен, draft-версия и отчёт созданы.</Notice> : null}
      {params.published ? <Notice>Изменения опубликованы, поисковый индекс пересобран.</Notice> : null}
      {params.cancelled ? <Notice>Импорт отменён, draft-версия снята с публикации.</Notice> : null}

      <section className="rounded-card border border-[#243249] bg-[#101827] p-5">
        <h2 className="text-lg font-semibold">Новый импорт</h2>
        <form action={uploadImportAction} className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
          <input
            type="file"
            name="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="min-h-12 rounded-card border border-[#2E3A4C] bg-[#0B1220] px-4 py-3 text-sm text-[#C8D1DF] file:mr-4 file:rounded-card file:border-0 file:bg-[#243249] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#30425F]"
          />
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB]"
          >
            Загрузить и проверить
          </button>
        </form>
        <p className="mt-3 text-sm text-[#8FA1B8]">
          Проверяются расширение, MIME-тип и размер файла. Максимум — 25 МБ.
        </p>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="space-y-6">
          {data.selected ? (
            <>
              <ImportHeader batch={data.selected} />

              {report ? (
                <>
                  <ReportSummary report={report} />
                  <ImportActions
                    batchId={data.selected.id}
                    canPublish={data.selected.canPublish}
                    canCancel={data.selected.canCancel}
                  />
                  <SheetSummary report={report} />
                  <RowErrors errors={data.errors} totalErrors={report.errorRows} />
                  <ReviewExamples report={report} />
                </>
              ) : (
                <div className="rounded-card border border-[#243249] bg-[#101827] p-5 text-[#C8D1DF]">
                  Предварительный отчёт ещё не создан. Публикация недоступна.
                </div>
              )}
            </>
          ) : (
            <div className="rounded-card border border-[#243249] bg-[#101827] p-8 text-[#C8D1DF]">
              Импортов пока нет. Загрузите Excel-файл, чтобы увидеть отчёт.
            </div>
          )}
        </section>

        <aside className="rounded-card border border-[#243249] bg-[#101827] p-5">
          <h2 className="text-lg font-semibold">Последние импорты</h2>
          {data.batches.length > 0 ? (
            <div className="mt-4 space-y-3">
              {data.batches.map((batch) => (
                <Link
                  key={batch.id}
                  href={`/admin/import?batch=${batch.id}`}
                  className={[
                    "block rounded-card border p-4 transition",
                    data.selected?.id === batch.id
                      ? "border-[#73A0F5] bg-[#18253A]"
                      : "border-[#243249] bg-[#0B1220] hover:border-[#4169A8]"
                  ].join(" ")}
                >
                  <p className="line-clamp-2 text-sm font-semibold">{batch.sourceFileName}</p>
                  <p className="mt-2 text-xs text-[#8FA1B8]">{formatDate(batch.createdAt)}</p>
                  <p className="mt-2 text-xs text-[#C8D1DF]">
                    {statusLabels[batch.status] ?? batch.status}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#8FA1B8]">История появится после первой загрузки.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function ImportHeader({ batch }: { batch: NonNullable<Awaited<ReturnType<typeof getAdminImportPageData>>["selected"]> }) {
  return (
    <section className="rounded-card border border-[#243249] bg-[#101827] p-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div>
          <h2 className="text-xl font-semibold">{batch.sourceFileName}</h2>
          <p className="mt-2 text-sm text-[#8FA1B8]">
            Загружено: {formatDate(batch.createdAt)}
            {batch.uploadedByName || batch.uploadedByEmail
              ? ` · ${batch.uploadedByName ?? batch.uploadedByEmail}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Badge>{statusLabels[batch.status] ?? batch.status}</Badge>
          {batch.versionStatus ? <Badge>{statusLabels[batch.versionStatus] ?? batch.versionStatus}</Badge> : null}
        </div>
      </div>
    </section>
  );
}

function ReportSummary({ report }: { report: StoredImportReport }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="Добавлено" value={report.addedCount} />
      <StatCard label="Обновлено" value={report.updatedCount} />
      <StatCard label="Архивировано" value={report.archivedCount} />
      <StatCard label="Ошибки" value={report.errorRows} />
      <StatCard label="Требует проверки" value={report.reviewRows} />
    </section>
  );
}

function ImportActions({
  batchId,
  canPublish,
  canCancel
}: {
  batchId: string;
  canPublish: boolean;
  canCancel: boolean;
}) {
  return (
    <section className="rounded-card border border-[#243249] bg-[#101827] p-5">
      <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr] sm:items-center">
        <form action={publishImportAction}>
          <input type="hidden" name="batchId" value={batchId} />
          <button
            type="submit"
            disabled={!canPublish}
            className="inline-flex h-11 items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB] disabled:cursor-not-allowed disabled:bg-[#334155] disabled:text-[#94A3B8]"
          >
            Опубликовать изменения
          </button>
        </form>

        <form action={cancelImportAction}>
          <input type="hidden" name="batchId" value={batchId} />
          <button
            type="submit"
            disabled={!canCancel}
            className="inline-flex h-11 items-center justify-center rounded-card border border-[#4169A8] px-5 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740] disabled:cursor-not-allowed disabled:border-[#334155] disabled:text-[#64748B]"
          >
            Отменить импорт
          </button>
        </form>

        <p className="text-sm text-[#8FA1B8]">
          Публикация доступна только для draft-версии с предварительным отчётом.
        </p>
      </div>
    </section>
  );
}

function SheetSummary({ report }: { report: StoredImportReport }) {
  return (
    <section className="rounded-card border border-[#243249] bg-[#101827]">
      <div className="border-b border-[#243249] px-5 py-4">
        <h2 className="text-lg font-semibold">Структура Excel</h2>
        <p className="mt-1 text-sm text-[#8FA1B8]">Выбран лист: {report.selectedSheetName}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-[#8FA1B8]">
            <tr>
              <th className="px-5 py-3 font-medium">Лист</th>
              <th className="px-5 py-3 font-medium">Диапазон</th>
              <th className="px-5 py-3 font-medium">Строк</th>
              <th className="px-5 py-3 font-medium">Товар</th>
              <th className="px-5 py-3 font-medium">Цена</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#243249]">
            {report.sheets.map((sheet) => (
              <tr key={sheet.name}>
                <td className="px-5 py-3 font-medium">{sheet.name}</td>
                <td className="px-5 py-3 text-[#C8D1DF]">{sheet.range ?? "пусто"}</td>
                <td className="px-5 py-3 text-[#C8D1DF]">{numberFormatter.format(sheet.rowCount)}</td>
                <td className="px-5 py-3 text-[#C8D1DF]">
                  {formatColumn(sheet.detectedColumns.rawNameColumn)}
                </td>
                <td className="px-5 py-3 text-[#C8D1DF]">
                  {formatColumn(sheet.detectedColumns.priceColumn)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RowErrors({
  errors,
  totalErrors
}: {
  errors: Awaited<ReturnType<typeof getAdminImportPageData>>["errors"];
  totalErrors: number;
}) {
  return (
    <section className="rounded-card border border-[#243249] bg-[#101827]">
      <div className="border-b border-[#243249] px-5 py-4">
        <h2 className="text-lg font-semibold">Ошибки по строкам</h2>
        <p className="mt-1 text-sm text-[#8FA1B8]">
          Показано {numberFormatter.format(errors.length)} из {numberFormatter.format(totalErrors)}.
        </p>
      </div>
      {errors.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[#8FA1B8]">
              <tr>
                <th className="px-5 py-3 font-medium">Строка</th>
                <th className="px-5 py-3 font-medium">Поле</th>
                <th className="px-5 py-3 font-medium">Код</th>
                <th className="px-5 py-3 font-medium">Описание</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#243249]">
              {errors.map((error) => (
                <tr key={error.id}>
                  <td className="px-5 py-3 font-medium">{error.rowNumber ?? "—"}</td>
                  <td className="px-5 py-3 text-[#C8D1DF]">{error.fieldName ?? "—"}</td>
                  <td className="px-5 py-3 text-[#C8D1DF]">{error.code}</td>
                  <td className="px-5 py-3 text-[#C8D1DF]">{error.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-8 text-[#C8D1DF]">Ошибок в строках не найдено.</p>
      )}
    </section>
  );
}

function ReviewExamples({ report }: { report: StoredImportReport }) {
  return (
    <section className="rounded-card border border-[#243249] bg-[#101827] p-5">
      <h2 className="text-lg font-semibold">Требует проверки</h2>
      {report.examples.needsReview.length > 0 ? (
        <div className="mt-4 space-y-3">
          {report.examples.needsReview.map((row) => (
            <div key={`${row.sheetName}-${row.rowNumber}`} className="rounded-card border border-[#243249] bg-[#0B1220] p-4">
              <p className="text-sm font-semibold">Строка {row.rowNumber}: {row.rawName}</p>
              <p className="mt-1 text-sm text-[#8FA1B8]">
                {row.issues.map((issue) => issue.message).join("; ") || "Требуется ручная категоризация."}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[#C8D1DF]">Нет строк, требующих ручной проверки.</p>
      )}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-card border border-[#243249] bg-[#101827] p-5">
      <p className="text-sm text-[#8FA1B8]">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{numberFormatter.format(value)}</p>
    </article>
  );
}

function Notice({ children, tone = "success" }: { children: React.ReactNode; tone?: "success" | "danger" }) {
  return (
    <div
      className={[
        "mb-5 rounded-card border px-4 py-3 text-sm",
        tone === "danger"
          ? "border-[#7F1D1D] bg-[#2A1218] text-[#FECACA]"
          : "border-[#1D4E89] bg-[#10233D] text-[#BFDBFE]"
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-8 items-center rounded-card border border-[#4169A8] px-3 text-xs font-semibold text-[#C8D1DF]">
      {children}
    </span>
  );
}

function formatColumn(index: number | null) {
  return index === null ? "не найдена" : `колонка ${index + 1}`;
}

function formatDate(date: Date | null) {
  return date ? dateFormatter.format(date) : "—";
}
