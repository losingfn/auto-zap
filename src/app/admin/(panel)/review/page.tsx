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
import {
  getReviewReapplyPanelData,
  type ReviewReapplyPanelData
} from "@/features/admin/review-reapply";
import { requireAdminSession } from "@/features/admin/auth";
import {
  cancelReviewReapplyRunAction,
  createReviewReapplyApplyRunAction,
  createReviewReapplyDryRunAction,
  pauseReviewReapplyRunAction,
  publishReviewWorkspaceAction,
  resolveReviewItemAction,
  resumeReviewReapplyRunAction,
  rollbackReviewReapplyRunAction,
  undoLastReviewWorkspaceAction
} from "./actions";
import {
  ReviewBulkSelectionForm,
  ReviewGroupActionForm
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
const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const versionStatusLabels: Record<string, string> = {
  draft: "Черновик",
  active: "Активная версия"
};

const workspaceStatusLabels: Record<AdminReviewItem["workspaceStatus"], string> = {
  open: "В очереди",
  prepared: "Подготовлен",
  excluded: "Исключён"
};

const suggestionLevelLabels: Record<AdminReviewItem["suggestionLevel"], string> = {
  ready: "Готово",
  quick: "Быстро проверить",
  manual: "Вручную"
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
  save_failed: "Не удалось подготовить исправление. Проверьте категорию и подкатегорию.",
  bulk_failed: "Не удалось выполнить массовое действие. Проверьте выбранную группу и категорию.",
  rules_failed: "Не удалось повторно применить правила к очереди.",
  undo_failed: "Не удалось отменить последнее неопубликованное действие.",
  publish_failed: "Не удалось опубликовать рабочую сессию. Активный каталог и поиск не изменены.",
  reapply_failed: "Не удалось создать или обновить run повторной обработки.",
  bulk_scope_forbidden: "Массовые действия разрешены только в рабочей сессии.",
  bulk_confirmation_required: "Для массового действия больше 100 товаров нужно ввести точное количество.",
  bulk_preview_stale: "Состав группы изменился. Обновите preview и повторите действие.",
  bulk_rule_blocked: "Правило не создано: шаблон слишком широкий или опасный. Массовое действие не выполнено."
};

const reapplyNoticeLabels: Record<string, string> = {
  created: "Dry-run создан. Запустите CLI processor, чтобы обработать очередь batch-ами.",
  apply_created: "Apply run создан. Запустите CLI processor, чтобы подготовить AUTO_READY в workspace.",
  paused: "Run поставлен на паузу. Текущий batch, если он уже стартовал, завершится безопасно.",
  resumed: "Run готов к продолжению. Запустите CLI processor повторно.",
  cancelled: "Run отменён.",
  rolled_back: "Артефакты apply run отменены до публикации."
};

export default async function AdminReviewPage({ searchParams }: ReviewPageProps) {
  const session = await requireAdminSession();
  const params = await searchParams;
  const data = await getAdminReviewPageData(params, {
    adminUserId: session.user.id,
    createWorkspaceIfNeeded: true
  });
  const reapplyData = await getReviewReapplyPanelData({
    workspaceId: data.workspace.id,
    sourceCatalogVersionId: data.versionContext.activeVersion?.id ?? null
  });
  const filters = toActionFilters(data.params);

  return (
    <div>
      <div className="mb-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9DBDFB]">
            Проверка товаров
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Рабочая сессия проверки</h1>
          <p className="mt-3 max-w-3xl text-[#C8D1DF]">
            Здесь можно распределять товары пачками без изменения публичного каталога. Изменения
            попадут на сайт только после финальной публикации рабочей сессии.
          </p>
        </div>
      </div>

      <Notices params={params} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Осталось в очереди" value={data.summary.total} />
        <SummaryCard label="Готовые группы" value={data.summary.readyGroups} />
        <SummaryCard label="Готовые товары" value={data.summary.readyProducts} />
        <SummaryCard label="Быстрая проверка" value={data.summary.quickProducts} />
        <SummaryCard label="Только вручную" value={data.summary.manualProducts} />
        <SummaryCard label="Уже распределены" value={data.summary.preparedProducts} />
        <SummaryCard label="Исключены" value={data.summary.excludedProducts} />
        <SummaryCard label="Будет опубликовано" value={data.summary.willPublishProducts} />
      </section>

      <WorkspacePanel data={data} />
      <ReviewReapplyPanel data={reapplyData} />
      <FilterPanel data={data} />

      <section className="mt-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h2 className="text-xl font-semibold">Группы похожих товаров</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8FA1B8]">
              Группы строятся по нормализованным контекстным словам, существующим правилам и
              безопасным подсказкам. Общие слова сами по себе не создают массовое правило.
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

        {data.groupsUnavailable ? (
          <div className="mt-5 rounded-card border border-[#3A465C] bg-[#101827] p-5 text-sm leading-6 text-[#C8D1DF]">
            Группы временно недоступны. Можно пользоваться поиском и списком товаров.
          </div>
        ) : (
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
                      {numberFormatter.format(group.count)} товаров в группе
                    </p>
                  </div>
                  <Badge>{suggestionLevelLabels[group.level]}</Badge>
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-[#8FA1B8]">
                  {group.explanation}
                </p>
                <dl className="mt-4 grid gap-2 text-sm text-[#C8D1DF]">
                  <CompactRow label="Preview" value={`${numberFormatter.format(group.impactedProductCount)} безопасно`} />
                  <CompactRow label="Категория" value={formatTarget(group.suggestedCategoryName, group.suggestedSubcategoryName)} />
                  <CompactRow label="Уверенность" value={`${group.confidenceLabel} · ${Math.round(group.confidence * 100)}%`} />
                  <CompactRow label="Конфликты" value={numberFormatter.format(group.conflictingCount)} />
                </dl>
                <ul className="mt-4 space-y-2 text-sm text-[#C8D1DF]">
                  {group.examples.map((example) => (
                    <li key={example} className="truncate">
                      {example}
                    </li>
                  ))}
                </ul>
                {group.ruleWarning ? <p className="mt-4 text-sm text-[#FDE68A]">{group.ruleWarning}</p> : null}
                <Link
                  href={reviewHref(data.params, { group: group.key, page: 1 })}
                  className="mt-5 inline-flex h-10 items-center justify-center rounded-card bg-[#73A0F5] px-4 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB]"
                >
                  Открыть preview
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h2 className="text-xl font-semibold">Товары в проверке</h2>
            <p className="mt-2 text-sm text-[#8FA1B8]">
              Показано {numberFormatter.format(data.pagination.from)}-{numberFormatter.format(data.pagination.to)} из{" "}
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
                  bulkActionsDisabled={filters.scope !== "workspace"}
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
        <InfoBlock title="Что меняется сразу?">
          Только рабочая сессия проверки. Active-товары, публичный каталог и поиск не меняются до
          финальной публикации.
        </InfoBlock>
        <InfoBlock title="Что значит правило?">
          Постоянное правило создаётся только для безопасного шаблона и используется при следующих
          импортах. Слишком широкие слова блокируются.
        </InfoBlock>
        <InfoBlock title="Когда будет видно на сайте?">
          После кнопки «Опубликовать рабочую сессию»: создаётся новая версия каталога, затем
          обновляется поиск через безопасный индекс.
        </InfoBlock>
      </section>
    </div>
  );
}

function WorkspacePanel({ data }: { data: Awaited<ReturnType<typeof getAdminReviewPageData>> }) {
  const canPublish = data.summary.willPublishProducts > 0;
  const canUndo = Boolean(data.workspace.lastActionId);

  return (
    <section className="mt-5 rounded-card border border-[#243249] bg-[#101827] p-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div>
          <h2 className="text-lg font-semibold">Публикация рабочей сессии</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8FA1B8]">
            Сейчас: <span className="font-semibold text-[#C8D1DF]">{scopeDescription(data)}</span>.
            Подготовленные изменения не видны покупателям и не попадают в Meilisearch до публикации.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>Workspace: {data.workspace.status}</Badge>
            <Badge>Действий: {numberFormatter.format(data.workspace.actionCount)}</Badge>
            <Badge>К публикации: {numberFormatter.format(data.summary.willPublishProducts)}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <form action={undoLastReviewWorkspaceAction}>
            <button
              type="submit"
              disabled={!canUndo}
              className="inline-flex h-11 items-center justify-center rounded-card border border-[#4169A8] px-5 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740] disabled:cursor-not-allowed disabled:border-[#243249] disabled:text-[#536174]"
            >
              Отменить последнее
            </button>
          </form>
          <form action={publishReviewWorkspaceAction}>
            <button
              type="submit"
              disabled={!canPublish}
              className="inline-flex h-11 items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB] disabled:cursor-not-allowed disabled:bg-[#31415F] disabled:text-[#8FA1B8]"
            >
              Опубликовать рабочую сессию
            </button>
          </form>
        </div>
      </div>

      {data.changes.length > 0 ? (
        <div className="mt-5 border-t border-[#243249] pt-4">
          <p className="text-sm font-semibold text-[#C8D1DF]">Последние неопубликованные действия</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {data.changes.slice(0, 4).map((change) => (
              <div key={change.id} className="rounded-card border border-[#243249] bg-[#0B1220] p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#C8D1DF]">
                    {formatTarget(change.categoryName, change.subcategoryName)}
                  </span>
                  <Badge>{numberFormatter.format(change.productCount)} товаров</Badge>
                </div>
                <p className="mt-2 text-[#8FA1B8]">
                  {change.rulePattern ? `Правило: ${change.rulePattern}` : "Временное распределение"}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ReviewReapplyPanel({ data }: { data: ReviewReapplyPanelData }) {
  const activeRun = data.activeRun;
  const latestDryRun = data.latestDryRun;
  const latestApplyRun = data.latestApplyRun;
  const canCreateDryRun = !activeRun;
  const canCreateApply = Boolean(
    !activeRun &&
      latestDryRun &&
      latestDryRun.status === "completed" &&
      latestDryRun.pipelineVersion === data.pipelineVersion
  );
  const canPause = activeRun?.status === "pending" || activeRun?.status === "running";
  const canResume = activeRun?.status === "paused";
  const canCancel = Boolean(activeRun);
  const canRollback = Boolean(
    !activeRun &&
      latestApplyRun &&
      (latestApplyRun.status === "completed" || latestApplyRun.status === "completed_with_errors") &&
      latestApplyRun.preparedRows > 0
  );
  const commandRun = activeRun ?? latestDryRun ?? latestApplyRun;

  return (
    <section className="mt-5 rounded-card border border-[#243249] bg-[#101827] p-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div>
          <h2 className="text-lg font-semibold">Повторная обработка старой очереди</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[#8FA1B8]">
            Применение правил только подготовит решения. Товары не будут опубликованы, а строки
            очереди не будут закрыты до отдельной публикации workspace.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>Open rows: {numberFormatter.format(data.openReviewRows)}</Badge>
            <Badge>Pipeline: {data.pipelineVersion}</Badge>
            {activeRun ? <Badge>Run: {runStatusLabel(activeRun.status)}</Badge> : <Badge>Run: нет активного</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 xl:justify-end">
          <form action={createReviewReapplyDryRunAction}>
            <button
              type="submit"
              disabled={!canCreateDryRun}
              className="inline-flex h-11 items-center justify-center rounded-card border border-[#4169A8] px-5 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740] disabled:cursor-not-allowed disabled:border-[#243249] disabled:text-[#536174]"
            >
              Запустить dry-run
            </button>
          </form>
          <form action={createReviewReapplyApplyRunAction}>
            <input type="hidden" name="dryRunId" value={latestDryRun?.id ?? ""} />
            <button
              type="submit"
              disabled={!canCreateApply}
              className="inline-flex h-11 items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB] disabled:cursor-not-allowed disabled:bg-[#31415F] disabled:text-[#8FA1B8]"
            >
              Применить результат
            </button>
          </form>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <RunCard title="Последний dry-run" run={latestDryRun} />
        <RunCard title="Последний apply" run={latestApplyRun} />
      </div>

      {activeRun ? (
        <div className="mt-5 rounded-card border border-[#243249] bg-[#0B1220] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#C8D1DF]">Активный run</p>
              <p className="mt-1 text-sm text-[#8FA1B8]">
                {activeRun.mode === "dry_run" ? "Dry-run" : "Apply"} · {runStatusLabel(activeRun.status)}
                {activeRun.isStale ? " · heartbeat устарел" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <RunStateForm action={pauseReviewReapplyRunAction} runId={activeRun.id} label="Пауза" disabled={!canPause} />
              <RunStateForm action={resumeReviewReapplyRunAction} runId={activeRun.id} label="Продолжить" disabled={!canResume} />
              <RunStateForm action={cancelReviewReapplyRunAction} runId={activeRun.id} label="Отменить" disabled={!canCancel} />
            </div>
          </div>
          <ProgressBar processed={activeRun.processedRows} total={activeRun.totalRows} />
        </div>
      ) : null}

      {commandRun ? (
        <div className="mt-5 rounded-card border border-[#243249] bg-[#0B1220] p-4">
          <p className="text-sm font-semibold text-[#C8D1DF]">CLI processor</p>
          <code className="mt-2 block overflow-x-auto rounded-card bg-[#050914] px-3 py-2 text-sm text-[#C8D1DF]">
            pnpm review:reapply process {commandRun.id}
          </code>
        </div>
      ) : null}

      {canRollback && latestApplyRun ? (
        <div className="mt-5 rounded-card border border-[#523333] bg-[#1C1114] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[#FCA5A5]">
              Apply run можно отменить до публикации. Будут затронуты только pending items/actions этого run.
            </p>
            <RunStateForm action={rollbackReviewReapplyRunAction} runId={latestApplyRun.id} label="Откатить apply run" disabled={false} />
          </div>
        </div>
      ) : null}

      {data.groups.length > 0 ? (
        <div className="mt-5 border-t border-[#243249] pt-4">
          <p className="text-sm font-semibold text-[#C8D1DF]">Группы последнего dry-run</p>
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {data.groups.slice(0, 8).map((group) => (
              <div key={group.id} className="rounded-card border border-[#243249] bg-[#0B1220] p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#C8D1DF]">{decisionStatusLabel(group.decisionStatus)}</span>
                  <Badge>{numberFormatter.format(group.productCount)} строк</Badge>
                </div>
                <p className="mt-2 text-[#8FA1B8]">{group.groupKey}</p>
                <p className="mt-2 text-[#8FA1B8]">
                  {formatTarget(group.categoryName, group.subcategoryName)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RunCard({
  title,
  run
}: {
  title: string;
  run: ReviewReapplyPanelData["latestDryRun"];
}) {
  if (!run) {
    return (
      <div className="rounded-card border border-[#243249] bg-[#0B1220] p-4 text-sm text-[#8FA1B8]">
        {title}: нет данных.
      </div>
    );
  }

  return (
    <div className="rounded-card border border-[#243249] bg-[#0B1220] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#C8D1DF]">{title}</p>
        <Badge>{runStatusLabel(run.status)}</Badge>
      </div>
      <ProgressBar processed={run.processedRows} total={run.totalRows} />
      <dl className="mt-4 grid gap-2 text-sm text-[#8FA1B8] sm:grid-cols-2">
        <Metric label="AUTO_READY" value={run.autoReadyRows} />
        <Metric label="Potential pending" value={run.preparedRows} />
        <Metric label="Already pending" value={run.alreadyPendingRows} />
        <Metric label="GROUP_REVIEW" value={run.groupReviewRows} />
        <Metric label="MANUAL_REVIEW" value={run.manualRows} />
        <Metric label="BLOCKED" value={run.blockedRows} />
        <Metric label="DO_NOT_PUBLISH" value={run.doNotPublishRows} />
        <Metric label="Errors" value={run.errorRows} />
      </dl>
      <p className="mt-3 text-xs text-[#8FA1B8]">
        Создан: {formatDateTime(run.createdAt)}
        {run.lastHeartbeatAt ? ` · heartbeat: ${formatDateTime(run.lastHeartbeatAt)}` : ""}
        {run.finishedAt ? ` · завершён: ${formatDateTime(run.finishedAt)}` : ""}
      </p>
    </div>
  );
}

function RunStateForm({
  action,
  runId,
  label,
  disabled
}: {
  action: (formData: FormData) => void | Promise<void>;
  runId: string;
  label: string;
  disabled: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="runId" value={runId} />
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex h-10 items-center justify-center rounded-card border border-[#4169A8] px-4 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740] disabled:cursor-not-allowed disabled:border-[#243249] disabled:text-[#536174]"
      >
        {label}
      </button>
    </form>
  );
}

function ProgressBar({ processed, total }: { processed: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-[#8FA1B8]">
        <span>{numberFormatter.format(processed)} / {numberFormatter.format(total)}</span>
        <span>{percent}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-[#1A2740]">
        <div className="h-2 rounded-full bg-[#73A0F5]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd className="font-semibold text-[#C8D1DF]">{numberFormatter.format(value)}</dd>
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
  const reapply = readParam(params.reapply);
  const undoCount = readParam(params.undoCount);
  const publishedCount = readParam(params.publishedCount);

  return (
    <>
      {resolved ? <Notice>Изменение подготовлено в рабочей сессии. Публичный каталог пока не изменён.</Notice> : null}
      {rule ? <Notice>Правило категоризации создано или уточнено.</Notice> : null}
      {ruleSkipped ? (
        <Notice tone="warning">
          {ruleSkippedLabels[ruleSkipped] ?? "Правило не создано: шаблон требует проверки."}
        </Notice>
      ) : null}
      {bulkProcessed ? (
        <Notice>
          Готово: подготовлено {bulkProcessed} товаров, осталось в выбранном наборе {bulkRemaining || "0"}.
          Создано правило: {bulkRule === "yes" ? "да" : "нет"}.
        </Notice>
      ) : null}
      {rulesBefore ? (
        <Notice>
          До применения правил: {rulesBefore}. Подготовлено автоматически: {rulesResolved || "0"}.
          Осталось: {rulesAfter || "0"}.
        </Notice>
      ) : null}
      {reapply ? <Notice>{reapplyNoticeLabels[reapply] ?? "Статус повторной обработки обновлён."}</Notice> : null}
      {undoCount ? <Notice>Отменено последнее неопубликованное действие: {undoCount} товаров.</Notice> : null}
      {publishedCount ? <Notice>Рабочая сессия опубликована: {publishedCount} товаров переведены в active.</Notice> : null}
      {error ? <Notice tone="danger">{errorLabels[error] ?? "Не удалось выполнить действие."}</Notice> : null}
    </>
  );
}

function FilterPanel({ data }: { data: Awaited<ReturnType<typeof getAdminReviewPageData>> }) {
  return (
    <form method="get" className="mt-6 rounded-card border border-[#243249] bg-[#101827] p-5">
      <div className="grid gap-4 xl:grid-cols-[180px_220px_1fr_240px_140px_auto] xl:items-end">
        <label>
          <span className="text-sm font-medium text-[#C8D1DF]">Режим</span>
          <select name="scope" defaultValue={data.params.scope} className={inputClassName}>
            <option value="workspace">Рабочая сессия</option>
            <option value="active">Активная очередь</option>
            <option value="all">Все открытые</option>
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
            placeholder="болт суппорта, Toyota, ГСМ-01328"
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
              Preview группы
            </p>
            <h3 className="mt-2 text-2xl font-semibold">{group.label}</h3>
          </div>
          <Badge>{numberFormatter.format(group.impactedProductCount)} безопасно</Badge>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#8FA1B8]">{group.explanation}</p>
        <dl className="mt-4 grid gap-2 text-sm text-[#C8D1DF] md:grid-cols-2">
          <CompactRow label="Всего в группе" value={numberFormatter.format(group.count)} />
          <CompactRow label="Применится" value={numberFormatter.format(group.impactedProductCount)} />
          <CompactRow label="Конфликтов" value={numberFormatter.format(group.conflictingCount)} />
          <CompactRow label="Только вручную" value={numberFormatter.format(group.manualOnlyCount)} />
        </dl>
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
                disabled={bulkActionsDisabled || item.workspaceStatus !== "open"}
                className="h-4 w-4 accent-[#73A0F5]"
              />
              Выбрать
            </label>
            <Badge>{workspaceStatusLabels[item.workspaceStatus]}</Badge>
            <Badge>{suggestionLevelLabels[item.suggestionLevel]}</Badge>
            <Badge>{item.confidenceLabel} · {Math.round(item.confidence * 100)}%</Badge>
            <Badge>{versionStatusLabels[item.catalogVersionStatus] ?? item.catalogVersionStatus}</Badge>
            <Badge>{item.shopCode}</Badge>
            <Badge>{priceFormatter.format(item.price)}</Badge>
          </div>

          <h3 className="mt-4 text-xl font-semibold leading-snug">{item.name}</h3>
          {item.rawName !== item.name ? (
            <p className="mt-2 text-sm text-[#8FA1B8]">{item.rawName}</p>
          ) : null}

          <dl className="mt-5 grid gap-3 md:grid-cols-2">
            <InfoPair label="Причина проверки" value={item.reason} />
            <InfoPair
              label="Текущая категория"
              value={formatTarget(item.currentCategoryName, item.currentSubcategoryName)}
            />
            <InfoPair
              label="Предложение системы"
              value={formatTarget(item.suggestedCategoryName, item.suggestedSubcategoryName)}
            />
            <InfoPair
              label="Версия"
              value={`${versionStatusLabels[item.catalogVersionStatus] ?? item.catalogVersionStatus}, ${dateFormatter.format(item.catalogVersionCreatedAt)}`}
            />
            {item.pendingCategoryName || item.pendingSubcategoryName ? (
              <InfoPair
                label="Подготовлено"
                value={formatTarget(item.pendingCategoryName, item.pendingSubcategoryName)}
              />
            ) : null}
            <InfoPair label="Объяснение" value={item.explanation} />
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
              disabled={item.workspaceStatus !== "open"}
              className={item.workspaceStatus !== "open" ? disabledInputClassName : inputClassName}
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
            <select
              name="subcategoryId"
              defaultValue={defaultSubcategoryId}
              required
              disabled={item.workspaceStatus !== "open"}
              className={item.workspaceStatus !== "open" ? disabledInputClassName : inputClassName}
            >
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
              disabled={item.workspaceStatus !== "open"}
              className="mt-1 h-4 w-4 accent-[#73A0F5] disabled:cursor-not-allowed"
            />
            <span>
              <span className="block text-sm font-medium text-[#C8D1DF]">
                Создать правило для похожих товаров
              </span>
              <span className="mt-1 block text-xs leading-5 text-[#8FA1B8]">
                Правило создаётся только если шаблон достаточно точный.
              </span>
            </span>
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-[#C8D1DF]">Шаблон правила</span>
            <input
              name="rulePattern"
              defaultValue={item.rulePattern ?? ""}
              placeholder="например: фильтр воздушный"
              disabled={item.workspaceStatus !== "open"}
              className={item.workspaceStatus !== "open" ? disabledInputClassName : inputClassName}
            />
          </label>

          <button
            type="submit"
            disabled={item.workspaceStatus !== "open"}
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB] disabled:cursor-not-allowed disabled:bg-[#31415F] disabled:text-[#8FA1B8]"
          >
            Подготовить изменение
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

function CompactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[120px_1fr]">
      <dt className="text-[#8FA1B8]">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-[#243249] bg-[#0B1220] p-4">
      <dt className="text-sm font-semibold text-[#C8D1DF]">{label}</dt>
      <dd className="mt-2 text-sm leading-6 text-[#8FA1B8]">{value || "Нет данных"}</dd>
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
  if (!data.versionContext.activeVersion) {
    return "Активная версия не найдена";
  }

  return `Активный каталог от ${dateFormatter.format(
    data.versionContext.activeVersion.publishedAt ?? data.versionContext.activeVersion.createdAt
  )}`;
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

  if (next.scope !== "workspace") query.set("scope", next.scope);
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

function runStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Ожидает CLI",
    running: "Выполняется",
    paused: "Пауза",
    completed: "Завершён",
    completed_with_errors: "Завершён с ошибками",
    failed: "Ошибка",
    cancelled: "Отменён"
  };
  return labels[status] ?? status;
}

function decisionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    AUTO_READY: "AUTO_READY",
    GROUP_REVIEW: "GROUP_REVIEW",
    MANUAL_REVIEW: "MANUAL_REVIEW",
    BLOCKED_CONFLICT: "BLOCKED_CONFLICT",
    DO_NOT_PUBLISH: "DO_NOT_PUBLISH",
    INVALID_INPUT: "INVALID_INPUT"
  };
  return labels[status] ?? status;
}

function formatDateTime(value: Date | string) {
  return dateTimeFormatter.format(typeof value === "string" ? new Date(value) : value);
}

function formatTarget(categoryName: string | null | undefined, subcategoryName: string | null | undefined) {
  return [categoryName, subcategoryName].filter(Boolean).join(" -> ") || "Нет данных";
}

const inputClassName =
  "mt-2 h-11 w-full rounded-card border border-[#2E3A4C] bg-[#0B1220] px-3 text-sm text-white outline-none placeholder:text-[#66758A] focus:border-[#73A0F5]";
const disabledInputClassName =
  "mt-2 h-11 w-full cursor-not-allowed rounded-card border border-[#243249] bg-[#101827] px-3 text-sm text-[#536174] outline-none";
