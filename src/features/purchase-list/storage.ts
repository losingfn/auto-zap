export const PURCHASE_LIST_STORAGE_KEY = "autozap.purchase-list.v1";

export function normalizePurchaseListCodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const shopCode = item.trim();
    if (!shopCode || shopCode.length > 64 || seen.has(shopCode)) {
      continue;
    }

    seen.add(shopCode);
    normalized.push(shopCode);
  }

  return normalized;
}

export function parsePurchaseListStorage(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    return normalizePurchaseListCodes(JSON.parse(value));
  } catch {
    return [];
  }
}
