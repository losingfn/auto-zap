import type { Metadata } from "next";
import { publicAbsoluteUrl } from "@/features/seo/structured-data";

export const publicSeoSiteName = "Автозапчасти на Салтыкова-Щедрина";

const defaultOgImagePath = "/og-image-v3.png";
const defaultOgImageAlt = "Автозапчасти на Салтыкова-Щедрина";
const productTitleSuffix = " — купить в Талдоме | Автозапчасти";
const productTitleMaxLength = 70;
const productDescriptionNameMaxLength = 110;

type PublicPageMetadataInput = {
  title: string;
  description: string;
  path: string;
};

export function buildPublicPageMetadata({
  title,
  description,
  path
}: PublicPageMetadataInput): Metadata {
  const normalizedTitle = normalizeSeoText(title, "Автозапчасти");
  const normalizedDescription = normalizeSeoText(description, normalizedTitle);
  const canonical = publicAbsoluteUrl(path);
  const ogImageUrl = publicAbsoluteUrl(defaultOgImagePath) ?? defaultOgImagePath;

  return {
    title: {
      absolute: normalizedTitle
    },
    description: normalizedDescription,
    ...(canonical ? { alternates: { canonical } } : {}),
    openGraph: {
      title: normalizedTitle,
      description: normalizedDescription,
      ...(canonical ? { url: canonical } : {}),
      siteName: publicSeoSiteName,
      locale: "ru_RU",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: defaultOgImageAlt
        }
      ]
    }
  };
}

export function normalizeSeoText(value: unknown, fallback = "Автозапчасти") {
  const text = stringifySeoValue(value);
  const normalized = collapseWhitespace(text);
  const normalizedFallback = collapseWhitespace(stringifySeoValue(fallback));

  return normalized || normalizedFallback || "Автозапчасти";
}

export function buildProductSeoTitle(productName: unknown) {
  const normalizedName = normalizeSeoText(productName, "Товар");
  const fullTitle = `${normalizedName}${productTitleSuffix}`;

  if (fullTitle.length <= productTitleMaxLength) {
    return fullTitle;
  }

  const nameBudget = productTitleMaxLength - productTitleSuffix.length;
  const trimmedName = limitSeoTextLength(trimProductNameForTitle(normalizedName), nameBudget, "Товар");

  return `${trimmedName}${productTitleSuffix}`;
}

export function buildProductSeoDescription(productName: unknown, price: unknown) {
  const normalizedName = limitSeoTextLength(
    normalizeSeoText(productName, "Товар"),
    productDescriptionNameMaxLength,
    "Товар"
  );
  const formattedPrice = formatSeoPrice(price);

  if (!formattedPrice) {
    return `${normalizedName} в магазине автозапчастей в Талдоме. Уточните актуальную цену, наличие и совместимость детали перед покупкой.`;
  }

  return `${normalizedName} по цене ${formattedPrice} ₽ в магазине автозапчастей в Талдоме. Уточните наличие и совместимость детали перед покупкой.`;
}

export function formatSeoPrice(value: unknown) {
  const price = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  return price.toLocaleString("ru-RU", {
    maximumFractionDigits: Number.isInteger(price) ? 0 : 2
  });
}

function trimProductNameForTitle(productName: string) {
  const nameBudget = productTitleMaxLength - productTitleSuffix.length;
  const words = productName.split(" ").filter(Boolean);

  if (nameBudget <= 0 || words.length === 0) {
    return "Товар";
  }

  if (words.length === 1) {
    return limitSeoTextLength(words[0] || productName, nameBudget, "Товар");
  }

  if ((words[0]?.length ?? 0) >= nameBudget - 1) {
    return limitSeoTextLength(words[0] || productName, nameBudget, "Товар");
  }

  const tailBudget = nameBudget - (words[0]?.length ?? 0) - 1;
  const tailWords = collectTailWords(words.slice(1), tailBudget);
  const tailText = tailWords.join(" ");
  const prefixBudget = Math.max(0, nameBudget - tailText.length - 1);
  let prefix = "";

  for (const word of words.slice(0, words.length - tailWords.length)) {
    const next = prefix ? `${prefix} ${word}` : word;
    if (next.length > prefixBudget) {
      break;
    }
    prefix = next;
  }

  return limitSeoTextLength(
    prefix ? `${prefix} ${tailText}` : tailText || words[0],
    nameBudget,
    "Товар"
  );
}

function collectTailWords(words: string[], nameBudget: number) {
  const tailWords: string[] = [];

  for (let index = words.length - 1; index >= 0; index -= 1) {
    const next = [words[index], ...tailWords].join(" ");
    if (next.length > nameBudget) {
      break;
    }
    tailWords.unshift(words[index]);
  }

  return tailWords.length > 0 ? tailWords : [words.at(-1) ?? ""];
}

function stringifySeoValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return "";
  }

  return String(value);
}

function collapseWhitespace(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return ["undefined", "null", "nan"].includes(normalized.toLowerCase()) ? "" : normalized;
}

function limitSeoTextLength(value: string, maxLength: number, fallback: string) {
  const normalized = collapseWhitespace(value);

  if (!normalized || maxLength <= 0) {
    return fallback;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const words = normalized.split(" ").filter(Boolean);
  let result = "";

  for (const word of words) {
    const next = result ? `${result} ${word}` : word;
    if (next.length > maxLength) {
      break;
    }
    result = next;
  }

  return (
    result ||
    truncateByCodeUnitBudget(words[0] || normalized, maxLength) ||
    fallback
  );
}

function truncateByCodeUnitBudget(value: string, maxLength: number) {
  let result = "";

  for (const char of Array.from(value)) {
    if ((result + char).length > maxLength) {
      break;
    }
    result += char;
  }

  return result;
}
