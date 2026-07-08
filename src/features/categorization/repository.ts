import { asc, eq } from "drizzle-orm";
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
      subcategoryName: subcategories.name
    })
    .from(categorizationRules)
    .innerJoin(categories, eq(categories.id, categorizationRules.categoryId))
    .innerJoin(subcategories, eq(subcategories.id, categorizationRules.subcategoryId))
    .where(eq(categorizationRules.isActive, true))
    .orderBy(asc(categorizationRules.priority));

  const rules: CategorizationRuleRecord[] = rows.map((row) => ({
    id: row.id,
    pattern: row.pattern,
    matchType: row.matchType,
    priority: row.priority,
    categoryId: row.categoryId,
    categorySlug: row.categorySlug,
    categoryName: row.categoryName,
    subcategoryId: row.subcategoryId,
    subcategorySlug: row.subcategorySlug,
    subcategoryName: row.subcategoryName
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
    .where(eq(subcategories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(subcategories.sortOrder));

  const fallbackByCategorySlug = new Map<string, CategorizationTarget>();
  for (const row of fallbackRows) {
    if (!fallbackByCategorySlug.has(row.categorySlug)) {
      fallbackByCategorySlug.set(row.categorySlug, {
        categoryId: row.categoryId,
        categorySlug: row.categorySlug,
        categoryName: row.categoryName,
        subcategoryId: row.subcategoryId,
        subcategorySlug: row.subcategorySlug,
        subcategoryName: row.subcategoryName
      });
    }
  }

  return {
    rules,
    fallbackByCategorySlug
  };
}
