import type { Metadata } from "next";
import {
  AdminNotice,
  AdminPageIntro,
  AdminSubmitButton,
  inputClassName
} from "@/components/admin/content-ui";
import { getAdminCategoriesPageData } from "@/features/admin/catalog-management";
import { createCategoryAction, updateCategoryAction } from "./actions";

export const metadata: Metadata = { title: "Категории" };

type CategoriesPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function AdminCategoriesPage({ searchParams }: CategoriesPageProps) {
  const [params, categories] = await Promise.all([searchParams, getAdminCategoriesPageData()]);

  return (
    <div>
      <AdminPageIntro
        eyebrow="Таксономия"
        title="Категории"
        text="Категория всегда находится между главной и подкатегориями. Отключение категории с товарами заблокировано."
      />
      {params.saved ? <AdminNotice>Категории сохранены.</AdminNotice> : null}
      {params.error ? <AdminNotice tone="danger">Не удалось сохранить категорию. Возможно, в ней есть товары.</AdminNotice> : null}

      <form action={createCategoryAction} className="rounded-card border border-[#243249] bg-[#101827] p-5">
        <h2 className="text-lg font-semibold">Добавить категорию</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_120px_120px_auto] lg:items-end">
          <label><span className="text-sm text-[#C8D1DF]">Название</span><input name="name" required className={inputClassName} /></label>
          <label><span className="text-sm text-[#C8D1DF]">Slug</span><input name="slug" className={inputClassName} /></label>
          <label><span className="text-sm text-[#C8D1DF]">Порядок</span><input name="sortOrder" type="number" defaultValue={100} className={inputClassName} /></label>
          <label className="mt-7 flex items-center gap-2 text-sm text-[#C8D1DF]"><input name="isActive" value="1" type="checkbox" defaultChecked className="h-4 w-4 accent-[#73A0F5]" /> Активна</label>
          <AdminSubmitButton>Добавить</AdminSubmitButton>
        </div>
      </form>

      <section className="mt-6 space-y-4">
        {categories.map((category) => (
          <form key={category.id} action={updateCategoryAction} className="rounded-card border border-[#243249] bg-[#101827] p-5">
            <input type="hidden" name="categoryId" value={category.id} />
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_120px_140px_150px_auto] lg:items-end">
              <label><span className="text-sm text-[#C8D1DF]">Название</span><input name="name" defaultValue={category.name} required className={inputClassName} /></label>
              <label><span className="text-sm text-[#C8D1DF]">Slug</span><input name="slug" defaultValue={category.slug} required className={inputClassName} /></label>
              <label><span className="text-sm text-[#C8D1DF]">Порядок</span><input name="sortOrder" type="number" defaultValue={category.sortOrder} className={inputClassName} /></label>
              <p className="text-sm text-[#8FA1B8]">{category.productCount} товаров</p>
              <label className="flex items-center gap-2 text-sm text-[#C8D1DF]">
                <input name="isActive" value="1" type="checkbox" defaultChecked={category.isActive} className="h-4 w-4 accent-[#73A0F5]" />
                Активна
              </label>
              <AdminSubmitButton>Сохранить</AdminSubmitButton>
            </div>
          </form>
        ))}
      </section>
    </div>
  );
}
