"use client";

import { useEffect, useState } from "react";
import type { AdminReviewActionFilters, AdminReviewCategoryOption, AdminReviewGroup } from "@/features/admin/review";
import {
  applyReviewGroupAction,
  applySelectedReviewItemsAction,
  reapplyReviewRulesAction
} from "./actions";

type ReviewControlsProps = {
  categories: AdminReviewCategoryOption[];
  filters: AdminReviewActionFilters;
};

const inputClassName =
  "mt-2 h-11 w-full rounded-card border border-[#2E3A4C] bg-[#0B1220] px-3 text-sm text-white outline-none placeholder:text-[#66758A] focus:border-[#73A0F5]";

export function ReviewGroupActionForm({
  categories,
  filters,
  group
}: ReviewControlsProps & {
  group: AdminReviewGroup;
}) {
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

        if (!category || !subcategory) {
          event.preventDefault();
          window.alert("Выберите категорию и подкатегорию.");
          return;
        }

        const lines = [
          "Вы собираетесь назначить:",
          `Категория: ${category}`,
          `Подкатегория: ${subcategory}`,
          `Количество товаров: ${group.count}`,
          "",
          `Это действие применится к ${group.count} товарам из текущей очереди проверки.`
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

      <div className="grid gap-4 lg:grid-cols-2">
        <label>
          <span className="text-sm font-medium text-[#C8D1DF]">Категория</span>
          <CategorySelect categories={categories} name="categoryId" />
        </label>
        <label>
          <span className="text-sm font-medium text-[#C8D1DF]">Подкатегория</span>
          <SubcategorySelect categories={categories} name="subcategoryId" />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-medium text-[#C8D1DF]">Шаблон правила</span>
        <input
          name="rulePattern"
          defaultValue={group.rulePattern ?? ""}
          placeholder="например: болт"
          className={inputClassName}
        />
      </label>

      <div className="mt-4 rounded-card border border-[#243249] bg-[#0B1220] p-4 text-sm text-[#C8D1DF]">
        <p>Будет применено к товарам в группе: {group.count}.</p>
        <p className="mt-2 text-[#8FA1B8]">
          Правило будет применяться в будущих импортах. Каталог не публикуется автоматически.
        </p>
        {group.ruleWarning ? <p className="mt-2 text-[#FDE68A]">{group.ruleWarning}</p> : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="submit"
          name="learnRule"
          value="0"
          className="inline-flex h-11 items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB]"
        >
          Применить к группе
        </button>
        <button
          type="submit"
          name="learnRule"
          value="1"
          className="inline-flex h-11 items-center justify-center rounded-card border border-[#4169A8] px-5 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740]"
        >
          Применить и создать правило
        </button>
      </div>
    </form>
  );
}

export function ReviewBulkSelectionForm({ categories, filters }: ReviewControlsProps) {
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setSelectedCount(document.querySelectorAll<HTMLInputElement>("input[data-review-select]:checked").length);
    };

    refresh();
    document.addEventListener("change", refresh);
    return () => document.removeEventListener("change", refresh);
  }, []);

  const setAllOnPage = (checked: boolean) => {
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

        const lines = [
          "Вы собираетесь назначить:",
          `Категория: ${category}`,
          `Подкатегория: ${subcategory}`,
          `Количество товаров: ${selectedCount}`,
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
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setAllOnPage(true)}
          className="inline-flex h-10 items-center justify-center rounded-card border border-[#4169A8] px-4 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740]"
        >
          Выбрать все на странице
        </button>
        <button
          type="button"
          onClick={() => setAllOnPage(false)}
          className="inline-flex h-10 items-center justify-center rounded-card border border-[#4169A8] px-4 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740]"
        >
          Снять выделение
        </button>
        <span className="text-sm text-[#8FA1B8]">Выбрано: {selectedCount}</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label>
          <span className="text-sm font-medium text-[#C8D1DF]">Категория</span>
          <CategorySelect categories={categories} name="categoryId" />
        </label>
        <label>
          <span className="text-sm font-medium text-[#C8D1DF]">Подкатегория</span>
          <SubcategorySelect categories={categories} name="subcategoryId" />
        </label>
      </div>

      <label className="mt-4 flex items-start gap-3 rounded-card border border-[#243249] bg-[#0B1220] p-3">
        <input type="checkbox" name="learnRule" value="1" className="mt-1 h-4 w-4 accent-[#73A0F5]" />
        <span>
          <span className="block text-sm font-medium text-[#C8D1DF]">Создать правило</span>
          <span className="mt-1 block text-xs leading-5 text-[#8FA1B8]">
            Используйте только точный шаблон для выбранных товаров.
          </span>
        </span>
      </label>

      <label className="mt-4 block">
        <span className="text-sm font-medium text-[#C8D1DF]">Шаблон правила</span>
        <input name="rulePattern" placeholder="например: фильтр воздушный" className={inputClassName} />
      </label>

      <button
        type="submit"
        disabled={selectedCount === 0}
        className="mt-5 inline-flex h-11 items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB] disabled:cursor-not-allowed disabled:bg-[#31415F] disabled:text-[#8FA1B8]"
      >
        Применить категорию к выбранным
      </button>
    </form>
  );
}

export function ReviewReapplyRulesForm({
  filters,
  count
}: {
  filters: AdminReviewActionFilters;
  count: number;
}) {
  return (
    <form
      action={reapplyReviewRulesAction}
      onSubmit={(event) => {
        if (!window.confirm(`Повторно применить правила к ${count} открытым товарам текущего фильтра? Каталог не будет опубликован.`)) {
          event.preventDefault();
        }
      }}
    >
      <HiddenReviewFilters filters={filters} />
      <button
        type="submit"
        className="inline-flex h-11 items-center justify-center rounded-card border border-[#4169A8] px-5 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740]"
      >
        Применить правила к очереди
      </button>
    </form>
  );
}

function CategorySelect({
  categories,
  name,
  defaultValue = ""
}: {
  categories: AdminReviewCategoryOption[];
  name: string;
  defaultValue?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue} required className={inputClassName}>
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
  defaultValue = ""
}: {
  categories: AdminReviewCategoryOption[];
  name: string;
  defaultValue?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue} required className={inputClassName}>
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
