import { and, asc, eq } from "drizzle-orm";
import { defaultCategorizationRules } from "@/config/catalog-taxonomy";
import { isPublicCategorySlug, isPublicTaxonomyTarget } from "@/config/public-taxonomy";
import { db } from "@/db/client";
import { categories, categorizationRules, subcategories } from "@/db/schema";
import type {
  CategorizationContext,
  CategorizationRuleRecord,
  CategorizationTarget
} from "./types";

export async function getCategorizationContext(): Promise<CategorizationContext> {
  const rows = await db
    .select({
      id: categorizationRules.id,
      pattern: categorizationRules.pattern,
      matchType: categorizationRules.matchType,
      priority: categorizationRules.priority,
      categoryId: categories.id,
      categorySlug: categories.slug,
      categoryName: categories.name,
      subcategoryId: subcategories.id,
      subcategorySlug: subcategories.slug,
      subcategoryName: subcategories.name,
      createdBy: categorizationRules.createdBy
    })
    .from(categorizationRules)
    .innerJoin(categories, eq(categories.id, categorizationRules.categoryId))
    .innerJoin(subcategories, eq(subcategories.id, categorizationRules.subcategoryId))
    .where(
      and(
        eq(categorizationRules.isActive, true),
        eq(categories.isActive, true),
        eq(subcategories.isActive, true)
      )
    )
    .orderBy(asc(categorizationRules.priority));

  const rules: CategorizationRuleRecord[] = rows
    .filter((row) => isPublicTaxonomyTarget(row.categorySlug, row.subcategorySlug))
    .map((row) => ({
      id: row.id,
      pattern: row.pattern,
      matchType: row.matchType,
      priority: row.priority,
      categoryId: row.categoryId,
      categorySlug: row.categorySlug,
      categoryName: row.categoryName,
      subcategoryId: row.subcategoryId,
      subcategorySlug: row.subcategorySlug,
      subcategoryName: row.subcategoryName,
      createdBy: row.createdBy
    }));

  const fallbackRows = await db
    .select({
      categoryId: categories.id,
      categorySlug: categories.slug,
      categoryName: categories.name,
      subcategoryId: subcategories.id,
      subcategorySlug: subcategories.slug,
      subcategoryName: subcategories.name
    })
    .from(subcategories)
    .innerJoin(categories, eq(categories.id, subcategories.categoryId))
    .where(and(eq(subcategories.isActive, true), eq(categories.isActive, true)))
    .orderBy(asc(categories.sortOrder), asc(subcategories.sortOrder));

  const fallbackByCategorySlug = new Map<string, CategorizationTarget>();
  const targetBySlug = new Map<string, CategorizationTarget>();
  for (const row of fallbackRows) {
    if (
      !isPublicCategorySlug(row.categorySlug) ||
      !isPublicTaxonomyTarget(row.categorySlug, row.subcategorySlug)
    ) {
      continue;
    }

    const target = {
      categoryId: row.categoryId,
      categorySlug: row.categorySlug,
      categoryName: row.categoryName,
      subcategoryId: row.subcategoryId,
      subcategorySlug: row.subcategorySlug,
      subcategoryName: row.subcategoryName
    };
    targetBySlug.set(`${row.categorySlug}/${row.subcategorySlug}`, target);

    if (!fallbackByCategorySlug.has(row.categorySlug)) {
      fallbackByCategorySlug.set(row.categorySlug, target);
    }
  }

  const ruleKeys = new Set(
    rules.map((rule) =>
      [rule.pattern, rule.matchType, rule.categorySlug, rule.subcategorySlug].join("|")
    )
  );
  for (const rule of defaultCategorizationRules) {
    if (!isPublicTaxonomyTarget(rule.categorySlug, rule.subcategorySlug)) {
      continue;
    }

    const target = targetBySlug.get(`${rule.categorySlug}/${rule.subcategorySlug}`);
    const key = [rule.pattern, rule.matchType, rule.categorySlug, rule.subcategorySlug].join("|");
    if (!target || ruleKeys.has(key)) {
      continue;
    }

    rules.push({
      pattern: rule.pattern,
      matchType: rule.matchType,
      priority: rule.priority,
      categoryId: target.categoryId,
      categorySlug: target.categorySlug,
      categoryName: target.categoryName,
      subcategoryId: target.subcategoryId,
      subcategorySlug: target.subcategorySlug,
      subcategoryName: target.subcategoryName
    });
    ruleKeys.add(key);
  }
  rules.sort((a, b) => a.priority - b.priority || b.pattern.length - a.pattern.length);

  return {
    rules,
    fallbackByCategorySlug
  };
}
