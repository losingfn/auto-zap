import { NextResponse } from "next/server";
import { getProductsForPurchaseList } from "@/features/catalog/data";
import { normalizePurchaseListCodes } from "@/features/purchase-list/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const shopCodes = normalizePurchaseListCodes(
    typeof body === "object" && body !== null && "shopCodes" in body
      ? body.shopCodes
      : undefined
  );

  try {
    const products = await getProductsForPurchaseList(shopCodes);
    return NextResponse.json({ products });
  } catch (error) {
    console.error("[purchase-list] failed to load current products", error);
    return NextResponse.json({ error: "Не удалось загрузить товары." }, { status: 503 });
  }
}
