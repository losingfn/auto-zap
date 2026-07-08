export type CatalogCategorySlug =
  | "podveska"
  | "elektrika"
  | "filtry-i-masla"
  | "tormoznaya-sistema"
  | "kuzov-i-optika"
  | "dvigatel-i-transmissiya"
  | "aksessuary"
  | "ves-assortiment";

export type CatalogVersionStatus = "draft" | "active" | "archived" | "rolled_back";

export type ProductStatus = "active" | "archived" | "needs_review" | "invalid";

export type ImportStatus = "uploaded" | "analyzed" | "published" | "cancelled" | "failed";
