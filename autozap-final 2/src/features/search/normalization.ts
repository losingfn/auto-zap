import { normalizeShopCode, normalizeText } from "@/features/import/normalize";
import type { SearchSynonymRecord } from "./types";

const cyrillicToLatin: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya"
};

const latinToCyrillicBrands: Record<string, string> = {
  bosch: "бош",
  mann: "манн",
  ngk: "нжк",
  osram: "осрам",
  renault: "рено",
  chevrolet: "шевроле",
  daewoo: "дэу",
  ford: "форд",
  nissan: "ниссан",
  toyota: "тойота",
  hyundai: "хендай",
  kia: "киа",
  volkswagen: "фольксваген",
  vw: "фольксваген",
  vaz: "ваз",
  gaz: "газ",
  uaz: "уаз",
  lada: "лада"
};

export function normalizeSearchText(value: unknown) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,;:()[\]{}"']/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchText(value: unknown) {
  return normalizeSearchText(value)
    .split(/[\s/\\+]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function normalizeSearchShopCode(value: string) {
  return normalizeShopCode(normalizeText(value));
}

export function compactShopCode(value: string) {
  return normalizeSearchShopCode(value).replace(/[^0-9А-ЯA-Z]/g, "");
}

export function transliterateCyrillicToLatin(value: string) {
  return normalizeSearchText(value)
    .split("")
    .map((char) => cyrillicToLatin[char] ?? char)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function latinBrandToCyrillic(value: string) {
  return tokenizeSearchText(value)
    .map((token) => latinToCyrillicBrands[token] ?? token)
    .join(" ");
}

export function buildQueryVariants(query: string, synonyms: SearchSynonymRecord[]) {
  const normalized = normalizeSearchText(query);
  const variants = new Set<string>();
  if (normalized) {
    variants.add(normalized);
    variants.add(latinBrandToCyrillic(normalized));
    variants.add(transliterateCyrillicToLatin(normalized));
  }

  for (const term of expandQueryTerms(normalized, synonyms)) {
    variants.add(term);
    variants.add(transliterateCyrillicToLatin(term));
  }

  return [...variants].filter(Boolean);
}

export function expandQueryTerms(query: string, synonyms: SearchSynonymRecord[]) {
  const normalizedQuery = normalizeSearchText(query);
  const terms = new Set<string>(tokenizeSearchText(normalizedQuery));
  if (normalizedQuery) {
    terms.add(normalizedQuery);
  }

  for (const synonym of synonyms) {
    const source = normalizeSearchText(synonym.sourceTerm);
    const targets = synonym.targetTerms.map(normalizeSearchText).filter(Boolean);
    const hasSource = source && normalizedQuery.includes(source);
    const matchedTargets = targets.filter((target) => normalizedQuery.includes(target));

    if (hasSource) {
      for (const target of targets) {
        terms.add(target);
        for (const token of tokenizeSearchText(target)) {
          terms.add(token);
        }
      }
    }

    if (synonym.isBidirectional && matchedTargets.length > 0) {
      terms.add(source);
      for (const target of targets) {
        terms.add(target);
      }
    }
  }

  return [...terms].filter(Boolean);
}

export function buildExpandedQuery(query: string, synonyms: SearchSynonymRecord[]) {
  return buildQueryVariants(query, synonyms).join(" ");
}

export function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
