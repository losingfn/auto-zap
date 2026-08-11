export const PURCHASE_LIST_STORAGE_KEY = "autozap.purchase-list.v2";
export const LEGACY_PURCHASE_LIST_STORAGE_KEY = "autozap.purchase-list.v1";
export const LEGACY_PURCHASE_LIST_ACKNOWLEDGEMENT_KEY =
  "autozap.purchase-list.v1-acknowledged";
export const MAX_PURCHASE_LIST_ITEMS = 100;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export function normalizePurchaseListIdentityIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const productIdentityId = item.trim().toLowerCase();
    if (
      !isProductIdentityId(productIdentityId) ||
      seen.has(productIdentityId) ||
      normalized.length >= MAX_PURCHASE_LIST_ITEMS
    ) {
      continue;
    }

    seen.add(productIdentityId);
    normalized.push(productIdentityId);
  }

  return normalized;
}

export function parsePurchaseListStorage(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    return normalizePurchaseListIdentityIds(JSON.parse(value));
  } catch {
    return [];
  }
}

export function isPurchaseListStorageValue(value: string | null) {
  if (value === null) {
    return false;
  }

  try {
    return Array.isArray(JSON.parse(value));
  } catch {
    return false;
  }
}

export function hasLegacyPurchaseList(
  legacyValue: string | null,
  v2Value: string | null,
  acknowledgementValue: string | null
) {
  return (
    acknowledgementValue !== "1" &&
    !isPurchaseListStorageValue(v2Value) &&
    parseLegacyPurchaseListStorage(legacyValue).length > 0
  );
}

export function parseLegacyPurchaseListStorage(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    return normalizeLegacyPurchaseListCodes(JSON.parse(value));
  } catch {
    return [];
  }
}

export function normalizeLegacyPurchaseListCodes(value: unknown): string[] {
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

export function isProductIdentityId(value: string) {
  return UUID_PATTERN.test(value) && value.toLowerCase() !== NIL_UUID;
}
