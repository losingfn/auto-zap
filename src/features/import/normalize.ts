const codeConfusables: Record<string, string> = {
  A: "А",
  B: "В",
  C: "С",
  E: "Е",
  H: "Н",
  K: "К",
  M: "М",
  O: "О",
  P: "Р",
  T: "Т",
  X: "Х",
  Y: "У"
};

export function normalizeText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHeader(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/ё/g, "е");
}

export function normalizeShopCode(value: string) {
  return value
    .toUpperCase()
    .split("")
    .map((char) => codeConfusables[char] ?? char)
    .join("");
}

export function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (value instanceof Date) {
    return null;
  }

  const normalized = String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/(?:₽|руб\.?|р\.)/gi, "");

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isBlankValue(value: unknown) {
  return normalizeText(value) === "";
}
