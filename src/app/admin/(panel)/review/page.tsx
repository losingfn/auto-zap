import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  getAdminReviewListData,
  getAdminReviewPrimaryData,
  type AdminReviewItem
} from "@/features/admin/review";
import { requireAdminSession } from "@/features/admin/auth";
import { createAdminReviewPerfLogger } from "@/lib/server/admin-review-perf";
import { ReviewWorkflow } from "./review-workflow";

export const metadata: Metadata = { title: "Проверка товаров" };

type ReviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const numberFormatter = new Intl.NumberFormat("ru-RU");

export default async function AdminReviewPage({ searchParams }: ReviewPageProps) {
  const perf = createAdminReviewPerfLogger();
  const requestTimer = perf?.start();
  let requestError = 1;

  try {
    const session = perf
      ? await perf.measure("page_admin_session", requireAdminSession)
      : await requireAdminSession();
    const params = await searchParams;
    const tab = readParam(params.tab) === "all" ? "all" : "review";

    const content = tab === "all"
      ? <AllProductsView params={params} adminUserId={session.user.id} perf={perf} />
      : <PrimaryReviewView focusReviewId={readParam(params.item)} adminUserId={session.user.id} perf={perf} />;

    requestError = 0;
    return (
      <div>
        <header className="mb-6">
          <h1 className="text-3xl font-semibold">Проверка товаров</h1>
          <nav className="mt-5 flex gap-2 border-b border-[#243249]" aria-label="Режим проверки товаров">
            <TabLink active={tab === "review"} href="/admin/review">Проверка</TabLink>
            <TabLink active={tab === "all"} href="/admin/review?tab=all">Все товары</TabLink>
          </nav>
        </header>
        {content}
      </div>
    );
  } finally {
    perf?.log("admin_review_page_request", {
      duration_ms: perf.elapsed(requestTimer),
      error: requestError
    });
  }
}

async function PrimaryReviewView({
  focusReviewId,
  adminUserId,
  perf
}: {
  focusReviewId: string | undefined;
  adminUserId: string;
  perf: ReturnType<typeof createAdminReviewPerfLogger>;
}) {
  const data = await getAdminReviewPrimaryData({
    adminUserId,
    createWorkspaceIfNeeded: true,
    focusReviewId,
    perf
  });
  return <ReviewWorkflow initialData={data} />;
}

async function AllProductsView({
  params,
  adminUserId,
  perf
}: {
  params: Record<string, string | string[] | undefined>;
  adminUserId: string;
  perf: ReturnType<typeof createAdminReviewPerfLogger>;
}) {
  const data = await getAdminReviewListData(params, {
    adminUserId,
    createWorkspaceIfNeeded: true,
    perf
  });
  const query = readParam(params.q) ?? "";

  return (
    <section>
      <form className="mb-5 flex flex-col gap-3 sm:flex-row" action="/admin/review" method="get">
        <input type="hidden" name="tab" value="all" />
        <label className="sr-only" htmlFor="review-search">Поиск товара</label>
        <input
          id="review-search"
          name="q"
          defaultValue={query}
          placeholder="Поиск по артикулу или названию"
          className="h-11 flex-1 rounded-card border border-[#2E3A4C] bg-[#0B1220] px-3 text-base text-white outline-none placeholder:text-[#66758A] focus:border-[#73A0F5] focus-visible:ring-2 focus-visible:ring-[#73A0F5]"
        />
        <button className="inline-flex h-11 items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB]">Найти</button>
      </form>

      <p className="mb-4 text-sm text-[#8FA1B8]">
        Показано {numberFormatter.format(data.pagination.from)}–{numberFormatter.format(data.pagination.to)} из {numberFormatter.format(data.pagination.total)}.
      </p>

      <div className="overflow-x-auto rounded-card border border-[#243249] bg-[#101827]">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="border-b border-[#243249] text-[#8FA1B8]">
            <tr>
              <th className="px-4 py-3 font-medium">Артикул</th>
              <th className="px-4 py-3 font-medium">Название</th>
              <th className="px-4 py-3 font-medium">Предложение</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Действие</span></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => <ProductRow key={item.reviewId} item={item} />)}
          </tbody>
        </table>
        {data.items.length === 0 ? <p className="p-6 text-sm text-[#8FA1B8]">Товары не найдены.</p> : null}
      </div>
      <Pagination page={data.pagination.page} pageCount={data.pagination.pageCount} query={query} />
    </section>
  );
}

function ProductRow({ item }: { item: AdminReviewItem }) {
  return (
    <tr className="border-b border-[#243249] last:border-0">
      <td className="whitespace-nowrap px-4 py-4 text-[#C8D1DF]">{item.shopCode}</td>
      <td className="max-w-[360px] px-4 py-4 font-medium">{item.name}</td>
      <td className="px-4 py-4 text-[#C8D1DF]">{formatTarget(item.suggestedCategoryName, item.suggestedSubcategoryName)}</td>
      <td className="px-4 py-4 text-[#C8D1DF]">{statusLabel(item.workspaceStatus)}</td>
      <td className="px-4 py-4 text-right"><Link href={`/admin/review?item=${encodeURIComponent(item.reviewId)}`} className="font-semibold text-[#9DBDFB] hover:text-white">Открыть</Link></td>
    </tr>
  );
}

function Pagination({ page, pageCount, query }: { page: number; pageCount: number; query: string }) {
  if (pageCount <= 1) return null;
  const href = (nextPage: number) => {
    const search = new URLSearchParams({ tab: "all", page: String(nextPage) });
    if (query) search.set("q", query);
    return `/admin/review?${search.toString()}`;
  };
  return (
    <nav className="mt-5 flex items-center justify-end gap-3 text-sm" aria-label="Страницы товаров">
      <Link href={href(Math.max(1, page - 1))} aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none text-[#536174]" : "text-[#9DBDFB] hover:text-white"}>Предыдущая</Link>
      <span className="text-[#8FA1B8]">{page} / {pageCount}</span>
      <Link href={href(Math.min(pageCount, page + 1))} aria-disabled={page >= pageCount} className={page >= pageCount ? "pointer-events-none text-[#536174]" : "text-[#9DBDFB] hover:text-white"}>Следующая</Link>
    </nav>
  );
}

function TabLink({ active, href, children }: { active: boolean; href: string; children: ReactNode }) {
  return <Link href={href} className={`-mb-px border-b-2 px-4 py-3 text-sm font-semibold transition ${active ? "border-[#73A0F5] text-white" : "border-transparent text-[#8FA1B8] hover:text-white"}`}>{children}</Link>;
}

function formatTarget(category: string | null, subcategory: string | null) {
  return [category, subcategory].filter(Boolean).join(" → ") || "Не выбрано";
}

function statusLabel(status: AdminReviewItem["workspaceStatus"]) {
  return status === "prepared" ? "Подтверждён" : status === "excluded" ? "Пропущен" : "Требует проверки";
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
