import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons/lucide";
import { PurchaseListProductBadge } from "@/components/purchase-list/purchase-list-product-badge";

export function ProductRow({ href, name, price, productIdentityId, description }: {
  href: string;
  name: string;
  price: number;
  productIdentityId?: string | null;
  description?: string;
}) {
  const title = <h2 className="catalog-product-row-title text-base font-semibold leading-6">{name}</h2>;

  return (
    <Link href={href} className="catalog-product-row tap-target grid gap-2 p-4 hover:bg-[#2563EB]/10 sm:grid-cols-[1fr_auto]">
      <div className="catalog-product-row-main">
        {description ? (
          <div className="catalog-product-row-description-group">
            {title}
            <p className="catalog-product-row-description mt-1 text-sm text-[#CBD5E1]">{description}</p>
          </div>
        ) : title}
        <span className="catalog-product-row-badge block">
          <PurchaseListProductBadge productIdentityId={productIdentityId} />
        </span>
      </div>
      <div className="catalog-product-row-utility">
        <div className="catalog-product-row-price text-lg font-semibold text-white">{price.toLocaleString("ru-RU")} ₽</div>
        <span className="catalog-product-row-chevron hidden" aria-hidden="true"><ChevronRightIcon /></span>
      </div>
    </Link>
  );
}
