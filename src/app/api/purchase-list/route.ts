import { NextResponse } from "next/server";
import { getProductsForPurchaseList } from "@/features/catalog/data";
import {
  isProductIdentityId,
  MAX_PURCHASE_LIST_ITEMS,
  normalizePurchaseListIdentityIds
} from "@/features/purchase-list/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const productIdentityIds =
    typeof body === "object" && body !== null && "productIdentityIds" in body
      ? body.productIdentityIds
      : undefined;

  if (
    !Array.isArray(productIdentityIds) ||
    productIdentityIds.length > MAX_PURCHASE_LIST_ITEMS ||
    !productIdentityIds.every(
      (productIdentityId) =>
        typeof productIdentityId === "string" && isProductIdentityId(productIdentityId.trim())
    )
  ) {
    return NextResponse.json({ error: "Некорректный список товаров." }, { status: 400 });
  }

  const normalizedIdentityIds = normalizePurchaseListIdentityIds(productIdentityIds);

  try {
    const products = await getProductsForPurchaseList(normalizedIdentityIds);
    return NextResponse.json({ products });
  } catch (error) {
    console.error("[purchase-list] failed to load current products", error);
    return NextResponse.json({ error: "Не удалось загрузить товары." }, { status: 503 });
  }
}
