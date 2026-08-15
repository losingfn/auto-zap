export const SEARCH_PAGE_SIZE = 30;

const MAX_SAFE_SEARCH_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / SEARCH_PAGE_SIZE) + 1;

export function parseSearchPage(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return 1;
  }

  const page = Number(value);
  return Number.isSafeInteger(page) && page <= MAX_SAFE_SEARCH_PAGE ? page : 1;
}

export function getSearchOffset(page: number, pageSize = SEARCH_PAGE_SIZE) {
  return (page - 1) * pageSize;
}

export function getSearchTotalPages(accessibleTotal: number, pageSize = SEARCH_PAGE_SIZE) {
  if (!Number.isFinite(accessibleTotal) || accessibleTotal <= 0) {
    return 0;
  }

  return Math.ceil(accessibleTotal / pageSize);
}

export function getAccessibleSearchPage(requestedPage: number, totalPages: number) {
  return totalPages > 0 && requestedPage > totalPages ? totalPages : requestedPage;
}

export function getAccessibleTotal(total: number, maximumAccessibleHits: number) {
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return Math.min(Math.floor(total), maximumAccessibleHits);
}

export function getSearchPageHref(query: string, page: number) {
  const params = new URLSearchParams();
  params.set("q", query.trim());

  if (page > 1) {
    params.set("page", String(page));
  }

  return `/search?${params.toString()}`;
}

export function visibleSearchPages(currentPage: number, totalPages: number) {
  const result: Array<number | "gap"> = [];
  const pageSet = new Set<number>([1, totalPages]);

  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
    if (page >= 1 && page <= totalPages) {
      pageSet.add(page);
    }
  }

  const sorted = [...pageSet].sort((a, b) => a - b);
  for (const page of sorted) {
    const previous = result[result.length - 1];
    if (typeof previous === "number" && page - previous > 1) {
      result.push("gap");
    }
    result.push(page);
  }

  return result;
}

export function getSearchPageSlice<T>(hits: T[], page: number, pageSize = SEARCH_PAGE_SIZE) {
  const offset = getSearchOffset(page, pageSize);
  return hits.slice(offset, offset + pageSize);
}
