import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { catalogVersions, categories, products, reviewQueue, subcategories } from "@/db/schema";
import { suggestRulePatternForProduct } from "@/features/categorization/learning";

export type AdminReviewCategoryOption = {
  id: string;
  name: string;
  slug: string;
  subcategories: {
    id: string;
    name: string;
    slug: string;
  }[];
};

export type AdminReviewItem = {
  reviewId: string;
  productId: string;
  reason: string;
  createdAt: Date;
  catalogVersionStatus: string;
  shopCode: string;
  name: string;
  rawName: string;
  price: number;
  currentCategoryId: string | null;
  currentSubcategoryId: string | null;
  suggestedCategoryId: string | null;
  suggestedSubcategoryId: string | null;
  suggestedCategoryName: string | null;
  suggestedSubcategoryName: string | null;
  rulePattern: string | null;
};

export async function getAdminReviewPageData() {
  const [countRows, categoryRows, subcategoryRows, reviewRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(reviewQueue)
      .innerJoin(catalogVersions, eq(catalogVersions.id, reviewQueue.catalogVersionId))
      .where(
        and(
          eq(reviewQueue.status, "open"),
          inArray(catalogVersions.status, ["draft", "active"])
        )
      ),
    db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        sortOrder: categories.sortOrder
      })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    db
      .select({
        id: subcategories.id,
        categoryId: subcategories.categoryId,
        slug: subcategories.slug,
        name: subcategories.name,
        sortOrder: subcategories.sortOrder
      })
      .from(subcategories)
      .where(eq(subcategories.isActive, true))
      .orderBy(asc(subcategories.sortOrder), asc(subcategories.name)),
    db
      .select({
        reviewId: reviewQueue.id,
        reason: reviewQueue.reason,
        createdAt: reviewQueue.createdAt,
        suggestedCategoryId: reviewQueue.suggestedCategoryId,
        suggestedSubcategoryId: reviewQueue.suggestedSubcategoryId,
        productId: products.id,
        shopCode: products.shopCode,
        name: products.name,
        rawName: products.rawName,
        price: products.price,
        currentCategoryId: products.categoryId,
        currentSubcategoryId: products.subcategoryId,
        catalogVersionStatus: catalogVersions.status
      })
      .from(reviewQueue)
      .innerJoin(products, eq(products.id, reviewQueue.productId))
      .innerJoin(catalogVersions, eq(catalogVersions.id, reviewQueue.catalogVersionId))
      .where(
        and(
          eq(reviewQueue.status, "open"),
          inArray(catalogVersions.status, ["draft", "active"])
        )
      )
      .orderBy(desc(catalogVersions.createdAt), asc(reviewQueue.createdAt))
      .limit(20)
  ]);

  const categoryOptions = buildCategoryOptions(categoryRows, subcategoryRows);
  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));
  const subcategoryById = new Map(subcategoryRows.map((subcategory) => [subcategory.id, subcategory]));

  return {
    queueCount: Number(countRows[0]?.count ?? 0),
    categories: categoryOptions,
    items: reviewRows.map((row): AdminReviewItem => {
      const suggestedCategory = row.suggestedCategoryId
        ? categoryById.get(row.suggestedCategoryId)
        : null;
      const suggestedSubcategory = row.suggestedSubcategoryId
        ? subcategoryById.get(row.suggestedSubcategoryId)
        : null;

      return {
        reviewId: row.reviewId,
        productId: row.productId,
        reason: row.reason,
        createdAt: row.createdAt,
        catalogVersionStatus: row.catalogVersionStatus,
        shopCode: row.shopCode,
        name: row.name,
        rawName: row.rawName,
        price: Number(row.price),
        currentCategoryId: row.currentCategoryId,
        currentSubcategoryId: row.currentSubcategoryId,
        suggestedCategoryId: row.suggestedCategoryId,
        suggestedSubcategoryId: row.suggestedSubcategoryId,
        suggestedCategoryName: suggestedCategory?.name ?? null,
        suggestedSubcategoryName: suggestedSubcategory?.name ?? null,
        rulePattern: suggestRulePatternForProduct(row.name)
      };
    })
  };
}

function buildCategoryOptions(
  categoryRows: {
    id: string;
    name: string;
    slug: string;
  }[],
  subcategoryRows: {
    id: string;
    categoryId: string;
    name: string;
    slug: string;
  }[]
): AdminReviewCategoryOption[] {
  const subcategoriesByCategory = new Map<string, AdminReviewCategoryOption["subcategories"]>();
  for (const subcategory of subcategoryRows) {
    const items = subcategoriesByCategory.get(subcategory.categoryId) ?? [];
    items.push({
      id: subcategory.id,
      name: subcategory.name,
      slug: subcategory.slug
    });
    subcategoriesByCategory.set(subcategory.categoryId, items);
  }

  return categoryRows.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    subcategories: subcategoriesByCategory.get(category.id) ?? []
  }));
}
