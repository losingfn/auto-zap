import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { catalogCategories } from "@/config/categories";
import { categories, catalogVersions, products, subcategories } from "@/db/schema";
import type {
  PublicCategory,
  PublicProductDetails,
  PublicProductListItem,
  PublicSubcategory
} from "./types";

const ALL_ASSORTMENT_SLUG = "ves-assortiment";
const ALL_PRODUCTS_SUBCATEGORY_SLUG = "vse-tovary";

export function getStaticPublicCategories(): PublicCategory[] {
  return catalogCategories.map((category) => ({
    slug: category.slug,
    name: category.name,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isAllAssortment: "isAllAssortment" in category ? category.isAllAssortment : false
  }));
}

export async function getCategoryBySlug(categorySlug: string) {
  const [category] = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      sortOrder: categories.sortOrder,
      isAllAssortment: categories.isAllAssortment
    })
    .from(categories)
    .where(and(eq(categories.slug, categorySlug), eq(categories.isActive, true)))
    .limit(1);

  return category ?? null;
}

export async function getSubcategoriesForCategory(categorySlug: string): Promise<{
  category: PublicCategory | null;
  subcategories: PublicSubcategory[];
}> {
  const category = await getCategoryBySlug(categorySlug);
  if (!category) {
    return { category: null, subcategories: [] };
  }

  const activeVersionId = await getActiveCatalogVersionId();
  const staticCategory = catalogCategories.find((item) => item.slug === category.slug);
  const publicCategory: PublicCategory = {
    id: category.id,
    slug: category.slug,
    name: category.name,
    icon: staticCategory?.icon ?? "/assets/categories/ves-assortiment.svg",
    description: category.description,
    sortOrder: category.sortOrder,
    isAllAssortment: category.isAllAssortment
  };

  if (category.slug === ALL_ASSORTMENT_SLUG) {
    return {
      category: publicCategory,
      subcategories: [
        {
          slug: ALL_PRODUCTS_SUBCATEGORY_SLUG,
          name: "Все товары",
          productCount: activeVersionId ? await countProducts(activeVersionId) : 0
        }
      ]
    };
  }

  const rows = await db
    .select({
      id: subcategories.id,
      slug: subcategories.slug,
      name: subcategories.name,
      description: subcategories.description
    })
    .from(subcategories)
    .where(and(eq(subcategories.categoryId, category.id), eq(subcategories.isActive, true)))
    .orderBy(asc(subcategories.sortOrder), asc(subcategories.name));

  const items = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      productCount: activeVersionId ? await countProducts(activeVersionId, row.id) : 0
    }))
  );

  return {
    category: publicCategory,
    subcategories: items
  };
}

export async function getProductsForSubcategory(
  categorySlug: string,
  subcategorySlug: string
): Promise<{
  category: PublicCategory | null;
  subcategory: PublicSubcategory | null;
  products: PublicProductListItem[];
}> {
  const category = await getCategoryBySlug(categorySlug);
  const activeVersionId = await getActiveCatalogVersionId();
  if (!category || !activeVersionId) {
    return { category: null, subcategory: null, products: [] };
  }

  const staticCategory = catalogCategories.find((item) => item.slug === category.slug);
  const publicCategory: PublicCategory = {
    id: category.id,
    slug: category.slug,
    name: category.name,
    icon: staticCategory?.icon ?? "/assets/categories/ves-assortiment.svg",
    description: category.description,
    sortOrder: category.sortOrder,
    isAllAssortment: category.isAllAssortment
  };

  if (category.slug === ALL_ASSORTMENT_SLUG && subcategorySlug === ALL_PRODUCTS_SUBCATEGORY_SLUG) {
    const productRows = await getProductRows(activeVersionId);
    return {
      category: publicCategory,
      subcategory: {
        slug: ALL_PRODUCTS_SUBCATEGORY_SLUG,
        name: "Все товары",
        productCount: productRows.length
      },
      products: productRows
    };
  }

  const [subcategory] = await db
    .select({
      id: subcategories.id,
      slug: subcategories.slug,
      name: subcategories.name,
      description: subcategories.description
    })
    .from(subcategories)
    .where(
      and(
        eq(subcategories.categoryId, category.id),
        eq(subcategories.slug, subcategorySlug),
        eq(subcategories.isActive, true)
      )
    )
    .limit(1);

  if (!subcategory) {
    return { category: publicCategory, subcategory: null, products: [] };
  }

  const productRows = await getProductRows(activeVersionId, subcategory.id);
  return {
    category: publicCategory,
    subcategory: {
      id: subcategory.id,
      slug: subcategory.slug,
      name: subcategory.name,
      description: subcategory.description,
      productCount: productRows.length
    },
    products: productRows
  };
}

export async function getProductDetails(
  categorySlug: string,
  subcategorySlug: string,
  productSlug: string
): Promise<PublicProductDetails | null> {
  const activeVersionId = await getActiveCatalogVersionId();
  if (!activeVersionId) {
    return null;
  }

  const [row] = await db
    .select({
      id: products.id,
      shopCode: products.shopCode,
      name: products.name,
      rawName: products.rawName,
      slug: products.slug,
      price: products.price,
      categorySlug: categories.slug,
      categoryName: categories.name,
      subcategorySlug: subcategories.slug,
      subcategoryName: subcategories.name
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(subcategories, eq(subcategories.id, products.subcategoryId))
    .where(
      and(
        eq(products.catalogVersionId, activeVersionId),
        eq(products.status, "active"),
        eq(products.slug, productSlug)
      )
    )
    .limit(1);

  if (!row) {
    return null;
  }

  if (categorySlug !== ALL_ASSORTMENT_SLUG && row.categorySlug !== categorySlug) {
    return null;
  }

  if (
    categorySlug !== ALL_ASSORTMENT_SLUG &&
    subcategorySlug !== ALL_PRODUCTS_SUBCATEGORY_SLUG &&
    row.subcategorySlug !== subcategorySlug
  ) {
    return null;
  }

  return {
    ...row,
    price: Number(row.price)
  };
}

async function getActiveCatalogVersionId() {
  const [activeVersion] = await db
    .select({ id: catalogVersions.id })
    .from(catalogVersions)
    .where(eq(catalogVersions.status, "active"))
    .orderBy(desc(catalogVersions.publishedAt), desc(catalogVersions.createdAt))
    .limit(1);

  return activeVersion?.id ?? null;
}

async function countProducts(activeVersionId: string, subcategoryId?: string) {
  const where = [
    eq(products.catalogVersionId, activeVersionId),
    eq(products.status, "active")
  ];

  if (subcategoryId) {
    where.push(eq(products.subcategoryId, subcategoryId));
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(and(...where));

  return Number(result?.count ?? 0);
}

async function getProductRows(activeVersionId: string, subcategoryId?: string) {
  const where = [
    eq(products.catalogVersionId, activeVersionId),
    eq(products.status, "active")
  ];

  if (subcategoryId) {
    where.push(eq(products.subcategoryId, subcategoryId));
  }

  const rows = await db
    .select({
      id: products.id,
      shopCode: products.shopCode,
      name: products.name,
      slug: products.slug,
      price: products.price,
      categorySlug: categories.slug,
      categoryName: categories.name,
      subcategorySlug: subcategories.slug,
      subcategoryName: subcategories.name
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(subcategories, eq(subcategories.id, products.subcategoryId))
    .where(and(...where))
    .orderBy(asc(products.name))
    .limit(200);

  return rows.map((row) => ({
    ...row,
    price: Number(row.price)
  }));
}
