import { catalogTaxonomy } from "./catalog-taxonomy";
import { catalogCategories } from "./categories";

export const ALL_ASSORTMENT_CATEGORY_SLUG = "ves-assortiment";
export const ALL_PRODUCTS_SUBCATEGORY_SLUG = "vse-tovary";
export const OTHER_PRODUCTS_SUBCATEGORY_SLUG = "other-products";
export const OTHER_PRODUCTS_SUBCATEGORY_NAME = "Прочие товары";

export const deprecatedPublicCategorySlugs: ReadonlySet<string> = new Set(["krepezh"]);

const publicCategorySlugSet: ReadonlySet<string> = new Set(
  catalogCategories
    .map((category) => category.slug)
    .filter((slug) => !deprecatedPublicCategorySlugs.has(slug))
);

const publicTargetSet: ReadonlySet<string> = new Set(
  catalogTaxonomy.flatMap((category) =>
    category.subcategories.map(([subcategorySlug]) => `${category.slug}/${subcategorySlug}`)
  )
);

export function isPublicCategorySlug(slug: string | null | undefined) {
  return Boolean(slug && publicCategorySlugSet.has(slug));
}

export function isPublicTaxonomyTarget(
  categorySlug: string | null | undefined,
  subcategorySlug: string | null | undefined
) {
  return Boolean(
    categorySlug &&
      subcategorySlug &&
      publicCategorySlugSet.has(categorySlug) &&
      publicTargetSet.has(`${categorySlug}/${subcategorySlug}`)
  );
}

export function isOtherProductsTarget(
  categorySlug: string | null | undefined,
  subcategorySlug: string | null | undefined
) {
  return (
    categorySlug === ALL_ASSORTMENT_CATEGORY_SLUG &&
    subcategorySlug === OTHER_PRODUCTS_SUBCATEGORY_SLUG
  );
}

export function isHiddenPublicSubcategory(
  categorySlug: string | null | undefined,
  subcategorySlug: string | null | undefined
) {
  return isOtherProductsTarget(categorySlug, subcategorySlug);
}

export function isPublicNavigationTaxonomyTarget(
  categorySlug: string | null | undefined,
  subcategorySlug: string | null | undefined
) {
  return (
    isPublicTaxonomyTarget(categorySlug, subcategorySlug) &&
    !isHiddenPublicSubcategory(categorySlug, subcategorySlug)
  );
}

export function getPublicCategorySlugs() {
  return [...publicCategorySlugSet];
}

export function getPublicTaxonomyTargets() {
  return [...publicTargetSet].map((value) => {
    const [categorySlug, subcategorySlug] = value.split("/");
    return { categorySlug, subcategorySlug };
  });
}

export function getPublicNavigationTaxonomyTargets() {
  return getPublicTaxonomyTargets().filter((target) =>
    isPublicNavigationTaxonomyTarget(target.categorySlug, target.subcategorySlug)
  );
}

export function getPublicProductPath(product: {
  categorySlug: string;
  subcategorySlug: string;
  slug: string;
}) {
  if (isOtherProductsTarget(product.categorySlug, product.subcategorySlug)) {
    return `/${[
      "catalog",
      ALL_ASSORTMENT_CATEGORY_SLUG,
      ALL_PRODUCTS_SUBCATEGORY_SLUG,
      product.slug
    ].join("/")}`;
  }

  return `/catalog/${product.categorySlug}/${product.subcategorySlug}/${product.slug}`;
}

export function formatPublicTargetLabel(target: {
  categorySlug: string;
  categoryName: string;
  subcategorySlug: string;
  subcategoryName: string;
}) {
  if (isOtherProductsTarget(target.categorySlug, target.subcategorySlug)) {
    return target.subcategoryName || OTHER_PRODUCTS_SUBCATEGORY_NAME;
  }

  return `${target.categoryName} → ${target.subcategoryName}`;
}
