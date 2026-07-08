import type { Metadata } from "next";
import Link from "next/link";
import {
  AdminNotice,
  AdminPageIntro,
  AdminSubmitButton,
  inputClassName
} from "@/components/admin/content-ui";
import {
  getAdminBackupsPageData,
  ROLLBACK_CONFIRMATION
} from "@/features/admin/backups/service";
import { rollbackCatalogVersionAction } from "./actions";

export const metadata: Metadata = {
  title: "Резервные копии"
};

type BackupsPageProps = {
  searchParams: Promise<{ rolledBack?: string; error?: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Moscow"
});

const statusLabels: Record<string, string> = {
  draft: "Черновик",
  active: "Активная",
  archived: "Архив",
  rolled_back: "Отменена",
  analyzed: "Отчёт готов",
  published: "Опубликован",
  cancelled: "Отменён",
  failed: "Ошибка"
};

export default async function AdminBackupsPage({ searchParams }: BackupsPageProps) {
  const [params, data] = await Promise.all([searchParams, getAdminBackupsPageData()]);

  return (
    <div>
      <AdminPageIntro
        eyebrow="Каталог"
        title="Резервные копии и экспорт"
        text="Просмотр версий каталога, ручной откат к архивной версии и экспорт активного каталога в Excel."
      />
      {params.rolledBack ? <AdminNotice>Каталог откатан, поисковый индекс пересобран или помечен в журнале.</AdminNotice> : null}
      {params.error ? <AdminNotice tone="danger">Откат не выполнен. Проверьте версию и подтверждение.</AdminNotice> : null}

      <section className="mb-6 rounded-card border border-[#243249] bg-[#101827] p-5">
        <h2 className="text-lg font-semibold">Экспорт активного каталога</h2>
        <p className="mt-2 text-sm text-[#8FA1B8]">
          Excel содержит внутренний код, название, цену, категорию и подкатегорию.
        </p>
        <Link
          href="/admin/backups/export"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB]"
        >
          Скачать Excel
        </Link>
      </section>

      <section className="rounded-card border border-[#243249] bg-[#101827]">
        <div className="border-b border-[#243249] px-5 py-4">
          <h2 className="text-lg font-semibold">Версии каталога</h2>
        </div>
        <div className="divide-y divide-[#243249]">
          {data.versions.map((version) => (
            <article key={version.id} className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_360px] xl:items-center">
              <div>
                <div className="flex flex-wrap gap-2 text-xs text-[#8FA1B8]">
                  <span>{statusLabels[version.status] ?? version.status}</span>
                  <span>{formatDate(version.createdAt)}</span>
                  {version.publishedAt ? <span>публикация {formatDate(version.publishedAt)}</span> : null}
                </div>
                <h3 className="mt-2 font-semibold">{version.sourceFileName ?? "Версия каталога"}</h3>
                <p className="mt-1 text-sm text-[#8FA1B8]">
                  строк: {version.totalRows}, добавлено: {version.addedCount}, обновлено: {version.updatedCount}, архивировано: {version.archivedCount}, ошибки: {version.errorCount}, проверка: {version.reviewCount}
                </p>
              </div>
              {version.status === "archived" ? (
                <form action={rollbackCatalogVersionAction} className="rounded-card border border-[#2E3A4C] bg-[#0B1220] p-4">
                  <input type="hidden" name="catalogVersionId" value={version.id} />
                  <label>
                    <span className="text-sm text-[#C8D1DF]">Для отката введите {ROLLBACK_CONFIRMATION}</span>
                    <input name="confirmation" placeholder={ROLLBACK_CONFIRMATION} className={inputClassName} />
                  </label>
                  <div className="mt-4">
                    <AdminSubmitButton>Откатить к этой версии</AdminSubmitButton>
                  </div>
                </form>
              ) : (
                <p className="text-sm text-[#8FA1B8]">Откат доступен только для архивных опубликованных версий.</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-card border border-[#243249] bg-[#101827]">
        <div className="border-b border-[#243249] px-5 py-4">
          <h2 className="text-lg font-semibold">Журнал импортов</h2>
        </div>
        <div className="divide-y divide-[#243249]">
          {data.imports.map((item) => (
            <div key={item.id} className="px-5 py-4">
              <p className="font-semibold">{item.sourceFileName}</p>
              <p className="mt-1 text-sm text-[#8FA1B8]">
                {statusLabels[item.status] ?? item.status} · создан {formatDate(item.createdAt)}
                {item.publishedAt ? ` · опубликован ${formatDate(item.publishedAt)}` : ""}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-card border border-[#243249] bg-[#101827]">
        <div className="border-b border-[#243249] px-5 py-4">
          <h2 className="text-lg font-semibold">Публикации и действия</h2>
        </div>
        <div className="divide-y divide-[#243249]">
          {data.auditLogs.map((log) => (
            <div key={log.id} className="px-5 py-4">
              <p className="font-semibold">{log.action}</p>
              <p className="mt-1 text-sm text-[#8FA1B8]">
                {formatDate(log.createdAt)} · {log.adminName ?? log.adminEmail ?? "Система"}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatDate(date: Date | null) {
  return date ? dateFormatter.format(date) : "—";
}
