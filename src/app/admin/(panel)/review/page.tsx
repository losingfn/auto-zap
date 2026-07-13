import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  getAdminReviewPageData,
  REVIEW_PAGE_SIZE_OPTIONS,
  type AdminReviewActionFilters,
  type AdminReviewCategoryOption,
  type AdminReviewItem,
  type AdminReviewParams
} from "@/features/admin/review";
import { resolveReviewItemAction } from "./actions";
import {
  ReviewBulkSelectionForm,
  ReviewGroupActionForm,
  ReviewReapplyRulesForm
} from "./review-client-controls";

export const metadata: Metadata = {
  title: "Проверка товаров"
};

type ReviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const numberFormatter = new Intl.NumberFormat("ru-RU");
const priceFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0
});
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const versionStatusLabels: Record<string, string> = {
  draft: "Черновик",
  active: "Активная версия"
};

const ruleSkippedLabels: Record<string, string> = {
  empty: "Правило не создано: шаблон пустой.",
  no_safe_pattern: "Правило не создано: не удалось подобрать достаточно точный шаблон.",
  too_short: "Правило не создано: шаблон слишком короткий.",
  dangerous_rule_word: "Правило не создано: шаблон слишком широкий или опасный.",
  single_word_too_broad: "Правило не создано: одно слово может быть слишком общим.",
  too_generic: "Правило не создано: шаблон слишком общий.",
  conflicting_rule: "Правило не создано: такой шаблон уже ведёт в другую категорию."
};

const errorLabels: Record<string, string> = {
  save_failed: "Не удалось сохранить исправление. Проверьте категорию и подкатегорию.",
  bulk_failed: "Не удалось выполнить массовое действие. Проверьте выбранную группу и категорию.",
  rules_failed: "Не удалось повторно применить правила к очереди.",
  bulk_scope_forbidden: "Массовые действия разрешены только для черновика текущего импорта.",
  bulk_confirmation_required: "Для массового действия больше 100 товаров нужно ввести точное количество.",
  bulk_rule_blocked: "Правило не создано: шаблон слишком широкий или опасный. Массовое действие не выполнено."
};

export default async function AdminReviewPage({ searchParams }: ReviewPageProps) {
  const params = await searchParams;
  const data = await getAdminReviewPageData(params);
  const filters = toActionFilters(data.params);

  return (
    <div>
      <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9DBDFB]">
            Проверка товаров
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Проверка товаров</h1>
          <p className="mt-3 max-w-3xl text-[#C8D1DF]">
            Здесь находятся товары, для которых система не смогла уверенно определить категорию
            или обнаружила проблему в данных.
          </p>
        </div>
        <ReviewReapplyRulesForm filters={filters} count={data.filteredCount} />
      </div>

      <Notices params={params} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Всего требуют проверки" value={data.summary.total} />
        <SummaryCard label="Без категории" value={data.summary.missingCategory} />
        <SummaryCard label="Без подкатегории" value={data.summary.missingSubcategory} />
        <SummaryCard label="Без названия" value={data.summary.missingName} />
        <SummaryCard label="Без уверенного предложения" value={data.summary.noSuggestion} />
        <SummaryCard label="Решено сегодня" value={data.summary.resolvedToday} />
      </section>

      <section className="mt-5 rounded-card border border-[#243249] bg-[#101827] p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h2 className="text-lg font-semibold">Версия каталога</h2>
            <p className="mt-2 text-sm leading-6 text-[#8FA1B8]">
              По умолчанию показан черновик последнего импорта. Active и смешанный режим доступны
              отдельно, чтобы не разбирать разные версии без явной подписи.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ScopeLink
              href={reviewHref(data.params, { scope: "draft", page: 1, group: "" })}
              active={data.params.scope === "draft"}
            >
              Черновик текущего импорта · {numberFormatter.format(data.summary.latestDraftOpen)}
            </ScopeLink>
            <ScopeLink
              href={reviewHref(data.params, { scope: "active", page: 1, group: "" })}
              active={data.params.scope === "active"}
            >
              Активный каталог · {numberFormatter.format(data.summary.activeOpen)}
            </ScopeLink>
            <ScopeLink
              href={reviewHref(data.params, { scope: "all", page: 1, group: "" })}
              active={data.params.scope === "all"}
            >
              Все записи
            </ScopeLink>
          </div>
        </div>
        <p className="mt-4 text-sm text-[#C8D1DF]">
          Сейчас: <span className="font-semibold">{scopeDescription(data)}</span>
        </p>
      </section>

      <FilterPanel data={data} />

      <section className="mt-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h2 className="text-xl font-semibold">Группы похожих товаров</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8FA1B8]">
              Группы строятся по нормализованному ключевому токену из названия. Это не идеальная
              классификация, но она превращает тысячи карточек в рабочие пачки.
            </p>
          </div>
          {data.selectedGroup ? (
            <Link
              href={reviewHref(data.params, { group: "", page: 1 })}
              className="inline-flex h-10 items-center justify-center rounded-card border border-[#4169A8] px-4 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740]"
            >
              Закрыть группу
            </Link>
          ) : null}
        </div>

        {data.selectedGroup ? (
          <div className="mt-5">
            <SelectedGroupPanel group={data.selectedGroup} categories={data.categories} filters={filters} />
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {data.groups.map((group) => (
            <article
              key={group.key}
              className={`rounded-card border bg-[#101827] p-5 ${
                group.key === data.params.group ? "border-[#73A0F5]" : "border-[#243249]"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">{group.label}</h3>
                  <p className="mt-1 text-sm text-[#8FA1B8]">
                    {numberFormatter.format(group.count)} товаров
                  </p>
                </div>
                <Badge>{group.suggestedCount > 0 ? "Есть предложение" : "Нет предложения"}</Badge>
              </div>
              <p className="mt-4 line-clamp-2 text-sm leading-6 text-[#8FA1B8]">{group.reason}</p>
              <ul className="mt-4 space-y-2 text-sm text-[#C8D1DF]">
                {group.examples.map((example) => (
                  <li key={example} className="truncate">
                    {example}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Badge>Без категории: {numberFormatter.format(group.missingCategoryCount)}</Badge>
                <Badge>Без подкатегории: {numberFormatter.format(group.missingSubcategoryCount)}</Badge>
              </div>
              {group.ruleWarning ? <p className="mt-4 text-sm text-[#FDE68A]">{group.ruleWarning}</p> : null}
              <Link
                href={reviewHref(data.params, { group: group.key, page: 1 })}
                className="mt-5 inline-flex h-10 items-center justify-center rounded-card bg-[#73A0F5] px-4 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB]"
              >
                Открыть группу
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h2 className="text-xl font-semibold">Товары в проверке</h2>
            <p className="mt-2 text-sm text-[#8FA1B8]">
              Показано {numberFormatter.format(data.pagination.from)}–{numberFormatter.format(data.pagination.to)} из{" "}
              {numberFormatter.format(data.pagination.total)}.
            </p>
          </div>
          <Pagination params={data.params} pageCount={data.pagination.pageCount} />
        </div>

        {data.items.length > 0 ? (
          <>
            <div className="mt-5">
              <ReviewBulkSelectionForm categories={data.categories} filters={filters} />
            </div>
            <div className="mt-5 space-y-5">
              {data.items.map((item, index) => (
                <ReviewCard
                  key={item.reviewId}
                  item={item}
                  categories={data.categories}
                  filters={filters}
                  bulkActionsDisabled={filters.scope !== "draft"}
                  autoFocus={index === 0}
                />
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <Pagination params={data.params} pageCount={data.pagination.pageCount} />
            </div>
          </>
        ) : (
          <section className="mt-5 rounded-card border border-[#243249] bg-[#101827] p-8 text-[#C8D1DF]">
            Очередь проверки пуста для выбранных фильтров.
          </section>
        )}
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        <InfoBlock title="Почему товар здесь?">
          Товар попал в проверку, потому что система не смогла уверенно определить категорию или
          подкатегорию.
        </InfoBlock>
        <InfoBlock title="Что значит создать правило?">
          Правило поможет автоматически распределять похожие товары сейчас и при следующих загрузках прайса.
        </InfoBlock>
        <InfoBlock title="Что будет после применения?">
          Товары получат выбранную категорию и исчезнут из очереди проверки, но каталог не будет
          опубликован автоматически.
        </InfoBlock>
      </section>
    </div>
  );
}

function Notices({ params }: { params: Record<string, string | string[] | undefined> }) {
  const resolved = readParam(params.resolved);
  const rule = readParam(params.rule);
  const ruleSkipped = readParam(params.ruleSkipped);
  const error = readParam(params.error);
  const bulkProcessed = readParam(params.bulkProcessed);
  const bulkRemaining = readParam(params.bulkRemaining);
  const bulkRule = readParam(params.bulkRule);
  const rulesBefore = readParam(params.rulesBefore);
  const rulesResolved = readParam(params.rulesResolved);
  const rulesAfter = readParam(params.rulesAfter);

  return (
    <>
      {resolved ? <Notice>Товар обновлён, запись проверки закрыта.</Notice> : null}
      {rule ? <Notice>Правило категоризации создано или уточнено.</Notice> : null}
      {ruleSkipped ? (
        <Notice tone="warning">
          {ruleSkippedLabels[ruleSkipped] ?? "Правило не создано: шаблон требует проверки."}
        </Notice>
      ) : null}
      {bulkProcessed ? (
        <Notice>
          Готово: обработано {bulkProcessed} товаров, осталось на проверке {bulkRemaining || "0"}.
          Создано правило: {bulkRule === "yes" ? "да" : "нет"}.
        </Notice>
      ) : null}
      {rulesBefore ? (
        <Notice>
          До применения правил: {rulesBefore}. Автоматически распределено: {rulesResolved || "0"}.
          Осталось: {rulesAfter || "0"}.
        </Notice>
      ) : null}
      {error ? <Notice tone="danger">{errorLabels[error] ?? "Не удалось выполнить действие."}</Notice> : null}
    </>
  );
}

function FilterPanel({ data }: { data: Awaited<ReturnType<typeof getAdminReviewPageData>> }) {
  return (
    <form method="get" className="mt-6 rounded-card border border-[#243249] bg-[#101827] p-5">
      <div className="grid gap-4 xl:grid-cols-[180px_220px_1fr_240px_140px_auto] xl:items-end">
        <label>
          <span className="text-sm font-medium text-[#C8D1DF]">Версия</span>
          <select name="scope" defaultValue={data.params.scope} className={inputClassName}>
            <option value="draft">Только draft-версия</option>
            <option value="active">Только active-версия</option>
            <option value="all">Все записи</option>
          </select>
        </label>
        <label>
          <span className="text-sm font-medium text-[#C8D1DF]">Фильтр</span>
          <select name="issue" defaultValue={data.params.issue} className={inputClassName}>
            {Object.entries(data.issueLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-medium text-[#C8D1DF]">Поиск</span>
          <input
            name="q"
            defaultValue={data.params.query}
            placeholder="болт, Toyota, ГСМ-01328"
            className={inputClassName}
          />
        </label>
        <label>
          <span className="text-sm font-medium text-[#C8D1DF]">Причина проверки</span>
          <select name="reason" defaultValue={data.params.reason} className={inputClassName}>
            <option value="">Все причины</option>
            {data.reasonOptions.map((reason) => (
              <option key={reason.reason} value={reason.reason}>
                {reason.reason} · {numberFormatter.format(reason.count)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-medium text-[#C8D1DF]">На странице</span>
          <select name="pageSize" defaultValue={data.params.pageSize} className={inputClassName}>
            {REVIEW_PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB]"
          >
            Найти
          </button>
          <Link
            href="/admin/review"
            className="inline-flex h-11 items-center justify-center rounded-card border border-[#4169A8] px-4 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740]"
          >
            Сбросить
          </Link>
        </div>
      </div>
    </form>
  );
}

function SelectedGroupPanel({
  group,
  categories,
  filters
}: {
  group: NonNullable<Awaited<ReturnType<typeof getAdminReviewPageData>>["selectedGroup"]>;
  categories: AdminReviewCategoryOption[];
  filters: AdminReviewActionFilters;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="rounded-card border border-[#243249] bg-[#101827] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9DBDFB]">
              Открытая группа
            </p>
            <h3 className="mt-2 text-2xl font-semibold">{group.label}</h3>
          </div>
          <Badge>{numberFormatter.format(group.count)} товаров</Badge>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#8FA1B8]">{group.reason}</p>
        <ul className="mt-4 grid gap-2 text-sm text-[#C8D1DF] md:grid-cols-2">
          {group.examples.map((example) => (
            <li key={example} className="truncate">
              {example}
            </li>
          ))}
        </ul>
      </div>
      <ReviewGroupActionForm categories={categories} filters={filters} group={group} />
    </section>
  );
}

function ReviewCard({
  item,
  categories,
  filters,
  bulkActionsDisabled,
  autoFocus
}: {
  item: AdminReviewItem;
  categories: AdminReviewCategoryOption[];
  filters: AdminReviewActionFilters;
  bulkActionsDisabled: boolean;
  autoFocus: boolean;
}) {
  const defaultCategoryId = item.suggestedCategoryId ?? item.currentCategoryId ?? "";
  const defaultSubcategoryId = item.suggestedSubcategoryId ?? item.currentSubcategoryId ?? "";

  return (
    <article className="rounded-card border border-[#243249] bg-[#101827] p-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-8 items-center gap-2 rounded-card border border-[#4169A8] px-3 text-xs font-semibold text-[#C8D1DF]">
              <input
                type="checkbox"
                name="reviewQueueId"
                value={item.reviewId}
                form="review-selected-form"
                data-review-select
                disabled={bulkActionsDisabled}
                className="h-4 w-4 accent-[#73A0F5]"
              />
              Выбрать
            </label>
            <Badge>{versionStatusLabels[item.catalogVersionStatus] ?? item.catalogVersionStatus}</Badge>
            <Badge>{item.shopCode}</Badge>
            <Badge>{priceFormatter.format(item.price)}</Badge>
            {item.importRowNumber ? <Badge>Строка Excel: {item.importRowNumber}</Badge> : null}
          </div>

          <h3 className="mt-4 text-xl font-semibold leading-snug">{item.name}</h3>
          {item.rawName !== item.name ? (
            <p className="mt-2 text-sm text-[#8FA1B8]">{item.rawName}</p>
          ) : null}

          <dl className="mt-5 grid gap-3 md:grid-cols-2">
            <InfoPair label="Причина проверки" value={item.reason} />
            <InfoPair
              label="Текущая категория"
              value={
                item.currentCategoryName || item.currentSubcategoryName
                  ? [item.currentCategoryName, item.currentSubcategoryName].filter(Boolean).join(" → ")
                  : "Не назначена"
              }
            />
            <InfoPair
              label="Предложение системы"
              value={
                item.suggestedCategoryName || item.suggestedSubcategoryName
                  ? [item.suggestedCategoryName, item.suggestedSubcategoryName].filter(Boolean).join(" → ")
                  : "Нет уверенного предложения"
              }
            />
            <InfoPair
              label="Версия"
              value={`${versionStatusLabels[item.catalogVersionStatus] ?? item.catalogVersionStatus}, ${dateFormatter.format(item.catalogVersionCreatedAt)}`}
            />
          </dl>
        </div>

        <form action={resolveReviewItemAction} className="rounded-card border border-[#243249] bg-[#0B1220] p-4">
          <HiddenReviewFilters filters={filters} />
          <input type="hidden" name="reviewQueueId" value={item.reviewId} />
          <input type="hidden" name="productId" value={item.productId} />

          <label className="block">
            <span className="text-sm font-medium text-[#C8D1DF]">Категория</span>
            <select
              name="categoryId"
              defaultValue={defaultCategoryId}
              required
              autoFocus={autoFocus}
              className={inputClassName}
            >
              <option value="">Выберите категорию</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-[#C8D1DF]">Подкатегория</span>
            <select name="subcategoryId" defaultValue={defaultSubcategoryId} required className={inputClassName}>
              <option value="">Выберите подкатегорию</option>
              {categories.map((category) => (
                <optgroup key={category.id} label={category.name}>
                  {category.subcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>
                      {subcategory.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="mt-4 flex items-start gap-3 rounded-card border border-[#243249] bg-[#101827] p-3">
            <input
              type="checkbox"
              name="learnRule"
              value="1"
              defaultChecked={Boolean(item.rulePattern)}
              className="mt-1 h-4 w-4 accent-[#73A0F5]"
            />
            <span>
              <span className="block text-sm font-medium text-[#C8D1DF]">
                Создать правило для похожих товаров
              </span>
              <span className="mt-1 block text-xs leading-5 text-[#8FA1B8]">
                Правило создаётся безопасным шаблоном. Уже существующая очередь применяет правила
                отдельной кнопкой сверху.
              </span>
            </span>
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-[#C8D1DF]">Шаблон правила</span>
            <input
              name="rulePattern"
              defaultValue={item.rulePattern ?? ""}
              placeholder="например: фильтр воздушный"
              className={inputClassName}
            />
          </label>

          <button
            type="submit"
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB]"
          >
            Сохранить
          </button>
        </form>
      </div>
    </article>
  );
}

function Pagination({ params, pageCount }: { params: AdminReviewParams; pageCount: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Link
        href={reviewHref(params, { page: Math.max(1, params.page - 1) })}
        className={`inline-flex h-10 items-center rounded-card border px-4 font-semibold transition ${
          params.page <= 1
            ? "pointer-events-none border-[#243249] text-[#536174]"
            : "border-[#4169A8] text-white hover:border-[#73A0F5] hover:bg-[#1A2740]"
        }`}
      >
        Предыдущая
      </Link>
      <span className="px-2 text-[#8FA1B8]">
        {params.page} / {pageCount}
      </span>
      <Link
        href={reviewHref(params, { page: Math.min(pageCount, params.page + 1) })}
        className={`inline-flex h-10 items-center rounded-card border px-4 font-semibold transition ${
          params.page >= pageCount
            ? "pointer-events-none border-[#243249] text-[#536174]"
            : "border-[#4169A8] text-white hover:border-[#73A0F5] hover:bg-[#1A2740]"
        }`}
      >
        Следующая
      </Link>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-[#243249] bg-[#101827] p-4">
      <p className="text-sm text-[#8FA1B8]">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{numberFormatter.format(value)}</p>
    </div>
  );
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-[#243249] bg-[#0B1220] p-4">
      <dt className="text-sm font-semibold text-[#C8D1DF]">{label}</dt>
      <dd className="mt-2 text-sm leading-6 text-[#8FA1B8]">{value}</dd>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-card border border-[#243249] bg-[#101827] p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#8FA1B8]">{children}</p>
    </div>
  );
}

function Notice({
  children,
  tone = "success"
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-[#7F1D1D] bg-[#2A1218] text-[#FECACA]"
      : tone === "warning"
        ? "border-[#854D0E] bg-[#2A2113] text-[#FDE68A]"
        : "border-[#1D4E89] bg-[#10233D] text-[#BFDBFE]";

  return <div className={`mb-5 rounded-card border px-4 py-3 text-sm ${toneClass}`}>{children}</div>;
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-8 items-center rounded-card border border-[#4169A8] px-3 text-xs font-semibold text-[#C8D1DF]">
      {children}
    </span>
  );
}

function ScopeLink({
  href,
  active,
  children
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-10 items-center rounded-card border px-4 text-sm font-semibold transition ${
        active
          ? "border-[#73A0F5] bg-[#1A2740] text-white"
          : "border-[#4169A8] text-[#C8D1DF] hover:border-[#73A0F5] hover:bg-[#1A2740] hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

function HiddenReviewFilters({ filters }: { filters: AdminReviewActionFilters }) {
  return (
    <>
      <input type="hidden" name="scope" value={filters.scope} />
      <input type="hidden" name="issue" value={filters.issue} />
      <input type="hidden" name="q" value={filters.query} />
      <input type="hidden" name="reason" value={filters.reason} />
      <input type="hidden" name="group" value={filters.group} />
    </>
  );
}

function scopeDescription(data: Awaited<ReturnType<typeof getAdminReviewPageData>>) {
  if (data.params.scope === "draft") {
    return data.versionContext.latestDraft
      ? `Черновик от ${dateFormatter.format(data.versionContext.latestDraft.createdAt)}`
      : "Черновик не найден";
  }

  if (data.params.scope === "active") {
    return data.versionContext.latestActive
      ? `Активный каталог от ${dateFormatter.format(data.versionContext.latestActive.publishedAt ?? data.versionContext.latestActive.createdAt)}`
      : "Активная версия не найдена";
  }

  return "Все открытые записи из draft и active";
}

function toActionFilters(params: AdminReviewParams): AdminReviewActionFilters {
  return {
    scope: params.scope,
    issue: params.issue,
    query: params.query,
    reason: params.reason,
    group: params.group
  };
}

function reviewHref(params: AdminReviewParams, overrides: Partial<AdminReviewParams & { group: string }>) {
  const next = { ...params, ...overrides };
  const query = new URLSearchParams();

  if (next.scope !== "draft") query.set("scope", next.scope);
  if (next.issue !== "all") query.set("issue", next.issue);
  if (next.query) query.set("q", next.query);
  if (next.reason) query.set("reason", next.reason);
  if (next.group) query.set("group", next.group);
  if (next.page > 1) query.set("page", String(next.page));
  if (next.pageSize !== 20) query.set("pageSize", String(next.pageSize));

  const search = query.toString();
  return search ? `/admin/review?${search}` : "/admin/review";
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const inputClassName =
  "mt-2 h-11 w-full rounded-card border border-[#2E3A4C] bg-[#0B1220] px-3 text-sm text-white outline-none placeholder:text-[#66758A] focus:border-[#73A0F5]";
