import type { Metadata } from "next";
import {
  AdminNotice,
  AdminPageIntro,
  AdminSubmitButton,
  inputClassName
} from "@/components/admin/content-ui";
import { getAdminRulesPageData } from "@/features/admin/catalog-management";
import { createRuleAction, updateRuleAction } from "./actions";

export const metadata: Metadata = { title: "Правила категоризации" };

type RulesPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

const matchLabels = {
  contains: "Содержит",
  starts_with: "Начинается с",
  exact: "Точное",
  regex: "Regex"
};

export default async function AdminRulesPage({ searchParams }: RulesPageProps) {
  const [params, data] = await Promise.all([searchParams, getAdminRulesPageData()]);

  return (
    <div>
      <AdminPageIntro
        eyebrow="Категоризация"
        title="Правила"
        text="Правила применяются к товарам при импорте. Слишком общие шаблоны не сохраняются."
      />
      {params.saved ? <AdminNotice>Правило сохранено.</AdminNotice> : null}
      {params.error ? <AdminNotice tone="danger">Не удалось сохранить правило. Проверьте шаблон и связку категории.</AdminNotice> : null}

      <form action={createRuleAction} className="rounded-card border border-[#243249] bg-[#101827] p-5">
        <h2 className="text-lg font-semibold">Добавить правило</h2>
        <RuleFields taxonomy={data.taxonomy} />
        <div className="mt-4">
          <AdminSubmitButton>Добавить правило</AdminSubmitButton>
        </div>
      </form>

      <section className="mt-6 space-y-4">
        {data.rules.map((rule) => (
          <form key={rule.id} action={updateRuleAction} className="rounded-card border border-[#243249] bg-[#101827] p-5">
            <input type="hidden" name="ruleId" value={rule.id} />
            {rule.hasConflict ? (
              <AdminNotice tone="warning">Есть конфликт: такой шаблон активен для другой категории или подкатегории.</AdminNotice>
            ) : null}
            <RuleFields taxonomy={data.taxonomy} rule={rule} />
            <div className="mt-4 flex items-center gap-4">
              <AdminSubmitButton>Сохранить</AdminSubmitButton>
              <p className="text-sm text-[#8FA1B8]">
                Сейчас: {rule.categoryName} → {rule.subcategoryName}
              </p>
            </div>
          </form>
        ))}
      </section>
    </div>
  );
}

function RuleFields({
  taxonomy,
  rule
}: {
  taxonomy: Awaited<ReturnType<typeof getAdminRulesPageData>>["taxonomy"];
  rule?: Awaited<ReturnType<typeof getAdminRulesPageData>>["rules"][number];
}) {
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_160px_220px_220px_120px_120px] xl:items-end">
      <label><span className="text-sm text-[#C8D1DF]">Шаблон</span><input name="pattern" defaultValue={rule?.pattern ?? ""} required className={inputClassName} /></label>
      <label><span className="text-sm text-[#C8D1DF]">Тип</span><select name="matchType" defaultValue={rule?.matchType ?? "contains"} className={inputClassName}>{Object.entries(matchLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span className="text-sm text-[#C8D1DF]">Категория</span><select name="categoryId" defaultValue={rule?.categoryId ?? ""} required className={inputClassName}><option value="">Выберите</option>{taxonomy.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label><span className="text-sm text-[#C8D1DF]">Подкатегория</span><select name="subcategoryId" defaultValue={rule?.subcategoryId ?? ""} required className={inputClassName}><option value="">Выберите</option>{taxonomy.map((category) => <optgroup key={category.id} label={category.name}>{category.subcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}</optgroup>)}</select></label>
      <label><span className="text-sm text-[#C8D1DF]">Приоритет</span><input name="priority" type="number" defaultValue={rule?.priority ?? 100} className={inputClassName} /></label>
      <label className="mt-7 flex items-center gap-2 text-sm text-[#C8D1DF]"><input name="isActive" value="1" type="checkbox" defaultChecked={rule?.isActive ?? true} className="h-4 w-4 accent-[#73A0F5]" /> Активно</label>
    </div>
  );
}
