import type { Metadata } from "next";
import {
  AdminNotice,
  AdminPageIntro,
  AdminSubmitButton,
  inputClassName
} from "@/components/admin/content-ui";
import {
  getAdminCatalogPageData,
  type ProductStatusFilter
} from "@/features/admin/catalog-management";
import { updateProductCategoryAction } from "./actions";

export const metadata: Metadata = {
  title: "Каталог"
};

type CatalogPageProps = {
  searchParams: Promise<{
    q?: string;
    categoryId?: string;
    subcategoryId?: string;
    status?: ProductStatusFilter;
    saved?: string;
    error?: string;
  }>;
};

const priceFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0
});

const statusLabels: Record<string, string> = {
  active: "Активен",
  archived: "Архив",
  needs_review: "Проверка",
  invalid: "Ошибка"
};

export default async function AdminCatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const data = await getAdminCatalogPageData({
    query: params.q,
    categoryId: params.categoryId,
    subcategoryId: params.subcategoryId,
    status: params.status ?? "all"
  });

  return (
    <div>
      <AdminPageIntro
        eyebrow="Каталог"
        title="Товары"
        text="Поиск и точечное исправление категории или подкатегории товара."
      />
      {params.saved ? <AdminNotice>Товар обновлён.</AdminNotice> : null}
      {params.error ? <AdminNotice tone="danger">Не удалось обновить товар.</AdminNotice> : null}

      <form className="rounded-card border border-[#243249] bg-[#101827] p-5" action="/admin/catalog">
        <div className="grid gap-4 lg:grid-cols-[1fr_220px_220px_180px_auto] lg:items-end">
          <label>
            <span className="text-sm font-medium text-[#C8D1DF]">Поиск</span>
            <input name="q" defaultValue={params.q ?? ""} placeholder="Название или код" className={inputClassName} />
          </label>
          <label>
            <span className="text-sm font-medium text-[#C8D1DF]">Категория</span>
            <select name="categoryId" defaultValue={params.categoryId ?? ""} className={inputClassName}>
              <option value="">Все</option>
              {data.taxonomy.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-[#C8D1DF]">Подкатегория</span>
            <select name="subcategoryId" defaultValue={params.subcategoryId ?? ""} className={inputClassName}>
              <option value="">Все</option>
              {data.taxonomy.map((category) => (
                <optgroup key={category.id} label={category.name}>
                  {category.subcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-[#C8D1DF]">Статус</span>
            <select name="status" defaultValue={params.status ?? "all"} className={inputClassName}>
              <option value="all">Все</option>
              <option value="active">Активен</option>
              <option value="needs_review">Проверка</option>
              <option value="archived">Архив</option>
              <option value="invalid">Ошибка</option>
            </select>
          </label>
          <AdminSubmitButton>Найти</AdminSubmitButton>
        </div>
      </form>

      <section className="mt-6 rounded-card border border-[#243249] bg-[#101827]">
        <div className="border-b border-[#243249] px-5 py-4">
          <h2 className="text-lg font-semibold">Найденные товары</h2>
        </div>
        <div className="divide-y divide-[#243249]">
          {data.products.map((product) => (
            <article key={product.id} className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_440px] xl:items-center">
              <div>
                <div className="flex flex-wrap gap-2 text-xs text-[#8FA1B8]">
                  <span>{product.shopCode}</span>
                  <span>{priceFormatter.format(product.price)}</span>
                  <span>{statusLabels[product.status] ?? product.status}</span>
                </div>
                <h3 className="mt-2 font-semibold">{product.name}</h3>
                <p className="mt-1 text-sm text-[#8FA1B8]">
                  {product.categoryName ?? "Без категории"} → {product.subcategoryName ?? "Без подкатегории"}
                </p>
              </div>
              <form action={updateProductCategoryAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <input type="hidden" name="productId" value={product.id} />
                <select name="categoryId" defaultValue={product.categoryId ?? ""} required className={inputClassName}>
                  <option value="">Категория</option>
                  {data.taxonomy.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
                <select name="subcategoryId" defaultValue={product.subcategoryId ?? ""} required className={inputClassName}>
                  <option value="">Подкатегория</option>
                  {data.taxonomy.map((category) => (
                    <optgroup key={category.id} label={category.name}>
                      {category.subcategories.map((subcategory) => (
                        <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <AdminSubmitButton>Сохранить</AdminSubmitButton>
              </form>
            </article>
          ))}
          {data.products.length === 0 ? (
            <p className="px-5 py-8 text-[#C8D1DF]">Товары не найдены.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
