import type { Metadata } from "next";
import {
  AdminNotice,
  AdminPageIntro,
  AdminSubmitButton,
  inputClassName
} from "@/components/admin/content-ui";
import { getAdminSubcategoriesPageData } from "@/features/admin/catalog-management";
import { createSubcategoryAction, updateSubcategoryAction } from "./actions";

export const metadata: Metadata = { title: "Подкатегории" };

type SubcategoriesPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function AdminSubcategoriesPage({ searchParams }: SubcategoriesPageProps) {
  const [params, data] = await Promise.all([searchParams, getAdminSubcategoriesPageData()]);

  return (
    <div>
      <AdminPageIntro
        eyebrow="Таксономия"
        title="Подкатегории"
        text="Товары всегда привязаны к подкатегории внутри выбранной категории."
      />
      {params.saved ? <AdminNotice>Подкатегории сохранены.</AdminNotice> : null}
      {params.error ? <AdminNotice tone="danger">Не удалось сохранить подкатегорию. Возможно, в ней есть товары.</AdminNotice> : null}

      <form action={createSubcategoryAction} className="rounded-card border border-[#243249] bg-[#101827] p-5">
        <h2 className="text-lg font-semibold">Добавить подкатегорию</h2>
        <div className="mt-4 grid gap-4 xl:grid-cols-[220px_1fr_1fr_120px_120px_auto] xl:items-end">
          <label><span className="text-sm text-[#C8D1DF]">Категория</span><select name="categoryId" required className={inputClassName}>{data.taxonomy.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label><span className="text-sm text-[#C8D1DF]">Название</span><input name="name" required className={inputClassName} /></label>
          <label><span className="text-sm text-[#C8D1DF]">Slug</span><input name="slug" className={inputClassName} /></label>
          <label><span className="text-sm text-[#C8D1DF]">Порядок</span><input name="sortOrder" type="number" defaultValue={100} className={inputClassName} /></label>
          <label className="mt-7 flex items-center gap-2 text-sm text-[#C8D1DF]"><input name="isActive" value="1" type="checkbox" defaultChecked className="h-4 w-4 accent-[#73A0F5]" /> Активна</label>
          <AdminSubmitButton>Добавить</AdminSubmitButton>
        </div>
      </form>

      <section className="mt-6 space-y-4">
        {data.subcategories.map((subcategory) => (
          <form key={subcategory.id} action={updateSubcategoryAction} className="rounded-card border border-[#243249] bg-[#101827] p-5">
            <input type="hidden" name="subcategoryId" value={subcategory.id} />
            <div className="grid gap-4 xl:grid-cols-[220px_1fr_1fr_120px_120px_140px_auto] xl:items-end">
              <label><span className="text-sm text-[#C8D1DF]">Категория</span><select name="categoryId" defaultValue={subcategory.categoryId} required className={inputClassName}>{data.taxonomy.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label><span className="text-sm text-[#C8D1DF]">Название</span><input name="name" defaultValue={subcategory.name} required className={inputClassName} /></label>
              <label><span className="text-sm text-[#C8D1DF]">Slug</span><input name="slug" defaultValue={subcategory.slug} required className={inputClassName} /></label>
              <label><span className="text-sm text-[#C8D1DF]">Порядок</span><input name="sortOrder" type="number" defaultValue={subcategory.sortOrder} className={inputClassName} /></label>
              <p className="text-sm text-[#8FA1B8]">{subcategory.productCount} товаров</p>
              <label className="flex items-center gap-2 text-sm text-[#C8D1DF]"><input name="isActive" value="1" type="checkbox" defaultChecked={subcategory.isActive} className="h-4 w-4 accent-[#73A0F5]" /> Активна</label>
              <AdminSubmitButton>Сохранить</AdminSubmitButton>
            </div>
          </form>
        ))}
      </section>
    </div>
  );
}
