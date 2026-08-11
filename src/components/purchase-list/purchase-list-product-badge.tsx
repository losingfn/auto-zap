"use client";

import { usePurchaseList } from "@/features/purchase-list/purchase-list-provider";

export function PurchaseListProductBadge({
  productIdentityId
}: {
  productIdentityId: string | null | undefined;
}) {
  const { hasProduct, isReady } = usePurchaseList();

  if (!isReady || !hasProduct(productIdentityId)) {
    return null;
  }

  return (
    <span className="mt-2 inline-flex rounded-full border border-[#2563EB]/55 bg-[#2563EB]/15 px-2 py-0.5 text-xs font-semibold text-[#BFDBFE]">
      ✓ В списке
    </span>
  );
}
