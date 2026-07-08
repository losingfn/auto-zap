import { NextResponse } from "next/server";
import { searchProducts } from "@/features/search/service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? 20);

  const result = await searchProducts({
    query,
    limit: Number.isFinite(limit) ? limit : 20
  });

  return NextResponse.json(result);
}
