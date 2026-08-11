"use client";

import { usePurchaseList } from "@/features/purchase-list/purchase-list-provider";

export function PurchaseListProductBadge({ shopCode }: { shopCode: string }) {
  const { hasProduct, isReady } = usePurchaseList();

  if (!isReady || !hasProduct(shopCode)) {
    return null;
  }

  return (
    <span className="mt-2 inline-flex rounded-full border border-[#2563EB]/55 bg-[#2563EB]/15 px-2 py-0.5 text-xs font-semibold text-[#BFDBFE]">
      ✓ В списке
    </span>
  );
}
