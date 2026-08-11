"use client";

import Link from "next/link";
import { usePurchaseList } from "@/features/purchase-list/purchase-list-provider";

export function PurchaseListProductAction({ shopCode }: { shopCode: string }) {
  const { addProduct, hasProduct, isReady } = usePurchaseList();
  const isSaved = isReady && hasProduct(shopCode);

  if (isSaved) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="inline-flex min-h-12 items-center rounded-card border border-[#2563EB]/55 bg-[#2563EB]/15 px-5 font-semibold text-[#DBEAFE]">
          ✓ В списке
        </span>
        <Link
          href="/spisok-pokupok"
          className="tap-target inline-flex min-h-12 items-center rounded-card px-1 text-sm font-semibold text-[#93C5FD] hover:text-white"
        >
          Открыть список покупок →
        </Link>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!isReady}
      onClick={() => addProduct(shopCode)}
      className="tap-target mt-6 inline-flex min-h-12 items-center rounded-card bg-[#2563EB] px-5 font-semibold text-white shadow-[0_18px_46px_rgba(37,99,235,0.3)] hover:-translate-y-0.5 hover:bg-[#1D4ED8] disabled:cursor-wait disabled:opacity-70"
    >
      + Добавить в список
    </button>
  );
}
