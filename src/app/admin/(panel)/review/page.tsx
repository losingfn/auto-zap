import type { Metadata } from "next";
import { getAdminReviewPageData, type AdminReviewCategoryOption, type AdminReviewItem } from "@/features/admin/review";
import { resolveReviewItemAction } from "./actions";

export const metadata: Metadata = {
  title: "Проверка товаров"
};

type ReviewPageProps = {
  searchParams: Promise<{
    resolved?: string;
    rule?: string;
    ruleSkipped?: string;
    error?: string;
  }>;
};

const numberFormatter = new Intl.NumberFormat("ru-RU");
const priceFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0
});

const versionStatusLabels: Record<string, string> = {
  draft: "Черновик",
  active: "Активная версия"
};

const ruleSkippedLabels: Record<string, string> = {
  no_safe_pattern: "Правило не создано: не удалось подобрать достаточно точный шаблон.",
  too_short: "Правило не создано: шаблон слишком короткий.",
  single_word_too_broad: "Правило не создано: одно слово может быть слишком общим.",
  too_generic: "Правило не создано: шаблон слишком общий.",
  conflicting_rule: "Правило не создано: такой шаблон уже ведёт в другую категорию."
};

export default async function AdminReviewPage({ searchParams }: ReviewPageProps) {
  const [params, data] = await Promise.all([searchParams, getAdminReviewPageData()]);

  return (
    <div>
      <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9DBDFB]">
            Проверка товаров
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Ручная категоризация</h1>
          <p className="mt-3 max-w-2xl text-[#C8D1DF]">
            Исправляйте товары по одному: выберите категорию и подкатегорию, сохраните, и запись
            уйдёт из очереди.
          </p>
        </div>
        <div className="rounded-card border border-[#243249] bg-[#101827] px-5 py-4">
          <p className="text-sm text-[#8FA1B8]">В очереди</p>
          <p className="mt-1 text-3xl font-semibold">{numberFormatter.format(data.queueCount)}</p>
        </div>
      </div>

      {params.resolved ? <Notice>Товар обновлён, запись проверки закрыта.</Notice> : null}
      {params.rule ? <Notice>Правило категоризации создано или уточнено.</Notice> : null}
      {params.ruleSkipped ? (
        <Notice tone="warning">
          {ruleSkippedLabels[params.ruleSkipped] ?? "Правило не создано: шаблон требует проверки."}
        </Notice>
      ) : null}
      {params.error ? (
        <Notice tone="danger">Не удалось сохранить исправление. Проверьте категорию и подкатегорию.</Notice>
      ) : null}

      {data.items.length > 0 ? (
        <div className="space-y-5">
          {data.items.map((item, index) => (
            <ReviewCard
              key={item.reviewId}
              item={item}
              categories={data.categories}
              autoFocus={index === 0}
            />
          ))}
        </div>
      ) : (
        <section className="rounded-card border border-[#243249] bg-[#101827] p-8 text-[#C8D1DF]">
          Очередь проверки пуста.
        </section>
      )}
    </div>
  );
}

function ReviewCard({
  item,
  categories,
  autoFocus
}: {
  item: AdminReviewItem;
  categories: AdminReviewCategoryOption[];
  autoFocus: boolean;
}) {
  const defaultCategoryId = item.suggestedCategoryId ?? item.currentCategoryId ?? "";
  const defaultSubcategoryId = item.suggestedSubcategoryId ?? item.currentSubcategoryId ?? "";

  return (
    <article className="rounded-card border border-[#243249] bg-[#101827] p-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{versionStatusLabels[item.catalogVersionStatus] ?? item.catalogVersionStatus}</Badge>
            <Badge>{item.shopCode}</Badge>
            <Badge>{priceFormatter.format(item.price)}</Badge>
          </div>

          <h2 className="mt-4 text-xl font-semibold leading-snug">{item.name}</h2>
          {item.rawName !== item.name ? (
            <p className="mt-2 text-sm text-[#8FA1B8]">{item.rawName}</p>
          ) : null}

          <div className="mt-5 rounded-card border border-[#243249] bg-[#0B1220] p-4">
            <p className="text-sm font-semibold text-[#C8D1DF]">Причина проверки</p>
            <p className="mt-2 text-sm leading-6 text-[#8FA1B8]">{item.reason}</p>
          </div>

          <div className="mt-4 rounded-card border border-[#243249] bg-[#0B1220] p-4">
            <p className="text-sm font-semibold text-[#C8D1DF]">Предложение системы</p>
            <p className="mt-2 text-sm leading-6 text-[#8FA1B8]">
              {item.suggestedCategoryName || item.suggestedSubcategoryName
                ? [item.suggestedCategoryName, item.suggestedSubcategoryName].filter(Boolean).join(" → ")
                : "Нет уверенного предложения."}
            </p>
          </div>
        </div>

        <form action={resolveReviewItemAction} className="rounded-card border border-[#243249] bg-[#0B1220] p-4">
          <input type="hidden" name="reviewQueueId" value={item.reviewId} />
          <input type="hidden" name="productId" value={item.productId} />

          <label className="block">
            <span className="text-sm font-medium text-[#C8D1DF]">Категория</span>
            <select
              name="categoryId"
              defaultValue={defaultCategoryId}
              required
              autoFocus={autoFocus}
              className="mt-2 h-11 w-full rounded-card border border-[#2E3A4C] bg-[#101827] px-3 text-sm text-white outline-none focus:border-[#73A0F5]"
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
              className="mt-2 h-11 w-full rounded-card border border-[#2E3A4C] bg-[#101827] px-3 text-sm text-white outline-none focus:border-[#73A0F5]"
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
              className="mt-1 h-4 w-4 accent-[#73A0F5]"
            />
            <span>
              <span className="block text-sm font-medium text-[#C8D1DF]">
                Создать правило для похожих товаров
              </span>
              <span className="mt-1 block text-xs leading-5 text-[#8FA1B8]">
                Слишком короткие и общие шаблоны будут пропущены.
              </span>
            </span>
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-[#C8D1DF]">Шаблон правила</span>
            <input
              name="rulePattern"
              defaultValue={item.rulePattern ?? ""}
              placeholder="например: фильтр воздушный"
              className="mt-2 h-11 w-full rounded-card border border-[#2E3A4C] bg-[#101827] px-3 text-sm text-white outline-none placeholder:text-[#66758A] focus:border-[#73A0F5]"
            />
          </label>

          <button
            type="submit"
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB]"
          >
            Сохранить и закрыть
          </button>
        </form>
      </div>
    </article>
  );
}

function Notice({
  children,
  tone = "success"
}: {
  children: React.ReactNode;
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-8 items-center rounded-card border border-[#4169A8] px-3 text-xs font-semibold text-[#C8D1DF]">
      {children}
    </span>
  );
}
