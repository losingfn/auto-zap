import { normalizeShopCode, normalizeText } from "./normalize";
import type { ParsedProductIdentity } from "./types";

const productCodePattern = /^([A-ZА-ЯЁ]+-\d+)\s*(.*)$/i;

export function parseProductIdentity(rawValue: unknown): ParsedProductIdentity | null {
  const rawName = normalizeText(rawValue);
  if (!rawName) {
    return null;
  }

  const match = rawName.match(productCodePattern);
  if (!match) {
    return null;
  }

  return {
    rawCode: match[1],
    shopCode: normalizeShopCode(match[1]),
    name: normalizeText(match[2])
  };
}

export function looksLikeProductRow(rawValue: unknown) {
  return parseProductIdentity(rawValue) !== null;
}
