import { getAdminDashboardStats } from "@/features/admin/dashboard";

const numberFormatter = new Intl.NumberFormat("ru-RU");
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Moscow"
});

const actionLabels: Record<string, string> = {
  "admin.login": "Вход администратора",
  "admin.logout": "Выход администратора",
  "admin.password.change": "Смена пароля"
};

const importStatusLabels: Record<string, string> = {
  uploaded: "Загружен",
  analyzed: "Отчёт готов",
  published: "Опубликован",
  cancelled: "Отменён",
  failed: "Ошибка"
};

export default async function AdminDashboardPage() {
  const stats = await getAdminDashboardStats();

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9DBDFB]">
          Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Сводка по каталогу</h1>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Товаров" value={numberFormatter.format(stats.productCount)} />
        <StatCard label="Категорий" value={numberFormatter.format(stats.categoryCount)} />
        <StatCard label="Подкатегорий" value={numberFormatter.format(stats.subcategoryCount)} />
        <StatCard
          label="В очереди проверки"
          value={numberFormatter.format(stats.reviewQueueCount)}
        />
        <StatCard
          label="Обновление каталога"
          value={stats.lastCatalogUpdate ? dateFormatter.format(stats.lastCatalogUpdate) : "Нет данных"}
          compact
        />
      </section>

      <section className="mt-8 rounded-card border border-[#243249] bg-[#101827]">
        <div className="border-b border-[#243249] px-5 py-4">
          <h2 className="text-lg font-semibold">Последние действия</h2>
        </div>

        {stats.auditLogs.length > 0 ? (
          <div className="divide-y divide-[#243249]">
            {stats.auditLogs.map((log) => (
              <div key={log.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium">{actionLabels[log.action] ?? log.action}</p>
                  <p className="mt-1 text-sm text-[#8FA1B8]">
                    {log.adminName ?? log.adminEmail ?? "Система"}
                    {log.entityType ? ` · ${log.entityType}` : ""}
                  </p>
                </div>
                <time className="text-sm text-[#C8D1DF]" dateTime={log.createdAt.toISOString()}>
                  {dateFormatter.format(log.createdAt)}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-8 text-[#C8D1DF]">В журнале пока нет действий.</p>
        )}
      </section>

      <section className="mt-8 rounded-card border border-[#243249] bg-[#101827]">
        <div className="border-b border-[#243249] px-5 py-4">
          <h2 className="text-lg font-semibold">Последние импорты Excel</h2>
        </div>

        {stats.recentImports.length > 0 ? (
          <div className="divide-y divide-[#243249]">
            {stats.recentImports.map((item) => (
              <div key={item.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium">{item.sourceFileName}</p>
                  <p className="mt-1 text-sm text-[#8FA1B8]">
                    {item.uploadedByName ?? item.uploadedByEmail ?? "Система"}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-sm font-semibold text-[#C8D1DF]">
                    {importStatusLabels[item.status] ?? item.status}
                  </p>
                  <time className="text-sm text-[#8FA1B8]" dateTime={item.createdAt.toISOString()}>
                    {dateFormatter.format(item.createdAt)}
                  </time>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-8 text-[#C8D1DF]">Импортов пока нет.</p>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  compact = false
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <article className="rounded-card border border-[#243249] bg-[#101827] p-5">
      <p className="text-sm text-[#8FA1B8]">{label}</p>
      <p className={compact ? "mt-3 text-xl font-semibold" : "mt-3 text-3xl font-semibold"}>
        {value}
      </p>
    </article>
  );
}
