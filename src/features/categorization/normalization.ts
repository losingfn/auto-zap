import { normalizeText } from "@/features/import/normalize";

export const PRODUCT_NORMALIZER_VERSION = "product-normalizer-v2";

const cyrillicTechChars: Record<string, string> = {
  а: "a",
  в: "b",
  е: "e",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x"
};

const replacementPairs: Array<[RegExp, string]> = [
  [/\bрем\s*\.?\s*к\s*[- ]?\s*т\b/giu, "ремкомплект"],
  [/\bрем\s+комплект\b/giu, "ремкомплект"],
  [/\bмасл\.\b/giu, "масляный"],
  [/\bвозд\.\b/giu, "воздушный"],
  [/\bсалон\.\b/giu, "салонный"],
  [/\bторм\.\b/giu, "тормозной"],
  [/\bперед\.\b/giu, "передний"],
  [/\bзад\.\b/giu, "задний"],
  [/\bлев\.\b/giu, "левый"],
  [/\bправ\.\b/giu, "правый"],
  [/\bвнутр\.\b/giu, "внутренний"],
  [/\bнаруж\.\b/giu, "наружный"],
  [/(^|\s)двиг\.(?=\s|$)/giu, "$1двигатель"],
  [/\bк-т\b/giu, "комплект"],
  [/\bкт\b/giu, "комплект"],
  [/\bдв\.\b/giu, "двигатель"],
  [/\bдвс\b/giu, "двигатель"],
  [/(^|\s)с\s*\/\s*о(?=\s|$)/giu, "$1стеклоочистителя"],
  [/(^|\s)ст\.?\s*очист/giu, "$1стеклоочист"],
  [/б\s*\/\s*датчика/giu, "без датчика"],
  [/\bв\/в\b/giu, "высоковольтный"],
  [/\bгура\b/giu, "гур"],
  [/(^|\s)супорт(?=\s|$)/giu, "$1суппорт"],
  [/(^|\s)супорта(?=\s|$)/giu, "$1суппорт"],
  [/\bсуппорта\b/giu, "суппорт"],
  [/\bсуппортов\b/giu, "суппорт"],
  [/\bступицы\b/giu, "ступица"],
  [/(^|\s)бензин\.(?=\s|$)/giu, "$1бензиновый"],
  [/\bфильтр салона\b/giu, "салонный фильтр"],
  [/\bфильтр воздуш\b/giu, "воздушный фильтр"],
  [/\bфильтр масл\b/giu, "масляный фильтр"],
  [/\bакумулятор\b/giu, "аккумулятор"]
];

const stopTokens = new Set([
  "a",
  "an",
  "and",
  "at",
  "in",
  "of",
  "on",
  "the",
  "v",
  "а",
  "без",
  "в",
  "во",
  "г",
  "для",
  "до",
  "за",
  "и",
  "из",
  "к",
  "на",
  "о",
  "от",
  "под",
  "при",
  "с",
  "со",
  "шт",
  "штука",
  "штук"
]);

const weakTokens = new Set([
  "авто",
  "автомобильный",
  "блок",
  "деталь",
  "комплект",
  "корпус",
  "модуль",
  "набор",
  "универсальный",
  "элемент"
]);

export interface NormalizedProductName {
  original: string;
  normalized: string;
  tokens: string[];
  significantTokens: string[];
  phrases: string[];
  technicalTokens: string[];
  codeTokens: string[];
  measurements: string[];
  weakTokens: string[];
  hasCyrillic: boolean;
  hasLatin: boolean;
  digitRatio: number;
  usefulTokenCount: number;
}

export function normalizeProductName(value: unknown): NormalizedProductName {
  const original = normalizeText(value);
  const normalized = normalizeProductText(original);
  const tokens = tokenizeNormalizedProductText(normalized);
  const technicalTokens = [...new Set(tokens.map(normalizeTechnicalToken).filter(Boolean))];
  const codeTokens = tokens.filter(isCodeLikeToken);
  const measurements = tokens.filter(isMeasurementToken);
  const significantTokens = tokens.filter(
    (token) =>
      token.length >= 2 &&
      !stopTokens.has(token) &&
      !/^\d+$/.test(token) &&
      !isPureVehicleModel(token)
  );
  const weak = significantTokens.filter((token) => weakTokens.has(token));
  const nonSpaceLength = normalized.replace(/\s/g, "").length;
  const digitCount = (normalized.match(/\d/g) ?? []).length;

  return {
    original,
    normalized,
    tokens,
    significantTokens,
    phrases: buildPhrases(significantTokens),
    technicalTokens,
    codeTokens,
    measurements,
    weakTokens: weak,
    hasCyrillic: /[а-яё]/iu.test(normalized),
    hasLatin: /[a-z]/iu.test(normalized),
    digitRatio: nonSpaceLength > 0 ? digitCount / nonSpaceLength : 0,
    usefulTokenCount: significantTokens.filter((token) => !weakTokens.has(token)).length
  };
}

export function normalizeProductText(value: unknown) {
  let text = normalizeText(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[–—]/g, "-")
    .replace(/[()[\]{}"']/g, " ")
    .replace(/[,:;]/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, replacement] of replacementPairs) {
    text = text.replace(pattern, replacement);
  }

  return text
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeNormalizedProductText(value: string) {
  return value
    .split(/[\s/+\\]+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}*.-]+$/giu, ""))
    .filter(Boolean);
}

export function normalizeTechnicalToken(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/(\d)в$/giu, "$1v")
    .split("")
    .map((char) => cyrillicTechChars[char] ?? char)
    .join("")
    .replace(/[^a-z0-9.-]/g, "");
  const compactTechnical = normalized.replace(/[.-]/g, "");

  if (/^t\d{1,3}$/.test(normalized)) return normalized;
  if (/^h\d{1,2}$/.test(normalized)) return normalized;
  if (/^w\d+w$/.test(normalized)) return normalized;
  if (/^\d{1,2}v$/.test(normalized)) return normalized;
  if (/^dot\d$/.test(compactTechnical)) return compactTechnical;
  if (/^\d{1,2}w[-.]?\d{2}$/.test(normalized)) return normalized.replace(/\./g, "-");
  if (/^\d{1,2}w\d{2}$/.test(normalized)) return normalized;
  if (normalized === "atf" || normalized === "sae" || normalized === "led") return normalized;
  return "";
}

export function hasAnyToken(features: Pick<NormalizedProductName, "tokens" | "technicalTokens">, tokens: string[]) {
  return tokens.some((token) => hasToken(features, token));
}

export function hasAllTokens(features: Pick<NormalizedProductName, "tokens" | "technicalTokens">, tokens: string[]) {
  return tokens.every((token) => hasToken(features, token));
}

export function hasToken(features: Pick<NormalizedProductName, "tokens" | "technicalTokens">, token: string) {
  const normalized = normalizeProductText(token);
  const technical = normalizeTechnicalToken(normalized);
  if (technical) {
    return features.technicalTokens.includes(technical);
  }

  return features.tokens.some((current) => current === normalized || current.startsWith(normalized));
}

export function containsPhrase(features: Pick<NormalizedProductName, "normalized">, phrase: string) {
  const normalizedPhrase = normalizeProductText(phrase);
  if (!normalizedPhrase) {
    return false;
  }

  const pattern = normalizedPhrase
    .split(/\s+/)
    .map(escapeRegExp)
    .join("\\s+");
  return new RegExp(`(^|\\s)${pattern}(\\s|$)`, "iu").test(features.normalized);
}

function buildPhrases(tokens: string[]) {
  const phrases = new Set<string>();
  for (const size of [2, 3]) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      phrases.add(tokens.slice(index, index + size).join(" "));
    }
  }
  return [...phrases];
}

function isCodeLikeToken(token: string) {
  return /^(?=.*\d)(?=.*[a-zа-я])[a-zа-я0-9.-]{4,}$/iu.test(token) || /^\d{5,}$/.test(token);
}

function isMeasurementToken(token: string) {
  return /^(\d+(?:[.,]\d+)?)(мм|см|м|л|v|w|а|ah)$/iu.test(token);
}

function isPureVehicleModel(token: string) {
  return /^(?:\d{3,5}|210[1-9]|211[0-5]|2121|21213|21214|2170|2190|3302)$/.test(token);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
