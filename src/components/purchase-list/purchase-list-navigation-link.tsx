"use client";

import Link from "next/link";
import { usePurchaseList } from "@/features/purchase-list/purchase-list-provider";

export function PurchaseListNavigationLink({
  className,
  label = "Список покупок",
  mobileLabel
}: {
  className: string;
  label?: string;
  mobileLabel?: string;
}) {
  const { isReady, productIdentityIds } = usePurchaseList();
  const count = isReady ? productIdentityIds.length : 0;
  const countLabel = count > 99 ? "99+" : String(count);

  return (
    <Link
      href="/spisok-pokupok"
      className={`relative ${className}`}
      aria-label={count > 0 ? `${label}: ${countLabel}` : label}
    >
      {mobileLabel ? (
        <>
          <span className="sm:hidden">{mobileLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
      <span
        aria-hidden={count === 0}
        className={[
          "pointer-events-none absolute right-1 top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[#2563EB] px-1 text-[0.625rem] font-semibold leading-4 text-white shadow-[0_4px_12px_rgba(37,99,235,0.4)]",
          count > 0 ? "opacity-100" : "invisible opacity-0"
        ].join(" ")}
      >
        {countLabel}
      </span>
    </Link>
  );
}
