export interface PublicCategory {
  id?: string;
  slug: string;
  name: string;
  icon: string;
  description?: string | null;
  productCount?: number;
  sortOrder: number;
  isAllAssortment?: boolean;
}

export interface PublicSubcategory {
  id?: string;
  slug: string;
  name: string;
  description?: string | null;
  productCount: number;
}

export interface PublicProductListItem {
  id: string;
  name: string;
  slug: string;
  price: number;
  categorySlug: string;
  categoryName: string;
  subcategorySlug: string;
  subcategoryName: string;
}

export interface PublicProductDetails extends PublicProductListItem {
  rawName: string;
}

export interface PublicProductPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
