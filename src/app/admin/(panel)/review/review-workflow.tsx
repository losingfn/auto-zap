"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type {
  AdminReviewCategoryOption,
  AdminReviewItem,
  AdminReviewPrimaryData,
  IdentityReviewDecision
} from "@/features/admin/review";
import {
  appendTemporarilySkippedReviewId,
  createIsolatedReviewFormState,
  shouldApplyReviewActionResponse
} from "@/features/admin/review-form-state";
import {
  confirmReviewGroupInlineAction,
  confirmReviewItemInlineAction,
  loadNextReviewItemInlineAction,
  publishReviewWorkspaceAction,
  undoLastReviewWorkspaceInlineAction
} from "./actions";

const inputClassName =
  "mt-2 h-11 w-full rounded-card border border-[#2E3A4C] bg-[#0B1220] px-3 text-base text-white outline-none focus:border-[#73A0F5] focus-visible:ring-2 focus-visible:ring-[#73A0F5]";
const primaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93C5FD] disabled:cursor-not-allowed disabled:bg-[#31415F] disabled:text-[#8FA1B8]";
const secondaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-card border border-[#4169A8] px-5 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93C5FD] disabled:cursor-not-allowed disabled:border-[#243249] disabled:text-[#536174]";

type Feedback = {
  tone: "success" | "warning" | "danger";
  message: string;
  canUndo?: boolean;
};

export function ReviewWorkflow({ initialData }: { initialData: AdminReviewPrimaryData }) {
  const [data, setData] = useState(initialData);
  const [skippedReviewQueueIds, setSkippedReviewQueueIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(() => focusFeedback(initialData));
  const [isPending, startTransition] = useTransition();
  const activeReviewId = useRef<string | null>(initialData.item?.reviewId ?? null);

  useEffect(() => {
    activeReviewId.current = initialData.item?.reviewId ?? null;
    setData(initialData);
    setSkippedReviewQueueIds([]);
    setFeedback(focusFeedback(initialData));
  }, [initialData]);

  const updateData = (next: AdminReviewPrimaryData) => {
    activeReviewId.current = next.item?.reviewId ?? null;
    setData(next);
  };

  const confirmItem = (input: {
    item: AdminReviewItem;
    categoryId: string;
    subcategoryId: string;
    learnRule: boolean;
    identityDecision: IdentityReviewDecision | null;
  }) => {
    const actionReviewId = input.item.reviewId;
    startTransition(async () => {
      const result = await confirmReviewItemInlineAction({
        reviewQueueId: input.item.reviewId,
        productId: input.item.productId,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        learnRule: input.learnRule,
        rulePattern: input.item.rulePattern,
        identityDecision: input.identityDecision,
        skippedReviewQueueIds
      });
      if (!shouldApplyReviewActionResponse(activeReviewId.current, actionReviewId)) return;
      if (result.ok) {
        updateData(result.data);
        setFeedback({
          tone: result.ruleWasNotSaved ? "warning" : "success",
          message: result.ruleWasNotSaved
            ? "Товар подтверждён. Это решение не удалось безопасно запомнить для будущих товаров."
            : "Товар подтверждён.",
          canUndo: true
        });
      } else {
        if ("data" in result && result.data) updateData(result.data);
        setFeedback({ tone: "stale" in result && result.stale ? "warning" : "danger", message: result.message });
      }
    });
  };

  const confirmSimilarGroup = (input: {
    item: AdminReviewItem;
    categoryId: string;
    subcategoryId: string;
    learnRule: boolean;
  }) => {
    const group = data.similarGroup;
    if (!group || group.count < 2) return;
    if (!window.confirm(`Будет подтверждено: ${group.count} товаров. Продолжить?`)) return;
    const actionReviewId = input.item.reviewId;

    startTransition(async () => {
      const result = await confirmReviewGroupInlineAction({
        reviewQueueIds: group.reviewQueueIds,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        learnRule: input.learnRule,
        rulePattern: input.item.rulePattern,
        skippedReviewQueueIds
      });
      if (!shouldApplyReviewActionResponse(activeReviewId.current, actionReviewId)) return;
      if (result.ok) {
        updateData(result.data);
        setFeedback({
          tone: result.ruleWasNotSaved ? "warning" : "success",
          message: result.ruleWasNotSaved
            ? `Подтверждено товаров: ${result.processed}. Решение не удалось безопасно запомнить.`
            : `Подтверждено товаров: ${result.processed}.`,
          canUndo: true
        });
      } else {
        if ("data" in result && result.data) updateData(result.data);
        setFeedback({ tone: "stale" in result && result.stale ? "warning" : "danger", message: result.message });
      }
    });
  };

  const skipItem = () => {
    if (!data.item) return;
    const nextSkipped = appendTemporarilySkippedReviewId(skippedReviewQueueIds, data.item.reviewId);
    setSkippedReviewQueueIds(nextSkipped);
    const prefetchedItem = data.prefetchedItems[0];
    if (prefetchedItem) {
      updateData({
        ...data,
        item: prefetchedItem,
        prefetchedItems: data.prefetchedItems.slice(1),
        similarGroup: null
      });
      setFeedback(null);
      return;
    }
    startTransition(async () => {
      const nextData = await loadNextReviewItemInlineAction({ skippedReviewQueueIds: nextSkipped });
      updateData(nextData);
      setFeedback(null);
    });
  };

  const undo = () => {
    startTransition(async () => {
      const result = await undoLastReviewWorkspaceInlineAction({ skippedReviewQueueIds });
      if (result.ok) {
        updateData(result.data);
        setFeedback({ tone: "success", message: "Последнее действие отменено." });
      } else {
        setFeedback({ tone: "danger", message: result.message });
      }
    });
  };

  return (
    <section aria-busy={isPending}>
      {feedback ? <FeedbackNotice feedback={feedback} onUndo={undo} disabled={isPending} /> : null}
      <Progress summary={data.summary} />
      {data.item ? (
        <ReviewItemCard
          key={data.item.reviewId}
          item={data.item}
          categories={data.categories}
          similarCount={data.similarGroup?.count ?? 1}
          isPending={isPending}
          onConfirm={confirmItem}
          onConfirmGroup={confirmSimilarGroup}
          onSkip={skipItem}
        />
      ) : (
        <ReviewComplete canUndo={data.canUndo} canPublish={data.summary.reviewed > 0} onUndo={undo} undoPending={isPending} />
      )}
    </section>
  );
}

function Progress({ summary }: { summary: AdminReviewPrimaryData["summary"] }) {
  return (
    <div className="mb-5 rounded-card border border-[#243249] bg-[#101827] px-4 py-3 sm:flex sm:items-center sm:justify-between">
      <p className="font-semibold">Требуют проверки: {summary.remaining.toLocaleString("ru-RU")}</p>
      {summary.total > 0 ? (
        <p className="mt-1 text-sm text-[#8FA1B8] sm:mt-0">
          Проверено: {summary.reviewed.toLocaleString("ru-RU")} из {summary.total.toLocaleString("ru-RU")}
        </p>
      ) : null}
    </div>
  );
}

function ReviewItemCard({
  item,
  categories,
  similarCount,
  isPending,
  onConfirm,
  onConfirmGroup,
  onSkip
}: {
  item: AdminReviewItem;
  categories: AdminReviewCategoryOption[];
  similarCount: number;
  isPending: boolean;
  onConfirm: (input: {
    item: AdminReviewItem;
    categoryId: string;
    subcategoryId: string;
    learnRule: boolean;
    identityDecision: IdentityReviewDecision | null;
  }) => void;
  onConfirmGroup: (input: {
    item: AdminReviewItem;
    categoryId: string;
    subcategoryId: string;
    learnRule: boolean;
  }) => void;
  onSkip: () => void;
}) {
  const initialState = createIsolatedReviewFormState(item);
  const [categoryId, setCategoryId] = useState(initialState.categoryId);
  const [subcategoryId, setSubcategoryId] = useState(initialState.subcategoryId);
  const [learnRule, setLearnRule] = useState(initialState.learnRule);
  const [identityDecision, setIdentityDecision] = useState<IdentityReviewDecision | null>(initialState.identityDecision);
  const subcategories = categories.find((category) => category.id === categoryId)?.subcategories ?? [];
  const categoryChanged = categoryId !== initialState.categoryId || subcategoryId !== initialState.subcategoryId;
  const canConfirm = Boolean(categoryId && subcategoryId) && (!item.identityConflict || Boolean(identityDecision));

  const selectCategory = (nextCategoryId: string) => {
    setCategoryId(nextCategoryId);
    const nextSubcategories = categories.find((category) => category.id === nextCategoryId)?.subcategories ?? [];
    if (!nextSubcategories.some((subcategory) => subcategory.id === subcategoryId)) {
      setSubcategoryId("");
    }
  };

  const actionInput = {
    item,
    categoryId,
    subcategoryId,
    learnRule,
    identityDecision
  };

  return (
    <article className="rounded-card border border-[#243249] bg-[#101827] p-5 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div>
          <p className="text-sm text-[#8FA1B8]">Артикул: {item.shopCode}</p>
          <h2 className="mt-2 text-2xl font-semibold leading-snug">{item.name}</h2>
          {item.rawName && item.rawName !== item.name ? (
            <p className="mt-2 text-sm text-[#8FA1B8]">{item.rawName}</p>
          ) : null}
          {item.suggestedCategoryName || item.suggestedSubcategoryName ? (
            <p className="mt-5 text-sm leading-6 text-[#C8D1DF]">
              Система предлагает: <span className="font-medium">{formatTarget(item.suggestedCategoryName, item.suggestedSubcategoryName)}</span>
            </p>
          ) : null}
          <details className="mt-5 rounded-card border border-[#243249] bg-[#0B1220] p-4 text-sm text-[#8FA1B8]">
            <summary className="cursor-pointer font-medium text-[#C8D1DF]">Почему система так решила?</summary>
            <p className="mt-3 leading-6">{item.explanation || "Для этого товара нужна ручная проверка."}</p>
          </details>
        </div>

        <div className="rounded-card border border-[#243249] bg-[#0B1220] p-4">
          <label className="block">
            <span className="text-sm font-medium text-[#C8D1DF]">Категория</span>
            <select value={categoryId} onChange={(event) => selectCategory(event.target.value)} disabled={isPending} className={inputClassName}>
              <option value="">Выберите категорию</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-[#C8D1DF]">Подкатегория</span>
            <select value={subcategoryId} onChange={(event) => setSubcategoryId(event.target.value)} disabled={isPending || !categoryId} className={inputClassName}>
              <option value="">Выберите подкатегорию</option>
              {subcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}
            </select>
          </label>

          {item.identityConflict ? (
            <fieldset className="mt-4 rounded-card border border-[#854D0E] bg-[#2A2113] p-3 text-sm text-[#FDE68A]">
              <legend className="px-1 font-semibold">Проверьте товар с таким артикулом</legend>
              <p className="mt-1">Артикул уже есть в каталоге, но название отличается.</p>
              <label className="mt-3 flex gap-2"><input type="radio" name={`identity-${item.reviewId}`} onChange={() => setIdentityDecision("same")} disabled={isPending} /> Это тот же товар</label>
              <label className="mt-2 flex gap-2"><input type="radio" name={`identity-${item.reviewId}`} onChange={() => setIdentityDecision("new")} disabled={isPending} /> Это новый товар</label>
            </fieldset>
          ) : null}

          <label className="mt-4 flex items-start gap-3 rounded-card border border-[#243249] bg-[#101827] p-3">
            <input type="checkbox" checked={learnRule} onChange={(event) => setLearnRule(event.target.checked)} disabled={isPending} className="mt-1 h-4 w-4 accent-[#73A0F5]" />
            <span>
              <span className="block text-sm font-medium text-[#C8D1DF]">Запомнить это решение для похожих товаров</span>
              <span className="mt-1 block text-xs leading-5 text-[#8FA1B8]">Будет использоваться при следующих загрузках прайса только если это безопасно.</span>
            </span>
          </label>

          {similarCount > 1 ? (
            <p className="mt-4 text-sm font-medium text-[#C8D1DF]">Найдено ещё {similarCount - 1} похожих товаров</p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={isPending || !canConfirm} onClick={() => onConfirm(actionInput)} className={primaryButtonClassName}>
              {isPending ? "Сохраняем…" : categoryChanged ? "Сохранить и подтвердить" : similarCount > 1 ? "Подтвердить только этот" : "Подтвердить"}
            </button>
            {similarCount > 1 ? (
              <button type="button" disabled={isPending || !canConfirm} onClick={() => onConfirmGroup(actionInput)} className={secondaryButtonClassName}>
                Подтвердить все найденные {similarCount}
              </button>
            ) : null}
            <button type="button" disabled={isPending} onClick={onSkip} className={secondaryButtonClassName}>Пропустить</button>
          </div>
        </div>
      </div>
    </article>
  );
}

function focusFeedback(data: AdminReviewPrimaryData): Feedback | null {
  return data.focusItemUnavailable
    ? { tone: "warning", message: "Этот товар уже обработан или больше не требует проверки." }
    : null;
}

function FeedbackNotice({ feedback, onUndo, disabled }: { feedback: Feedback; onUndo: () => void; disabled: boolean }) {
  const className = feedback.tone === "danger"
    ? "border-[#7F1D1D] bg-[#2A1218] text-[#FECACA]"
    : feedback.tone === "warning"
      ? "border-[#854D0E] bg-[#2A2113] text-[#FDE68A]"
      : "border-[#14532D] bg-[#10231A] text-[#BBF7D0]";
  return (
    <div role="status" className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border px-4 py-3 text-sm ${className}`}>
      <span>{feedback.message}</span>
      {feedback.canUndo ? <button type="button" onClick={onUndo} disabled={disabled} className="font-semibold underline underline-offset-4">Отменить</button> : null}
    </div>
  );
}

function ReviewComplete({ canUndo, canPublish, onUndo, undoPending }: { canUndo: boolean; canPublish: boolean; onUndo: () => void; undoPending: boolean }) {
  return (
    <div className="rounded-card border border-[#14532D] bg-[#10231A] p-6">
      <h2 className="text-2xl font-semibold text-[#DCFCE7]">Проверка завершена</h2>
      <p className="mt-2 text-[#BBF7D0]">Все товары обработаны.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {canPublish ? <form action={publishReviewWorkspaceAction}>
          <button type="submit" className={primaryButtonClassName}>Опубликовать изменения на сайте</button>
        </form> : null}
        {canUndo ? <button type="button" onClick={onUndo} disabled={undoPending} className={secondaryButtonClassName}>Отменить последнее действие</button> : null}
      </div>
    </div>
  );
}

function formatTarget(category: string | null, subcategory: string | null) {
  return [category, subcategory].filter(Boolean).join(" → ") || "Не выбрано";
}
