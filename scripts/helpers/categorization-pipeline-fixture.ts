import { catalogTaxonomy } from "@/config/catalog-taxonomy";
import { isPublicTaxonomyTarget } from "@/config/public-taxonomy";
import { buildDefaultCategorizationContext } from "@/features/categorization/engine";
import type {
  CategorizationContext,
  CategorizationResult,
  CategorizationRuleRecord,
  CategorizationTarget
} from "@/features/categorization/types";

export type PipelineFixtureCase = {
  productName: string;
  legacyResult: CategorizationResult;
};

export function createPipelineFixtureContext(): CategorizationContext {
  const targetBySlug = new Map<string, CategorizationTarget>();
  for (const category of catalogTaxonomy) {
    for (const [subcategorySlug, subcategoryName] of category.subcategories) {
      if (!isPublicTaxonomyTarget(category.slug, subcategorySlug)) continue;

      targetBySlug.set(`${category.slug}/${subcategorySlug}`, {
        categoryId: `category:${category.slug}`,
        categorySlug: category.slug,
        categoryName: category.name,
        subcategoryId: `subcategory:${category.slug}/${subcategorySlug}`,
        subcategorySlug,
        subcategoryName
      });
    }
  }

  return { ...buildDefaultCategorizationContext(), targetBySlug };
}

export function createPipelineFixtureCases(
  count: number,
  context: CategorizationContext
): PipelineFixtureCase[] {
  const seed = createSeededGenerator(0x5eedc0de);
  const values = [
    "Болт суппорт передний",
    "Фильтр масляный MANN W 914/2",
    "Амортизатор передний газовый",
    "Датчик давления масла кардан",
    "Ремкомплект тормозного суппорта",
    "Brake caliper repair kit",
    "Болт DIN 933 M10x30",
    "Фильтр, масляный / A-12.4",
    "   ",
    "Гайка М10 универсальная",
    "Неизвестный универсальный автомобильный аксессуар",
    "QZX 9911 ###",
    "диск колесный литые диски",
    "свеча зажигания NGK BKR6E",
    "Т10 LED лампа 12В",
    "Прокладка ГБЦ 16V",
    "Шланг ГУР высокого давления",
    "Пленка тонировочная 75%",
    "рем к-т суппорта",
    "  ФАРА (левая), блок-фара / H4  ",
    "A-1234/Б-56",
    "колесный-диск, R16",
    "стеклоочистителя щетка 600 мм",
    "масло моторное SAE 5W-30",
    "АККУМУЛЯТОР 60Ah",
    "сальник коленвала",
    "кронштейн бампера",
    "трос ручного тормоза",
    "без датчика ABS",
    "комплект ремня ГРМ"
  ];
  const modifiers = ["", "  ", " /", "-X", " (правый)", ", 12V", " №42", "   для ВАЗ-2110"];
  const cases: PipelineFixtureCase[] = [];

  for (let index = 0; index < count; index += 1) {
    const base = values[index % values.length]!;
    const productName = index < values.length
      ? base
      : `${base}${modifiers[Math.floor(seed() * modifiers.length)]!}`;
    cases.push({
      productName,
      legacyResult: createLegacyResult(index, context)
    });
  }

  return cases;
}

function createLegacyResult(index: number, context: CategorizationContext): CategorizationResult {
  if (index % 31 === 0) {
    const target = context.targetBySlug?.get("filtry-i-masla/maslyanye-filtry") ?? null;
    return {
      target,
      matchedRule: null,
      confidence: 1,
      source: "existing_product_category",
      reason: "Категория сохранена из активного каталога для этого артикула.",
      matchedSignals: [{ kind: "existing_product", value: "filtry-i-masla/maslyanye-filtry" }],
      needsReview: false,
      reviewReason: null,
      decisionStatus: "AUTO_READY"
    };
  }

  if (index % 5 !== 0) {
    return {
      target: null,
      matchedRule: null,
      confidence: 0,
      source: "no_match",
      reason: "Категория и подкатегория не определены правилами.",
      matchedSignals: [{ kind: "validation", value: "no_match" }],
      needsReview: true,
      reviewReason: "Категория и подкатегория не определены правилами."
    };
  }

  const target = context.targetBySlug?.get("tormoznaya-sistema/supporty") ?? null;
  const matchedRule: CategorizationRuleRecord = {
    id: `fixture-rule-${index}`,
    pattern: "суппорт",
    matchType: "contains",
    categoryId: target?.categoryId,
    categorySlug: "tormoznaya-sistema",
    categoryName: target?.categoryName,
    subcategoryId: target?.subcategoryId,
    subcategorySlug: "supporty",
    subcategoryName: target?.subcategoryName,
    priority: 10,
    createdBy: index % 10 === 0 ? "fixture-admin" : null
  };
  return {
    target,
    matchedRule,
    confidence: index % 10 === 0 ? 0.95 : 0.92,
    source: index % 10 === 0 ? "verified_learning_rule" : "strong_multi_token",
    reason: "Fixture legacy rule.",
    matchedSignals: [
      { kind: "pattern", value: "суппорт" },
      { kind: "token", value: "суппорт" }
    ],
    needsReview: false,
    reviewReason: null
  };
}

function createSeededGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
