export type CatalogNavigationContext = "purchase-list" | "purchase-list-direct" | null;

export function getCatalogNavigationContext(
  value: string | null | undefined
): CatalogNavigationContext {
  if (value === "purchase-list" || value === "purchase-list-direct") {
    return value;
  }

  return null;
}

export function withCatalogNavigationContext(
  href: string,
  context: CatalogNavigationContext
): string {
  if (!context) {
    return href;
  }

  const [pathname, query = ""] = href.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("from", context);

  return `${pathname}?${params.toString()}`;
}
