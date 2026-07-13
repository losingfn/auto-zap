import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditLogs,
  categorizationRules,
  categories,
  products,
  reviewQueue,
  subcategories
} from "@/db/schema";
import { buildProductSearchText } from "@/features/search/documents";
import { getSearchSynonyms } from "@/features/search/synonyms";
import { normalizeForCategorization } from "./engine";

export interface LearnCategorizationRuleInput {
  reviewQueueId?: string;
  productId: string;
  categoryId: string;
  subcategoryId: string;
  adminUserId: string;
  rulePattern?: string;
  learnRule?: boolean;
}

export async function applyManualCategorizationCorrection(input: LearnCategorizationRuleInput) {
  const searchSynonyms = await getSearchSynonyms();

  return db.transaction(async (tx) => {
    const [product] = await tx
      .select({
        id: products.id,
        shopCode: products.shopCode,
        name: products.name,
        rawName: products.rawName
      })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);

    if (!product) {
      throw new Error("Товар для ручной категоризации не найден.");
    }

    const [category] = await tx
      .select({ id: categories.id, slug: categories.slug, name: categories.name })
      .from(categories)
      .where(eq(categories.id, input.categoryId))
      .limit(1);

    const [subcategory] = await tx
      .select({ id: subcategories.id, slug: subcategories.slug, name: subcategories.name })
      .from(subcategories)
      .where(and(eq(subcategories.id, input.subcategoryId), eq(subcategories.categoryId, input.categoryId)))
      .limit(1);

    if (!category || !subcategory) {
      throw new Error("Категория или подкатегория для ручной категоризации не найдена.");
    }

    await tx
      .update(products)
      .set({
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        status: "active",
        reviewReason: null,
        searchText: buildProductSearchText({
          shopCode: product.shopCode,
          name: product.name,
          rawName: product.rawName,
          categoryName: category.name,
          subcategoryName: subcategory.name,
          synonyms: searchSynonyms
        }),
        updatedAt: new Date()
      })
      .where(eq(products.id, input.productId));

    await tx
      .update(reviewQueue)
      .set({
        status: "resolved",
        resolvedBy: input.adminUserId,
        resolvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(input.reviewQueueId ? eq(reviewQueue.id, input.reviewQueueId) : eq(reviewQueue.productId, input.productId));

    const learnedRule = input.learnRule === false
      ? { id: null, pattern: null, skippedReason: "disabled" }
      : await learnSafeCategorizationRule({
          tx,
          productName: product.name || product.rawName,
          categoryId: input.categoryId,
          subcategoryId: input.subcategoryId,
          adminUserId: input.adminUserId,
          requestedPattern: input.rulePattern
        });

    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: "categorization.manual_correction",
      entityType: "product",
      entityId: input.productId,
      metadata: {
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        reviewQueueId: input.reviewQueueId,
        learnedRuleId: learnedRule.id,
        pattern: learnedRule.pattern,
        learnedRuleSkippedReason: learnedRule.skippedReason
      }
    });

    return {
      productId: input.productId,
      categoryId: input.categoryId,
      categorySlug: category.slug,
      subcategoryId: input.subcategoryId,
      subcategorySlug: subcategory.slug,
      learnedRuleId: learnedRule.id,
      pattern: learnedRule.pattern,
      learnedRuleSkippedReason: learnedRule.skippedReason
    };
  });
}

export function suggestRulePatternForProduct(name: string) {
  const normalized = normalizeForCategorization(name);
  const words = normalized
    .split(" ")
    .map((word) => word.trim())
    .filter(isMeaningfulRuleWord);

  if (words.length >= 2) {
    return words.slice(0, 3).join(" ");
  }

  const singleWord = words[0];
  if (singleWord && SAFE_SINGLE_WORD_RULES.has(singleWord)) {
    return singleWord;
  }

  return null;
}

export function validateRulePattern(
  pattern: string,
  options: { allowProductNounSingleWord?: boolean } = {}
) {
  const normalized = normalizeForCategorization(pattern);
  const words = normalized.split(" ").filter(Boolean);

  if (!normalized) {
    return { ok: false as const, reason: "empty" };
  }

  if (normalized.length < 6 || /^\d+$/.test(normalized) || /^[а-яa-z]-?\d+$/iu.test(normalized)) {
    return { ok: false as const, reason: "too_short" };
  }

  if (words.length === 1) {
    const [word] = words;
    const isAllowedProductNoun =
      options.allowProductNounSingleWord === true && PRODUCT_NOUN_SINGLE_WORD_RULES.has(word);
    if (!SAFE_SINGLE_WORD_RULES.has(word) && !isAllowedProductNoun) {
      return { ok: false as const, reason: "single_word_too_broad" };
    }
  }

  if (words.every((word) => UNSAFE_RULE_WORDS.has(word) || RULE_STOP_WORDS.has(word))) {
    return { ok: false as const, reason: "too_generic" };
  }

  if (
    words.some((word) => UNSAFE_SINGLE_WORD_RULES.has(word)) &&
    words.length < 2 &&
    !(options.allowProductNounSingleWord === true && PRODUCT_NOUN_SINGLE_WORD_RULES.has(words[0]))
  ) {
    return { ok: false as const, reason: "too_generic" };
  }

  return {
    ok: true as const,
    pattern: words.slice(0, 5).join(" ")
  };
}

export async function learnSafeCategorizationRule({
  tx,
  productName,
  categoryId,
  subcategoryId,
  adminUserId,
  requestedPattern,
  allowProductNounSingleWord
}: {
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
  productName: string;
  categoryId: string;
  subcategoryId: string;
  adminUserId: string;
  requestedPattern?: string;
  allowProductNounSingleWord?: boolean;
}) {
  const candidate = requestedPattern?.trim() || suggestRulePatternForProduct(productName);
  if (!candidate) {
    return { id: null, pattern: null, skippedReason: "no_safe_pattern" };
  }

  const validation = validateRulePattern(candidate, { allowProductNounSingleWord });
  if (!validation.ok) {
    return { id: null, pattern: null, skippedReason: validation.reason };
  }

  const conflictingRules = await tx
    .select({
      id: categorizationRules.id,
      categoryId: categorizationRules.categoryId,
      subcategoryId: categorizationRules.subcategoryId
    })
    .from(categorizationRules)
    .where(
      and(
        eq(categorizationRules.pattern, validation.pattern),
        eq(categorizationRules.matchType, "contains"),
        eq(categorizationRules.isActive, true)
      )
    );

  const hasConflict = conflictingRules.some(
    (rule) => rule.categoryId !== categoryId || rule.subcategoryId !== subcategoryId
  );

  if (hasConflict) {
    return { id: null, pattern: validation.pattern, skippedReason: "conflicting_rule" };
  }

  const [rule] = await tx
    .insert(categorizationRules)
    .values({
      pattern: validation.pattern,
      matchType: "contains",
      categoryId,
      subcategoryId,
      priority: 15,
      createdBy: adminUserId
    })
    .onConflictDoUpdate({
      target: [
        categorizationRules.pattern,
        categorizationRules.matchType,
        categorizationRules.categoryId,
        categorizationRules.subcategoryId
      ],
      set: {
        isActive: true,
        updatedAt: new Date()
      }
    })
    .returning({ id: categorizationRules.id });

  return {
    id: rule.id,
    pattern: validation.pattern,
    skippedReason: null
  };
}

function isMeaningfulRuleWord(word: string) {
  return (
    word.length >= 4 &&
    !/^\d+$/.test(word) &&
    !/^[а-яa-z]-?\d+$/iu.test(word) &&
    !RULE_STOP_WORDS.has(word) &&
    !UNSAFE_RULE_WORDS.has(word)
  );
}

const RULE_STOP_WORDS = new Set([
  "для",
  "под",
  "без",
  "при",
  "над",
  "левый",
  "левая",
  "левое",
  "правый",
  "правая",
  "правое",
  "передний",
  "передняя",
  "переднее",
  "задний",
  "задняя",
  "заднее",
  "верхний",
  "верхняя",
  "верхнее",
  "нижний",
  "нижняя",
  "нижнее",
  "наружный",
  "наружная",
  "внутренний",
  "внутренняя"
]);

const UNSAFE_RULE_WORDS = new Set([
  "комплект",
  "набор",
  "штука",
  "деталь",
  "изделие",
  "авто",
  "универсальный",
  "универсальная"
]);

const UNSAFE_SINGLE_WORD_RULES = new Set([
  "резина",
  "кольцо",
  "прокладка",
  "уплотнитель",
  "уплотнительное",
  "болт",
  "гайка",
  "шайба",
  "втулка",
  "крышка",
  "держатель",
  "крепление",
  "ремкомплект"
]);

const SAFE_SINGLE_WORD_RULES = new Set([
  "аккумулятор",
  "стартер",
  "генератор",
  "термостат",
  "радиатор",
  "амортизатор",
  "сайлентблок",
  "подшипник",
  "карбюратор",
  "катализатор",
  "глушитель",
  "суппорт"
]);

const PRODUCT_NOUN_SINGLE_WORD_RULES = new Set([
  "болт",
  "болты",
  "гайка",
  "гайки",
  "шайба",
  "шайбы",
  "штуцер",
  "штуцеры",
  "фитинг",
  "фитинги",
  "накладка",
  "накладки",
  "маска",
  "маски",
  "соединитель",
  "соединители",
  "крепеж",
  "кольцо",
  "кольца"
]);
