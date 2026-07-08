import type { Metadata } from "next";
import {
  AdminNotice,
  AdminPageIntro,
  AdminSubmitButton,
  inputClassName,
  textareaClassName
} from "@/components/admin/content-ui";
import { getAdminSynonymsPageData } from "@/features/admin/catalog-management";
import { createSynonymAction, deleteSynonymAction, updateSynonymAction } from "./actions";

export const metadata: Metadata = { title: "Синонимы поиска" };

type SynonymsPageProps = {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
};

export default async function AdminSynonymsPage({ searchParams }: SynonymsPageProps) {
  const [params, synonyms] = await Promise.all([searchParams, getAdminSynonymsPageData()]);

  return (
    <div>
      <AdminPageIntro
        eyebrow="Поиск"
        title="Синонимы"
        text="Синонимы помогают поиску находить товар по бытовым словам, латинице и сокращениям."
      />
      {params.saved ? <AdminNotice>Синонимы сохранены. Поисковый индекс пересобран или помечен в журнале.</AdminNotice> : null}
      {params.deleted ? <AdminNotice>Синоним удалён. Поиск обновлён или помечен в журнале.</AdminNotice> : null}
      {params.error ? <AdminNotice tone="danger">Не удалось сохранить синоним.</AdminNotice> : null}

      <form action={createSynonymAction} className="rounded-card border border-[#243249] bg-[#101827] p-5">
        <h2 className="text-lg font-semibold">Добавить синоним</h2>
        <SynonymFields />
        <div className="mt-4">
          <AdminSubmitButton>Добавить</AdminSubmitButton>
        </div>
      </form>

      <section className="mt-6 space-y-4">
        {synonyms.map((synonym) => (
          <article key={synonym.id} className="rounded-card border border-[#243249] bg-[#101827] p-5">
            <form action={updateSynonymAction}>
              <input type="hidden" name="synonymId" value={synonym.id} />
              <SynonymFields synonym={synonym} />
              <div className="mt-4 flex flex-wrap gap-3">
                <AdminSubmitButton>Сохранить</AdminSubmitButton>
              </div>
            </form>
            <form action={deleteSynonymAction} className="mt-3">
              <input type="hidden" name="synonymId" value={synonym.id} />
              <button type="submit" className="inline-flex h-10 items-center rounded-card border border-[#4169A8] px-4 text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740]">
                Удалить
              </button>
            </form>
          </article>
        ))}
      </section>
    </div>
  );
}

function SynonymFields({
  synonym
}: {
  synonym?: Awaited<ReturnType<typeof getAdminSynonymsPageData>>[number];
}) {
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr_160px_120px] lg:items-start">
      <label><span className="text-sm text-[#C8D1DF]">Исходный термин</span><input name="sourceTerm" defaultValue={synonym?.sourceTerm ?? ""} required className={inputClassName} /></label>
      <label><span className="text-sm text-[#C8D1DF]">Замены</span><textarea name="targetTerms" defaultValue={synonym?.targetTerms.join(", ") ?? ""} required className={textareaClassName} /></label>
      <label className="mt-7 flex items-center gap-2 text-sm text-[#C8D1DF]"><input name="isBidirectional" value="1" type="checkbox" defaultChecked={synonym?.isBidirectional ?? true} className="h-4 w-4 accent-[#73A0F5]" /> В обе стороны</label>
      <label className="mt-7 flex items-center gap-2 text-sm text-[#C8D1DF]"><input name="isActive" value="1" type="checkbox" defaultChecked={synonym?.isActive ?? true} className="h-4 w-4 accent-[#73A0F5]" /> Активен</label>
    </div>
  );
}
