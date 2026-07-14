import { catalogTaxonomy } from "./catalog-taxonomy";
import { catalogCategories } from "./categories";

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

export function getPublicCategorySlugs() {
  return [...publicCategorySlugSet];
}

export function getPublicTaxonomyTargets() {
  return [...publicTargetSet].map((value) => {
    const [categorySlug, subcategorySlug] = value.split("/");
    return { categorySlug, subcategorySlug };
  });
}
