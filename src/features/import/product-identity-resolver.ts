import { randomUUID } from "node:crypto";
import type { AnalyzedImportRow, ExistingProductSnapshot } from "./types";

export type ProductIdentityResolution =
  | {
      kind: "existing";
      productIdentityId: string;
    }
  | {
      kind: "new";
      productIdentityId: string;
    }
  | {
      kind: "conflict";
      existingProductIdentityId: string;
      existingProductName: string;
    };

export type ProductIdentityResolutionRun = {
  resolutionFor: (row: AnalyzedImportRow) => ProductIdentityResolution | undefined;
  isIdentityConflict: (row: AnalyzedImportRow) => boolean;
  newProductIdentityIds: readonly string[];
};

export class ProductIdentityFoundationError extends Error {
  constructor(shopCode: string) {
    super(`В активном каталоге для артикула ${shopCode} отсутствует постоянная identity.`);
    this.name = "ProductIdentityFoundationError";
  }
}

export function createProductIdentityResolutionRun({
  rows,
  existingProducts,
  createIdentityId = randomUUID
}: {
  rows: AnalyzedImportRow[];
  existingProducts: ExistingProductSnapshot[];
  createIdentityId?: () => string;
}): ProductIdentityResolutionRun {
  const existingByCode = new Map(existingProducts.map((product) => [product.shopCode, product]));
  const resolutions = new Map<AnalyzedImportRow, ProductIdentityResolution>();
  const newProductIdentityIds: string[] = [];

  for (const row of rows) {
    if (!isIdentityResolvableImportRow(row)) {
      continue;
    }

    const existingProduct = existingByCode.get(row.shopCode);
    if (!existingProduct) {
      const productIdentityId = createIdentityId();
      newProductIdentityIds.push(productIdentityId);
      resolutions.set(row, { kind: "new", productIdentityId });
      continue;
    }

    if (!existingProduct.productIdentityId) {
      throw new ProductIdentityFoundationError(row.shopCode);
    }

    if (isSameNormalizedProductName(row.name, existingProduct.name)) {
      resolutions.set(row, {
        kind: "existing",
        productIdentityId: existingProduct.productIdentityId
      });
      continue;
    }

    resolutions.set(row, {
      kind: "conflict",
      existingProductIdentityId: existingProduct.productIdentityId,
      existingProductName: existingProduct.name
    });
  }

  return {
    resolutionFor(row) {
      return resolutions.get(row);
    },
    isIdentityConflict(row) {
      return resolutions.get(row)?.kind === "conflict";
    },
    newProductIdentityIds
  };
}

export function normalizeProductIdentityName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[-\u2010-\u2015_.,;:!?()[\]{}"'`«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSameNormalizedProductName(
  incomingName: string | null | undefined,
  existingName: string | null | undefined
) {
  const normalizedIncoming = normalizeProductIdentityName(incomingName);
  return Boolean(normalizedIncoming) && normalizedIncoming === normalizeProductIdentityName(existingName);
}

export function isIdentityResolvableImportRow(row: AnalyzedImportRow): row is AnalyzedImportRow & {
  shopCode: string;
} {
  return Boolean(
    row.shopCode &&
      row.price !== null &&
      (row.status === "valid" || row.status === "needs_review")
  );
}

export function buildIdentityConflictReason(
  row: Pick<AnalyzedImportRow, "shopCode" | "name">,
  resolution: Extract<ProductIdentityResolution, { kind: "conflict" }>
) {
  return `identity_conflict: артикул ${row.shopCode} уже связан с другим названием «${resolution.existingProductName}». Выберите: это тот же товар или новая товарная позиция.`;
}
