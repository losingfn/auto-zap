import type { Metadata } from "next";
import Link from "next/link";
import { getAdminImportPageData, type StoredImportReport } from "@/features/admin/imports";
import { publishImportAction, uploadImportAction } from "./actions";
import { ImportCancelButton } from "./import-cancel-button";
import { ImportProgressCard } from "./import-progress-card";
import { ImportUploadForm } from "./import-upload-form";
import { PublishImportButton } from "./publish-import-button";

export const metadata: Metadata = { title: "Импорт Excel" };

type ImportPageProps = {
  searchParams: Promise<{
    batch?: string;
    error?: string;
    accepted?: string;
    analyzed?: string;
    published?: string;
    publish_requested?: string;
    cancelled?: string;
  }>;
};

const numberFormatter = new Intl.NumberFormat("ru-RU");
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Moscow"
});
const importFormId = "admin-import-upload-form";
const statusLabels: Record<string, string> = {
  uploaded: "Обрабатывается",
  analyzed: "Готов к публикации",
  published: "Опубликован",
  cancelled: "Отменён",
  failed: "Ошибка"
};
const errorMessages: Record<string, string> = {
  missing_file: "Выберите Excel-файл для загрузки.",
  empty_file: "Файл пустой.",
  file_too_large: "Файл слишком большой. Максимальный размер — 25 МБ.",
  invalid_extension: "Загрузить можно только .xls или .xlsx.",
  invalid_type: "Тип файла не похож на Excel-документ.",
  analysis_failed: "Не удалось обработать Excel-файл.",
  publish_failed: "Не удалось опубликовать изменения.",
  safety_blocked: "Проверка перед публикацией не пройдена.",
  duplicate_file: "Файл с таким содержимым уже загружался.",
  import_in_progress: "Сейчас уже обрабатывается другой прайс. Дождитесь его завершения.",
  cancel_failed: "Не удалось отменить импорт.",
  not_found: "Импорт не найден.",
  not_ready: "Этот импорт пока нельзя опубликовать."
};

type SelectedImportBatch = NonNullable<
  Awaited<ReturnType<typeof getAdminImportPageData>>["selected"]
>;

export default async function AdminImportPage({ searchParams }: ImportPageProps) {
  const params = await searchParams;
  const data = await getAdminImportPageData(params.batch);
  const selected = data.selected;
  const report = selected?.report ?? null;
  const current = data.batches.find(
    (batch) => batch.status === "published" && batch.versionStatus === "active"
  );
  const error = params.error
    ? errorMessages[params.error] ?? "Не удалось выполнить действие. Попробуйте ещё раз."
    : null;

  return (
    <div>
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9DBDFB]">Импорт Excel</p>
        <h1 className="mt-2 text-3xl font-semibold">Загрузка каталога</h1>
        <p className="mt-3 max-w-3xl text-[#C8D1DF]">
          Загрузите новый Excel-прайс. Система автоматически сравнит его с текущим каталогом,
          обновит цены, добавит новые товары и подготовит изменения к публикации.
        </p>
      </header>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {params.accepted ? <Notice>Файл принят. Обработка выполняется на сервере.</Notice> : null}
      {params.analyzed ? <Notice>Прайс проверен и готов к публикации.</Notice> : null}
      {params.publish_requested ? <Notice>Публикация запущена на сервере.</Notice> : null}
      {params.published ? <Notice>Изменения опубликованы.</Notice> : null}
      {params.cancelled ? <Notice>Импорт отменён. Можно загрузить другой файл.</Notice> : null}

      <ImportUploadForm action={uploadImportAction} formId={importFormId} initialErrorMessage={error} />
      {current ? <CurrentPrice batch={current} /> : null}

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="space-y-6">
          {selected ? (
            <>
              <ImportHeader batch={selected} />
              <ImportProgressCard batchId={selected.id} />
              {report ? <ImportReport batch={selected} report={report} /> : <EmptyReport />}
              <ImportActions batch={selected} />
            </>
          ) : (
            <EmptyReport />
          )}
        </section>
        <RecentImports batches={data.batches} selectedId={selected?.id} />
      </div>
    </div>
  );
}

function CurrentPrice({ batch }: { batch: SelectedImportBatch }) {
  return (
    <section className="mt-6 rounded-card border border-[#243249] bg-[#101827] p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9DBDFB]">Актуальный прайс</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="font-semibold">{batch.sourceFileName}</p>
        <span className="rounded-full bg-[#10231A] px-3 py-1 text-sm text-[#BBF7D0]">● Опубликован</span>
      </div>
      <p className="mt-2 text-sm text-[#8FA1B8]">Загружен: {formatDate(batch.createdAt)}</p>
    </section>
  );
}

function ImportHeader({ batch }: { batch: SelectedImportBatch }) {
  return (
    <section className="rounded-card border border-[#243249] bg-[#101827] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="break-words text-xl font-semibold">{batch.sourceFileName}</h2>
          <p className="mt-2 text-sm text-[#8FA1B8]">Загружен: {formatDate(batch.createdAt)}</p>
        </div>
        <StatusBadge status={batch.status} phase={batch.phase} />
      </div>
    </section>
  );
}

function ImportReport({ batch, report }: { batch: SelectedImportBatch; report: StoredImportReport }) {
  const missingNames = report.issueCounts.missing_name ?? 0;
  return (
    <section className="rounded-card border border-[#243249] bg-[#101827]">
      <div className="border-b border-[#243249] px-5 py-4">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9DBDFB]">Импорт проанализирован</p>
        <h2 className="mt-2 text-2xl font-semibold">{batch.sourceFileName}</h2>
      </div>
      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Добавлено" value={report.addedCount} />
          <Metric label="Обновлено" value={report.updatedCount} />
          <Metric label="Архивировано" value={report.archivedCount} />
          <Metric label="Требуют проверки" value={report.reviewRows} warning={report.reviewRows > 0} />
          <Metric label="Ошибки" value={report.errorRows} warning={report.errorRows > 0} />
          <Metric label="Пропущено" value={report.skippedRows} />
          <Metric label="Всего строк" value={report.totalRows} />
          <Metric label="Товаров с артикулом" value={report.parsedRows} />
        </div>
        <PriceSummary report={report} />
        {report.safety ? <SafetySummary safety={report.safety} /> : null}
        {report.reviewRows > 0 ? <ReviewNotice count={report.reviewRows} /> : null}
        {missingNames > 0 ? (
          <Notice tone="warning">
            В файле найдено {numberFormatter.format(missingNames)} строк без названия товара. Они не
            будут автоматически опубликованы и требуют проверки.
          </Notice>
        ) : null}
      </div>
    </section>
  );
}

function PriceSummary({ report }: { report: StoredImportReport }) {
  const price = report.priceChanges;
  return (
    <section className="rounded-card border border-[#243249] bg-[#0B1220] p-4">
      <h3 className="text-lg font-semibold">Обновление цен</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Цены изменены" value={price.existingPriceUpdatedCount} />
        <Metric label="Повышены" value={price.increasedCount} />
        <Metric label="Снижены" value={price.decreasedCount} />
        <Metric label="Без изменений" value={price.unchangedCount} />
      </div>
    </section>
  );
}

function SafetySummary({ safety }: { safety: NonNullable<StoredImportReport["safety"]> }) {
  const blocked = safety.checks.filter((check) => check.status === "blocked");
  return (
    <section className="rounded-card border border-[#243249] bg-[#0B1220] p-4">
      <h3 className="text-lg font-semibold">Проверка перед публикацией</h3>
      {safety.canPublish ? (
        <p className="mt-2 text-sm text-[#BBF7D0]">✓ Файл проверен. Можно публиковать изменения.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-[#FDE68A]">⚠ Нужна проверка перед публикацией</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[#C8D1DF]">
            {blocked.map((check) => <li key={check.code}>{safetyReason(check.code)}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}

function ReviewNotice({ count }: { count: number }) {
  return (
    <section className="rounded-card border border-[#854D0E] bg-[#2A2113] p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-[#FDE68A]">{numberFormatter.format(count)} товара требуют проверки</h3>
          <p className="mt-2 text-sm text-[#FDE68A]">Система не смогла уверенно определить категорию для этих товаров. Они не будут опубликованы, пока не будут проверены.</p>
        </div>
        <ActionLink href="/admin/review">Перейти к проверке товаров</ActionLink>
      </div>
    </section>
  );
}

function ImportActions({ batch }: { batch: SelectedImportBatch }) {
  async function publish(formData: FormData) {
    "use server";
    formData.set("batchId", batch.id);
    await publishImportAction(formData);
  }
  return (
    <div className="flex flex-wrap gap-3">
      <PublishImportButton disabled={!batch.canPublish} formAction={publish} />
      <ImportCancelButton batchId={batch.id} disabled={!batch.canCancel} />
      <ActionLink href="/admin/catalog">Открыть каталог</ActionLink>
      <ActionLink href="#new-import">Загрузить другой файл</ActionLink>
    </div>
  );
}

function RecentImports({ batches, selectedId }: { batches: Awaited<ReturnType<typeof getAdminImportPageData>>["batches"]; selectedId?: string }) {
  return (
    <aside className="rounded-card border border-[#243249] bg-[#101827] p-5">
      <h2 className="text-lg font-semibold">Последние импорты</h2>
      {batches.length ? <div className="mt-4 space-y-3">{batches.map((batch) => (
        <Link key={batch.id} href={`/admin/import?batch=${batch.id}`} className={`block rounded-card border p-4 transition hover:border-[#4169A8] active:translate-y-px ${selectedId === batch.id ? "border-[#73A0F5] bg-[#18253A]" : "border-[#243249] bg-[#0B1220]"}`}>
          <p className="line-clamp-2 text-sm font-semibold">{batch.sourceFileName}</p>
          <p className="mt-2 text-xs text-[#8FA1B8]">{formatDate(batch.createdAt)}</p>
          <div className="mt-2"><StatusBadge status={batch.status} phase={batch.phase} /></div>
        </Link>
      ))}</div> : <p className="mt-4 text-sm text-[#8FA1B8]">История появится после первой загрузки.</p>}
    </aside>
  );
}

function EmptyReport() { return <section className="rounded-card border border-[#243249] bg-[#101827] p-8 text-[#C8D1DF]">Импортов пока нет. Загрузите Excel-файл, чтобы увидеть результат проверки.</section>; }
function Metric({ label, value, warning }: { label: string; value: number; warning?: boolean }) { return <div className={`rounded-card border p-4 ${warning ? "border-[#854D0E] bg-[#2A2113]" : "border-[#243249] bg-[#0B1220]"}`}><p className="text-sm text-[#8FA1B8]">{label}</p><p className="mt-2 text-2xl font-semibold">{numberFormatter.format(value)}</p></div>; }
function StatusBadge({ status, phase }: { status: string; phase?: string | null }) {
  const label = phase === "failed" ? "Ошибка" : phase === "publishing" || phase === "publish_queued" ? "Обрабатывается" : statusLabels[status] ?? status;
  return <span className="inline-flex rounded-full bg-[#243249] px-3 py-1 text-xs font-semibold text-[#C8D1DF]">{label}</span>;
}
function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "danger" | "warning" }) { const style = tone === "danger" ? "border-[#7F1D1D] bg-[#2A1218] text-[#FECACA]" : tone === "warning" ? "border-[#854D0E] bg-[#2A2113] text-[#FDE68A]" : "border-[#14532D] bg-[#10231A] text-[#BBF7D0]"; return <p className={`mb-5 rounded-card border px-4 py-3 text-sm ${style}`}>{children}</p>; }
function ActionLink({ href, children }: { href: string; children: React.ReactNode }) { return <Link href={href} className="inline-flex min-h-11 items-center justify-center rounded-card border border-[#4169A8] px-5 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93C5FD] active:translate-y-px">{children}</Link>; }
function safetyReason(code: string) { const reasons: Record<string, string> = { new_active_count: "В новом файле слишком мало товаров по сравнению с текущим каталогом.", catalog_shrink_ratio: "Слишком много товаров исчезло из нового прайса.", archive_ratio: "Слишком много товаров будет перенесено в архив.", missing_price_ratio: "В некоторых строках отсутствуют цены.", duplicate_shop_code: "Найдены повторяющиеся артикулы.", invalid_category: "Есть товары без корректной категории.", parse_error_ratio: "В файле слишком много строк с ошибками.", missing_name_ratio: "В файле слишком много строк без названия товара." }; return reasons[code] ?? "Файл требует дополнительной проверки перед публикацией."; }
function formatDate(value: Date | null) { return value ? dateFormatter.format(value) : "—"; }
