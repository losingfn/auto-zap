"use client";

import { useEffect, useState } from "react";
import type { AdminReviewActionFilters, AdminReviewCategoryOption, AdminReviewGroup } from "@/features/admin/review";
import {
  applyReviewGroupAction,
  applySelectedReviewItemsAction
} from "./actions";

type ReviewControlsProps = {
  categories: AdminReviewCategoryOption[];
  filters: AdminReviewActionFilters;
};

const inputClassName =
  "mt-2 h-11 w-full rounded-card border border-[#2E3A4C] bg-[#0B1220] px-3 text-sm text-white outline-none placeholder:text-[#66758A] focus:border-[#73A0F5]";
const disabledInputClassName =
  "mt-2 h-11 w-full cursor-not-allowed rounded-card border border-[#243249] bg-[#101827] px-3 text-sm text-[#536174] outline-none";
const primaryButtonClassName =
  "inline-flex h-11 items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB] disabled:cursor-not-allowed disabled:bg-[#31415F] disabled:text-[#8FA1B8]";
const secondaryButtonClassName =
  "inline-flex h-11 items-center justify-center rounded-card border border-[#4169A8] px-5 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740] disabled:cursor-not-allowed disabled:border-[#243249] disabled:bg-transparent disabled:text-[#536174]";
const smallSecondaryButtonClassName =
  "inline-flex h-10 items-center justify-center rounded-card border border-[#4169A8] px-4 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740] disabled:cursor-not-allowed disabled:border-[#243249] disabled:bg-transparent disabled:text-[#536174]";
const DRAFT_ONLY_MESSAGE =
  "Массовые действия доступны только в рабочей сессии. Это защищает активный каталог от случайных изменений.";
const NO_UNDO_MESSAGE =
  "Последнее неопубликованное действие можно отменить до финальной публикации.";
const LARGE_ACTION_THRESHOLD = 100;
const DANGEROUS_RULE_WORDS = new Set([
  "болт",
  "гайка",
  "шайба",
  "кольцо",
  "комплект",
  "кронштейн",
  "трубка",
  "втулка",
  "палец",
  "ремкомплект",
  "корпус",
  "крышка",
  "датчик",
  "клапан",
  "подшипник",
  "сальник",
  "передний",
  "задний",
  "левый",
  "правый",
  "универсальный",
  "новый",
  "старый",
  "большой",
  "малый"
]);

export function ReviewGroupActionForm({
  categories,
  filters,
  group
}: ReviewControlsProps & {
  group: AdminReviewGroup;
}) {
  const bulkDisabled = filters.scope !== "workspace";
  const impactCount = group.impactedProductCount;
  const requiresTypedConfirmation = impactCount > LARGE_ACTION_THRESHOLD;
  const [confirmationCount, setConfirmationCount] = useState("");
  const [categoryLabel, setCategoryLabel] = useState("");
  const [subcategoryLabel, setSubcategoryLabel] = useState("");
  const [rulePattern, setRulePattern] = useState(group.rulePattern ?? "");
  const countConfirmed = !requiresTypedConfirmation || confirmationCount.trim() === String(impactCount);
  const actionDisabled = bulkDisabled || !countConfirmed || impactCount === 0 || !group.suggestedCategoryId || !group.suggestedSubcategoryId;

  return (
    <form
      action={applyReviewGroupAction}
      onSubmit={(event) => {
        const form = event.currentTarget;
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const category = selectedOptionLabel(form, "categoryId");
        const subcategory = selectedOptionLabel(form, "subcategoryId");
        const rulePattern = formValue(form, "rulePattern");
        const learnRule = submitter?.value === "1";

        if (bulkDisabled) {
          event.preventDefault();
          window.alert(DRAFT_ONLY_MESSAGE);
          return;
        }

        if (requiresTypedConfirmation && !countConfirmed) {
          event.preventDefault();
          window.alert(`Для подтверждения введите: ${impactCount}`);
          return;
        }

        if (!category || !subcategory) {
          event.preventDefault();
          window.alert("Выберите категорию и подкатегорию.");
          return;
        }

        if (learnRule && isDangerousRulePattern(rulePattern || group.rulePattern || group.key)) {
          event.preventDefault();
          window.alert("Правило не создано: шаблон слишком широкий или опасный. Массовое действие не выполнено.");
          return;
        }

        const lines = [
          "Вы собираетесь назначить:",
          "Scope: Рабочая сессия проверки",
          `Категория: ${category}`,
          `Подкатегория: ${subcategory}`,
          `Количество товаров: ${impactCount}`,
          `Создаётся правило: ${learnRule ? "да" : "нет"}`,
          "",
          NO_UNDO_MESSAGE,
          "",
          `Это действие применится к ${impactCount} безопасным товарам из preview.`
        ];

        if (learnRule) {
          lines.push("", `Будет создано правило: если название содержит «${rulePattern || group.rulePattern || group.key}».`);
        }

        if (!window.confirm(lines.join("\n"))) {
          event.preventDefault();
        }
      }}
      className="rounded-card border border-[#243249] bg-[#101827] p-5"
    >
      <HiddenReviewFilters filters={filters} />
      <input type="hidden" name="group" value={group.key} />
      <input type="hidden" name="confirmationCount" value={confirmationCount} />
      <input type="hidden" name="expectedCount" value={impactCount} />
      <input type="hidden" name="previewToken" value={group.previewToken} />

      <div className="grid gap-4 lg:grid-cols-2">
        <label>
          <span className="text-sm font-medium text-[#C8D1DF]">Категория</span>
          <CategorySelect
            categories={categories}
            name="categoryId"
            defaultValue={group.suggestedCategoryId ?? ""}
            disabled={bulkDisabled}
            onSelectionLabelChange={setCategoryLabel}
          />
        </label>
        <label>
          <span className="text-sm font-medium text-[#C8D1DF]">Подкатегория</span>
          <SubcategorySelect
            categories={categories}
            name="subcategoryId"
            defaultValue={group.suggestedSubcategoryId ?? ""}
            disabled={bulkDisabled}
            onSelectionLabelChange={setSubcategoryLabel}
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-medium text-[#C8D1DF]">Шаблон правила</span>
        <input
          name="rulePattern"
          defaultValue={group.rulePattern ?? ""}
          placeholder="например: болт"
          disabled={bulkDisabled}
          onChange={(event) => setRulePattern(event.currentTarget.value)}
          className={bulkDisabled ? disabledInputClassName : inputClassName}
        />
      </label>

      <div className="mt-4 rounded-card border border-[#243249] bg-[#0B1220] p-4 text-sm text-[#C8D1DF]">
        <p className="font-semibold">Preview перед массовым действием</p>
        <dl className="mt-3 grid gap-2 text-sm">
          <PreviewRow label="Scope" value="Рабочая сессия проверки" />
          <PreviewRow label="Количество товаров" value={String(impactCount)} />
          <PreviewRow label="Категория" value={categoryLabel || "Не выбрана"} />
          <PreviewRow label="Подкатегория" value={subcategoryLabel || "Не выбрана"} />
          <PreviewRow
            label="Создаётся правило"
            value={`Только при выборе «Применить и создать правило»${rulePattern ? `: название содержит «${rulePattern}»` : ""}`}
          />
        </dl>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8FA1B8]">Примеры</p>
          <ul className="mt-2 space-y-1 text-[#C8D1DF]">
            {group.examples.slice(0, 10).map((example) => (
              <li key={example} className="truncate">
                {example}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-2 text-[#8FA1B8]">
          Каталог не меняется до финальной публикации рабочей сессии.
        </p>
        <p className="mt-2 text-[#FDE68A]">{NO_UNDO_MESSAGE}</p>
        {bulkDisabled ? <p className="mt-2 text-[#FDE68A]">{DRAFT_ONLY_MESSAGE}</p> : null}
        {group.ruleWarning ? <p className="mt-2 text-[#FDE68A]">{group.ruleWarning}</p> : null}
        {isDangerousRulePattern(rulePattern) ? (
          <p className="mt-2 text-[#FCA5A5]">
            Такой шаблон правила слишком широкий. Уточните условие перед созданием правила.
          </p>
        ) : null}
      </div>

      {requiresTypedConfirmation ? (
        <TypedCountConfirmation
          count={impactCount}
          value={confirmationCount}
          disabled={bulkDisabled}
          onChange={setConfirmationCount}
        />
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="submit"
          name="learnRule"
          value="0"
          disabled={actionDisabled}
          className={primaryButtonClassName}
        >
          Применить к группе
        </button>
        <button
          type="submit"
          name="learnRule"
          value="1"
          disabled={actionDisabled || isDangerousRulePattern(rulePattern)}
          className={secondaryButtonClassName}
        >
          Применить и создать правило
        </button>
      </div>
    </form>
  );
}

export function ReviewBulkSelectionForm({ categories, filters }: ReviewControlsProps) {
  const [selectedCount, setSelectedCount] = useState(0);
  const [confirmationCount, setConfirmationCount] = useState("");
  const [rulePattern, setRulePattern] = useState("");
  const bulkDisabled = filters.scope !== "workspace";
  const requiresTypedConfirmation = selectedCount > LARGE_ACTION_THRESHOLD;
  const countConfirmed = !requiresTypedConfirmation || confirmationCount.trim() === String(selectedCount);

  useEffect(() => {
    const refresh = () => {
      setSelectedCount(document.querySelectorAll<HTMLInputElement>("input[data-review-select]:checked").length);
    };

    refresh();
    document.addEventListener("change", refresh);
    return () => document.removeEventListener("change", refresh);
  }, []);

  const setAllOnPage = (checked: boolean) => {
    if (bulkDisabled) {
      return;
    }

    for (const checkbox of document.querySelectorAll<HTMLInputElement>("input[data-review-select]")) {
      checkbox.checked = checked;
    }
    setSelectedCount(checked ? document.querySelectorAll<HTMLInputElement>("input[data-review-select]").length : 0);
  };

  return (
    <form
      id="review-selected-form"
      action={applySelectedReviewItemsAction}
      onSubmit={(event) => {
        const form = event.currentTarget;
        const category = selectedOptionLabel(form, "categoryId");
        const subcategory = selectedOptionLabel(form, "subcategoryId");
        const learnRule = form.elements.namedItem("learnRule") instanceof HTMLInputElement
          ? (form.elements.namedItem("learnRule") as HTMLInputElement).checked
          : false;

        if (bulkDisabled) {
          event.preventDefault();
          window.alert(DRAFT_ONLY_MESSAGE);
          return;
        }

        if (selectedCount === 0) {
          event.preventDefault();
          window.alert("Выберите товары на странице.");
          return;
        }

        if (!category || !subcategory) {
          event.preventDefault();
          window.alert("Выберите категорию и подкатегорию.");
          return;
        }

        if (requiresTypedConfirmation && !countConfirmed) {
          event.preventDefault();
          window.alert(`Для подтверждения введите: ${selectedCount}`);
          return;
        }

        if (learnRule && isDangerousRulePattern(rulePattern)) {
          event.preventDefault();
          window.alert("Правило не создано: шаблон слишком широкий или опасный. Массовое действие не выполнено.");
          return;
        }

        const lines = [
          "Вы собираетесь назначить:",
          "Scope: Рабочая сессия проверки",
          `Категория: ${category}`,
          `Подкатегория: ${subcategory}`,
          `Количество товаров: ${selectedCount}`,
          "",
          NO_UNDO_MESSAGE,
          "",
          `Это действие применится к выбранным ${selectedCount} товарам из текущей страницы.`
        ];

        if (!window.confirm(lines.join("\n"))) {
          event.preventDefault();
        }
      }}
      className="rounded-card border border-[#243249] bg-[#101827] p-5"
    >
      <HiddenReviewFilters filters={filters} />
      <input type="hidden" name="confirmationCount" value={confirmationCount} />
      <input type="hidden" name="expectedCount" value={selectedCount} />
      {bulkDisabled ? <DisabledBulkNotice /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setAllOnPage(true)}
          disabled={bulkDisabled}
          className={smallSecondaryButtonClassName}
        >
          Выбрать все на странице
        </button>
        <button
          type="button"
          onClick={() => setAllOnPage(false)}
          disabled={bulkDisabled}
          className={smallSecondaryButtonClassName}
        >
          Снять выделение
        </button>
        <span className="text-sm text-[#8FA1B8]">Выбрано: {selectedCount}</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label>
          <span className="text-sm font-medium text-[#C8D1DF]">Категория</span>
          <CategorySelect categories={categories} name="categoryId" disabled={bulkDisabled} />
        </label>
        <label>
          <span className="text-sm font-medium text-[#C8D1DF]">Подкатегория</span>
          <SubcategorySelect categories={categories} name="subcategoryId" disabled={bulkDisabled} />
        </label>
      </div>

      <label className="mt-4 flex items-start gap-3 rounded-card border border-[#243249] bg-[#0B1220] p-3">
        <input
          type="checkbox"
          name="learnRule"
          value="1"
          disabled={bulkDisabled}
          className="mt-1 h-4 w-4 accent-[#73A0F5] disabled:cursor-not-allowed"
        />
        <span>
          <span className="block text-sm font-medium text-[#C8D1DF]">Создать правило</span>
          <span className="mt-1 block text-xs leading-5 text-[#8FA1B8]">
            Используйте только точный шаблон для выбранных товаров.
          </span>
        </span>
      </label>

      <label className="mt-4 block">
        <span className="text-sm font-medium text-[#C8D1DF]">Шаблон правила</span>
        <input
          name="rulePattern"
          placeholder="например: фильтр воздушный"
          disabled={bulkDisabled}
          onChange={(event) => setRulePattern(event.currentTarget.value)}
          className={bulkDisabled ? disabledInputClassName : inputClassName}
        />
      </label>
      {isDangerousRulePattern(rulePattern) ? (
        <p className="mt-2 text-sm text-[#FCA5A5]">
          Такой шаблон правила слишком широкий. Уточните условие перед созданием правила.
        </p>
      ) : null}

      <p className="mt-4 text-sm text-[#FDE68A]">{NO_UNDO_MESSAGE}</p>

      {requiresTypedConfirmation ? (
        <TypedCountConfirmation
          count={selectedCount}
          value={confirmationCount}
          disabled={bulkDisabled}
          onChange={setConfirmationCount}
        />
      ) : null}

      <button
        type="submit"
        disabled={bulkDisabled || selectedCount === 0 || !countConfirmed}
        className={`mt-5 ${primaryButtonClassName}`}
      >
        Применить категорию к выбранным
      </button>
    </form>
  );
}

function CategorySelect({
  categories,
  name,
  defaultValue = "",
  disabled = false,
  onSelectionLabelChange
}: {
  categories: AdminReviewCategoryOption[];
  name: string;
  defaultValue?: string;
  disabled?: boolean;
  onSelectionLabelChange?: (label: string) => void;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      required
      disabled={disabled}
      onChange={(event) => onSelectionLabelChange?.(event.currentTarget.selectedOptions[0]?.textContent?.trim() ?? "")}
      className={disabled ? disabledInputClassName : inputClassName}
    >
      <option value="">Выберите категорию</option>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </select>
  );
}

function SubcategorySelect({
  categories,
  name,
  defaultValue = "",
  disabled = false,
  onSelectionLabelChange
}: {
  categories: AdminReviewCategoryOption[];
  name: string;
  defaultValue?: string;
  disabled?: boolean;
  onSelectionLabelChange?: (label: string) => void;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      required
      disabled={disabled}
      onChange={(event) => onSelectionLabelChange?.(event.currentTarget.selectedOptions[0]?.textContent?.trim() ?? "")}
      className={disabled ? disabledInputClassName : inputClassName}
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
  );
}

function TypedCountConfirmation({
  count,
  value,
  disabled,
  onChange,
  compact = false
}: {
  count: number;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <label className={`${compact ? "mb-3" : "mt-4"} block rounded-card border border-[#854D0E] bg-[#2A2113] p-4`}>
      <span className="block text-sm font-semibold text-[#FDE68A]">Для подтверждения введите: {count}</span>
      <input
        value={value}
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value.replace(/\D/g, ""))}
        className={disabled ? disabledInputClassName : inputClassName}
      />
    </label>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[170px_1fr]">
      <dt className="text-[#8FA1B8]">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DisabledBulkNotice({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`${compact ? "mb-3" : "mb-4"} rounded-card border border-[#854D0E] bg-[#2A2113] px-4 py-3 text-sm text-[#FDE68A]`}>
      {DRAFT_ONLY_MESSAGE}
    </p>
  );
}

function isDangerousRulePattern(pattern: string) {
  const normalized = pattern.trim().toLowerCase().replace(/ё/g, "е");
  return DANGEROUS_RULE_WORDS.has(normalized);
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

function selectedOptionLabel(form: HTMLFormElement, name: string) {
  const select = form.elements.namedItem(name);
  if (!(select instanceof HTMLSelectElement)) {
    return "";
  }
  return select.selectedOptions[0]?.textContent?.trim() ?? "";
}

function formValue(form: HTMLFormElement, name: string) {
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
    return field.value.trim();
  }
  return "";
}
