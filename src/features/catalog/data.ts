import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { catalogCategories } from "@/config/categories";
import { categories, catalogVersions, products, subcategories } from "@/db/schema";
import type {
  PublicCategory,
  PublicProductDetails,
  PublicProductListItem,
  PublicProductPagination,
  PublicSubcategory
} from "./types";
import { searchProducts } from "@/features/search/service";

const ALL_ASSORTMENT_SLUG = "ves-assortiment";
const ALL_PRODUCTS_SUBCATEGORY_SLUG = "vse-tovary";
const DEFAULT_PRODUCTS_PAGE_SIZE = 50;
const PUBLIC_CATALOG_TIMEOUT_MS = 3500;

export function getStaticPublicCategories(): PublicCategory[] {
  return catalogCategories.map((category) => ({
    slug: category.slug,
    name: category.name,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isAllAssortment: "isAllAssortment" in category ? category.isAllAssortment : false
  }));
}

function categoryIconBySlug(slug: string) {
  return (
    catalogCategories.find((item) => item.slug === slug)?.icon ??
    "/assets/categories/ves-assortiment.png"
  );
}

function staticCategoryBySlug(slug: string) {
  return catalogCategories.find((item) => item.slug === slug);
}

function publicCategoryFromStatic(slug: string): PublicCategory | null {
  const category = staticCategoryBySlug(slug);
  if (!category) {
    return null;
  }

  return {
    slug: category.slug,
    name: category.name,
    icon: category.icon,
    description: null,
    sortOrder: category.sortOrder,
    isAllAssortment: "isAllAssortment" in category ? category.isAllAssortment : false
  };
}

function withCatalogTimeout<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.error(`[catalog] ${label} timed out after ${PUBLIC_CATALOG_TIMEOUT_MS}ms`);
      resolve(fallback);
    }, PUBLIC_CATALOG_TIMEOUT_MS);

    promise
      .then((result) => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeout);
        console.error(`[catalog] ${label} failed`, error);
        resolve(fallback);
      });
  });
}

export async function getCategoryBySlug(categorySlug: string) {
  const [category] = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name
    })
    .from(categories)
    .where(eq(categories.slug, categorySlug))
    .limit(1);

  return category ?? null;
}

export async function getSubcategoriesForCategory(categorySlug: string): Promise<{
  category: PublicCategory | null;
  subcategories: PublicSubcategory[];
}> {
  return withCatalogTimeout(
    loadSubcategoriesForCategory(categorySlug),
    { category: publicCategoryFromStatic(categorySlug), subcategories: [] },
    `category ${categorySlug}`
  );
}

async function loadSubcategoriesForCategory(categorySlug: string): Promise<{
  category: PublicCategory | null;
  subcategories: PublicSubcategory[];
}> {
  try {
    const category = await getCategoryBySlug(categorySlug);
    if (!category) {
      return { category: null, subcategories: [] };
    }

    const activeVersionId = await getActiveCatalogVersionId();
    const staticCategory = staticCategoryBySlug(category.slug);
    const publicCategory: PublicCategory = {
      id: category.id,
      slug: category.slug,
      name: staticCategory?.name ?? category.name,
      icon: categoryIconBySlug(category.slug),
      description: null,
      sortOrder: staticCategory?.sortOrder ?? 0,
      isAllAssortment: category.slug === ALL_ASSORTMENT_SLUG
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
        name: subcategories.name
      })
      .from(subcategories)
      .where(eq(subcategories.categoryId, category.id))
      .orderBy(asc(subcategories.name));

    const items = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: null,
        productCount: activeVersionId ? await countProducts(activeVersionId, row.id) : 0
      }))
    );

    return {
      category: publicCategory,
      subcategories: items
    };
  } catch (error) {
    console.error("[catalog] failed to load category", { categorySlug, error });
    return { category: publicCategoryFromStatic(categorySlug), subcategories: [] };
  }
}

export async function getProductsForSubcategory(
  categorySlug: string,
  subcategorySlug: string,
  options: { page?: number; pageSize?: number; query?: string } = {}
): Promise<{
  category: PublicCategory | null;
  subcategory: PublicSubcategory | null;
  products: PublicProductListItem[];
  pagination: PublicProductPagination;
}> {
  const pageSize = Math.max(1, Math.min(options.pageSize ?? DEFAULT_PRODUCTS_PAGE_SIZE, 100));
  const page = Math.max(1, options.page ?? 1);
  const searchQuery = options.query?.trim() ?? "";
  const emptyPagination = { page, pageSize, totalItems: 0, totalPages: 1 };

  return withCatalogTimeout(
    loadProductsForSubcategory({
      categorySlug,
      subcategorySlug,
      page,
      pageSize,
      searchQuery,
      emptyPagination
    }),
    {
      category: publicCategoryFromStatic(categorySlug),
      subcategory: null,
      products: [],
      pagination: emptyPagination
    },
    `subcategory ${categorySlug}/${subcategorySlug}`
  );
}

async function loadProductsForSubcategory({
  categorySlug,
  subcategorySlug,
  page,
  pageSize,
  searchQuery,
  emptyPagination
}: {
  categorySlug: string;
  subcategorySlug: string;
  page: number;
  pageSize: number;
  searchQuery: string;
  emptyPagination: PublicProductPagination;
}): Promise<{
  category: PublicCategory | null;
  subcategory: PublicSubcategory | null;
  products: PublicProductListItem[];
  pagination: PublicProductPagination;
}> {
  try {
    const category = await getCategoryBySlug(categorySlug);
    const activeVersionId = await getActiveCatalogVersionId();
    if (!category || !activeVersionId) {
      return { category: null, subcategory: null, products: [], pagination: emptyPagination };
    }

    const staticCategory = staticCategoryBySlug(category.slug);
    const publicCategory: PublicCategory = {
      id: category.id,
      slug: category.slug,
      name: staticCategory?.name ?? category.name,
      icon: categoryIconBySlug(category.slug),
      description: null,
      sortOrder: staticCategory?.sortOrder ?? 0,
      isAllAssortment: category.slug === ALL_ASSORTMENT_SLUG
    };

    if (category.slug === ALL_ASSORTMENT_SLUG && subcategorySlug === ALL_PRODUCTS_SUBCATEGORY_SLUG) {
      const totalItems = await countProducts(activeVersionId);
      const pagination = buildPagination({ page, pageSize, totalItems });
      if (searchQuery) {
        const searchRows = await getSearchProductRows({
          query: searchQuery,
          page: pagination.page,
          pageSize,
          categorySlug: undefined,
          subcategorySlug: undefined
        });
        return {
          category: publicCategory,
          subcategory: {
            slug: ALL_PRODUCTS_SUBCATEGORY_SLUG,
            name: "Все товары",
            productCount: searchRows.pagination.totalItems
          },
          products: searchRows.products,
          pagination: searchRows.pagination
        };
      }

      const productRows = await getProductRows(activeVersionId, undefined, pagination);
      return {
        category: publicCategory,
        subcategory: {
          slug: ALL_PRODUCTS_SUBCATEGORY_SLUG,
          name: "Все товары",
          productCount: totalItems
        },
        products: productRows,
        pagination
      };
    }

    const [subcategory] = await db
      .select({
        id: subcategories.id,
        slug: subcategories.slug,
        name: subcategories.name
      })
      .from(subcategories)
      .where(
        and(
          eq(subcategories.categoryId, category.id),
          eq(subcategories.slug, subcategorySlug)
        )
      )
      .limit(1);

    if (!subcategory) {
      return { category: publicCategory, subcategory: null, products: [], pagination: emptyPagination };
    }

    const totalItems = await countProducts(activeVersionId, subcategory.id);
    const pagination = buildPagination({ page, pageSize, totalItems });
    if (searchQuery) {
      const searchRows = await getSearchProductRows({
        query: searchQuery,
        page: pagination.page,
        pageSize,
        categorySlug: category.slug,
        subcategorySlug: subcategory.slug
      });
      return {
        category: publicCategory,
        subcategory: {
          id: subcategory.id,
          slug: subcategory.slug,
          name: subcategory.name,
          description: null,
          productCount: searchRows.pagination.totalItems
        },
        products: searchRows.products,
        pagination: searchRows.pagination
      };
    }

    const productRows = await getProductRows(activeVersionId, subcategory.id, pagination);
    return {
      category: publicCategory,
      subcategory: {
        id: subcategory.id,
        slug: subcategory.slug,
        name: subcategory.name,
        description: null,
        productCount: totalItems
      },
      products: productRows,
      pagination
    };
  } catch (error) {
    console.error("[catalog] failed to load subcategory products", {
      categorySlug,
      subcategorySlug,
      error
    });
    return {
      category: publicCategoryFromStatic(categorySlug),
      subcategory: null,
      products: [],
      pagination: emptyPagination
    };
  }
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

async function getProductRows(
  activeVersionId: string,
  subcategoryId: string | undefined,
  pagination: Pick<PublicProductPagination, "page" | "pageSize">
) {
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
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize);

  return rows.map((row) => ({
    ...row,
    price: Number(row.price)
  }));
}

async function getSearchProductRows({
  query,
  page,
  pageSize,
  categorySlug,
  subcategorySlug
}: {
  query: string;
  page: number;
  pageSize: number;
  categorySlug?: string;
  subcategorySlug?: string;
}): Promise<{ products: PublicProductListItem[]; pagination: PublicProductPagination }> {
  const result = await searchProducts({
    query,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    categorySlug,
    subcategorySlug
  });
  const pagination = buildPagination({ page, pageSize, totalItems: result.total });

  return {
    products: result.hits.map((hit) => ({
      id: hit.id,
      name: hit.name,
      slug: hit.slug,
      price: hit.price,
      categorySlug: hit.categorySlug,
      categoryName: hit.categoryName,
      subcategorySlug: hit.subcategorySlug,
      subcategoryName: hit.subcategoryName
    })),
    pagination
  };
}

function buildPagination({
  page,
  pageSize,
  totalItems
}: {
  page: number;
  pageSize: number;
  totalItems: number;
}): PublicProductPagination {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return {
    page: Math.min(page, totalPages),
    pageSize,
    totalItems,
    totalPages
  };
}
